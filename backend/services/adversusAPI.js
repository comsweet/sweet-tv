const axios = require('axios');
const postgres = require('./postgres');

class AdversusAPI {
  constructor() {
    this.baseURL = 'https://api.adversus.dk/v1';
    this.username = process.env.ADVERSUS_USERNAME;
    this.password = process.env.ADVERSUS_PASSWORD;
    this.auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');

    // Rate limiting
    this.lastRequestTime = 0;
    this.minRequestInterval = 3000; // 3s mellan requests (Adversus burst limit är sträng!)

    // Concurrent request limiting (max 2 samtidigt)
    this.requestQueue = [];
    this.activeRequests = 0;
    this.maxConcurrent = 2;

    // 🛡️ User cache - fallback when rate limited
    this.lastSuccessfulUsers = null;
    this.lastSuccessfulUsersTimestamp = 0;
    this.usersCacheMaxAge = 5 * 60 * 1000; // 5 minutes

    // 🛡️ Groups cache - fallback when rate limited
    this.lastSuccessfulGroups = null;
    this.lastSuccessfulGroupsTimestamp = 0;
    this.groupsCacheMaxAge = 5 * 60 * 1000; // 5 minutes
  }

  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  async waitForConcurrentSlot() {
    // Vänta tills det finns plats (< 2 aktiva requests)
    while (this.activeRequests >= this.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async request(endpoint, options = {}) {
    // Vänta på både rate limit OCH concurrent slot
    await this.waitForConcurrentSlot();
    await this.waitForRateLimit();

    this.activeRequests++;

    const startTime = Date.now();
    let statusCode = 0;
    const method = options.method || 'GET';

    try {
      const axiosConfig = {
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30s timeout
      };

      let response;

      if (method === 'POST') {
        // POST request with data in body
        response = await axios.post(
          `${this.baseURL}${endpoint}`,
          options.data || {},
          axiosConfig
        );
      } else {
        // GET request with params in query string
        axiosConfig.params = options.params || options;
        response = await axios.get(
          `${this.baseURL}${endpoint}`,
          axiosConfig
        );
      }

      statusCode = response.status;
      const responseTime = Date.now() - startTime;

      // Log successful request
      try {
        await postgres.logApiRequest({
          endpoint,
          method,
          statusCode,
          responseTime,
          userId: null,
          ipAddress: null
        });
      } catch (logError) {
        console.error('Failed to log API request:', logError.message);
      }

      return response.data;
    } catch (error) {
      statusCode = error.response?.status || 500;
      const responseTime = Date.now() - startTime;

      // Log failed request
      try {
        await postgres.logApiRequest({
          endpoint,
          method,
          statusCode,
          responseTime,
          userId: null,
          ipAddress: null
        });
      } catch (logError) {
        console.error('Failed to log API request:', logError.message);
      }

      if (error.response?.status === 429) {
        console.error('⏰ Rate limit exceeded - backing off for 10 seconds');
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait longer
        throw new Error('RATE_LIMIT_EXCEEDED');
      }

      console.error('❌ API Error:', error.message);
      throw error;
    } finally {
      this.activeRequests--;
    }
  }

  getOrderDate(lead) {
    if (!lead.resultData) return null;
    
    const orderDateField = lead.resultData.find(field => 
      field.label && field.label.toLowerCase() === 'order date'
    );
    
    if (orderDateField && orderDateField.value) {
      return new Date(orderDateField.value);
    }
    
    if (lead.lastUpdatedTime) {
      return new Date(lead.lastUpdatedTime);
    }
    
    return null;
  }

  async getSuccessLeads(fromDate) {
    const filters = {
      "status": { "$eq": "success" },
      "lastUpdatedTime": { "$gt": fromDate.toISOString() }
    };

    const params = {
      filters: JSON.stringify(filters),
      page: 1,
      pageSize: 100,
      sortProperty: 'lastUpdatedTime',
      sortDirection: 'DESC',
      includeMeta: true
    };

    return await this.request('/leads', params);
  }

  async getLeadsInDateRange(startDate, endDate) {
    // FIXAD VERSION: Tar bort dubbel buffer FÖRE, behåller buffer EFTER
    // 
    // Rolling window HAR redan buffer före (7 dagar innan månadsskifte)
    // → Vi behöver INTE lägga till extra buffer före här!
    // 
    // Buffer EFTER behövs för "week" leaderboards över månadsskifte
    // → När Nov 1 faller på fredag vill vi fånga hela veckan (Oct 28 - Nov 3)
    
    const bufferDays = 7;
    
    // ✅ INGEN buffer före - använd startDate direkt från rolling window
    const bufferStart = startDate;
    
    // ✅ BEHÅLL buffer efter för "week" leaderboards över månadsskifte
    const bufferEnd = new Date(endDate);
    bufferEnd.setDate(bufferEnd.getDate() + bufferDays);

    const filters = {
      "status": { "$eq": "success" },
      "lastUpdatedTime": { 
        "$gt": bufferStart.toISOString(),
        "$lt": bufferEnd.toISOString()
      }
    };

    console.log('🔍 Fetching leads (Order date range: %s to %s)', 
      startDate.toISOString().split('T')[0], 
      endDate.toISOString().split('T')[0]
    );
    console.log('   API query range: %s to %s (buffer after: %d days)', 
      bufferStart.toISOString().split('T')[0],
      bufferEnd.toISOString().split('T')[0],
      bufferDays
    );

    let allLeads = [];
    let currentPage = 1;
    let totalPages = 1;
    const pageSize = 1000;

    while (currentPage <= totalPages) {
      const params = {
        filters: JSON.stringify(filters),
        page: currentPage,
        pageSize: pageSize,
        sortProperty: 'lastUpdatedTime',
        sortDirection: 'DESC',
        includeMeta: true
      };

      try {
        console.log(`   📄 Page ${currentPage}/${totalPages} (${this.activeRequests} active requests)...`);
        const response = await this.request('/leads', params);
        
        const leads = response.leads || [];
        
        if (leads.length > 0) {
          allLeads.push(...leads);
          console.log(`   ✅ Got ${leads.length} leads`);
        }

        if (response.meta && response.meta.pagination) {
          const pagination = response.meta.pagination;
          totalPages = pagination.pageCount || 1;
          
          if (!pagination.nextUrl || pagination.page >= pagination.pageCount) {
            console.log(`   ✅ Last page reached`);
            break;
          }
        } else {
          break;
        }

        // Safety: Max 10 pages
        if (currentPage >= 10) {
          console.log('   ⚠️  Stopped at 10 pages (rate limit protection)');
          break;
        }

        currentPage++;

      } catch (error) {
        console.error(`   ❌ Error on page ${currentPage}:`, error.message);
        
        if (error.message === 'RATE_LIMIT_EXCEEDED') {
          console.log('   ⏸️  Stopping due to rate limit');
        }
        break;
      }
    }

    console.log(`   ✅ Fetched ${allLeads.length} total leads\n`);

    // Filter på Order date
    const filteredLeads = allLeads.filter(lead => {
      const orderDate = this.getOrderDate(lead);
      if (!orderDate) return false;
      return orderDate >= startDate && orderDate <= endDate;
    });

    console.log(`   📅 ${filteredLeads.length} leads match Order date range\n`);

    filteredLeads.sort((a, b) => {
      const dateA = this.getOrderDate(a);
      const dateB = this.getOrderDate(b);
      return dateB - dateA;
    });

    return {
      leads: filteredLeads,
      meta: {
        totalCount: filteredLeads.length,
        totalPages: currentPage,
        unfilteredCount: allLeads.length
      }
    };
  }

  async getUser(userId) {
    return await this.request(`/users/${userId}`);
  }

  async getUsers(params = {}) {
    const defaultParams = {
      page: 1,
      pageSize: 1000,
      includeMeta: true,
      ...params
    };

    console.log('👥 Fetching all users...');

    try {
      const response = await this.request('/users', defaultParams);
      console.log(`   ✅ Got ${response.users?.length || 0} users\n`);

      // 🛡️ Cache successful response
      if (response.users && response.users.length > 0) {
        this.lastSuccessfulUsers = response;
        this.lastSuccessfulUsersTimestamp = Date.now();
        console.log(`   💾 Cached ${response.users.length} users as fallback`);
      }

      return response;

    } catch (error) {
      // 🆘 FALLBACK: Use cached users if rate limited
      if (error.message === 'RATE_LIMIT_EXCEEDED' && this.lastSuccessfulUsers) {
        const cacheAge = Date.now() - this.lastSuccessfulUsersTimestamp;
        const cacheAgeMinutes = Math.round(cacheAge / 1000 / 60);

        if (cacheAge <= this.usersCacheMaxAge) {
          console.warn(`   🆘 Rate limited! Using CACHED users (${cacheAgeMinutes} min old, ${this.lastSuccessfulUsers.users.length} users)`);
          return this.lastSuccessfulUsers;
        } else {
          console.error(`   ❌ Rate limited AND cache expired (${cacheAgeMinutes} min old) - returning empty`);
          return { users: [], meta: {} };
        }
      }

      // For other errors, throw
      throw error;
    }
  }

 async getSMS(filters = {}, page = 1, pageSize = 1000) {
  const params = {
    filters: JSON.stringify(filters),
    page,
    pageSize,
    includeMeta: true, // 🔥 CRITICAL: This ensures meta is returned
    sortProperty: 'timestamp',
    sortDirection: 'DESC'
  };

  console.log(`📱 Fetching SMS page ${page} (pageSize: ${pageSize})...`);
  
  const response = await this.request('/sms', params);
  
  const smsCount = response.sms?.length || 0;
  console.log(`   ✅ Got ${smsCount} SMS`);
  
  // 🔍 DEBUG: Log meta structure
  if (response.meta) {
    console.log(`   📊 Meta:`, JSON.stringify(response.meta.pagination || response.meta, null, 2));
  } else {
    console.log(`   ⚠️  No meta in response!`);
  }

  return response;
}

  async getUserGroups(params = {}) {
    const defaultParams = {
      page: 1,
      pageSize: 1000,
      includeMeta: true,
      ...params
    };

    console.log('👥 Fetching all groups...');

    try {
      const response = await this.request('/groups', defaultParams);
      console.log(`   ✅ Got ${response.groups?.length || 0} groups\n`);

      // 🛡️ Cache successful response
      if (response.groups && response.groups.length > 0) {
        this.lastSuccessfulGroups = response;
        this.lastSuccessfulGroupsTimestamp = Date.now();
        console.log(`   💾 Cached ${response.groups.length} groups as fallback`);
      }

      return response;

    } catch (error) {
      // 🆘 FALLBACK: Use cached groups if rate limited
      if (error.message === 'RATE_LIMIT_EXCEEDED' && this.lastSuccessfulGroups) {
        const cacheAge = Date.now() - this.lastSuccessfulGroupsTimestamp;
        const cacheAgeMinutes = Math.round(cacheAge / 1000 / 60);

        if (cacheAge <= this.groupsCacheMaxAge) {
          console.warn(`   🆘 Rate limited! Using CACHED groups (${cacheAgeMinutes} min old, ${this.lastSuccessfulGroups.groups.length} groups)`);
          return this.lastSuccessfulGroups;
        } else {
          console.error(`   ❌ Rate limited AND cache expired (${cacheAgeMinutes} min old) - returning empty`);
          return { groups: [], meta: {} };
        }
      }

      // For other errors, throw
      throw error;
    }
  }

  // Alias for clarity - same as getUserGroups
  async getGroups(params = {}) {
    return await this.getUserGroups(params);
  }
}

module.exports = new AdversusAPI();
