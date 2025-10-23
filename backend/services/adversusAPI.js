const axios = require('axios');

class AdversusAPI {
  constructor() {
    this.baseURL = 'https://api.adversus.dk/v1';
    this.username = process.env.ADVERSUS_USERNAME;
    this.password = process.env.ADVERSUS_PASSWORD;
    this.auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    
    // Rate limiting
    this.lastRequestTime = 0;
    this.minRequestInterval = 1500; // 1.5 sekunder mellan requests
  }

  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      console.log(`   ⏳ Rate limit: Waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  async request(endpoint, params = {}) {
    await this.waitForRateLimit();
    
    try {
      const response = await axios.get(`${this.baseURL}${endpoint}`, {
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        },
        params
      });
      return response.data;
    } catch (error) {
      if (error.response?.status === 429) {
        console.error('⏰ Rate limit exceeded - backing off');
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 5000));
        throw new Error('RATE_LIMIT_EXCEEDED');
      }
      console.error('❌ API Error:', error.message);
      throw error;
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
    const bufferDays = 7;
    const bufferStart = new Date(startDate);
    bufferStart.setDate(bufferStart.getDate() - bufferDays);
    const bufferEnd = new Date(endDate);
    bufferEnd.setDate(bufferEnd.getDate() + bufferDays);

    const filters = {
      "status": { "$eq": "success" },
      "lastUpdatedTime": { 
        "$gt": bufferStart.toISOString(),
        "$lt": bufferEnd.toISOString()
      }
    };

    console.log('🔍 Fetching leads with broad filter (with buffer for Order date)');
    console.log(`   API Filter: ${bufferStart.toISOString()} to ${bufferEnd.toISOString()}`);
    console.log(`   Target Order Date Range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

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
        console.log(`📄 Fetching page ${currentPage}/${totalPages}...`);
        const response = await this.request('/leads', params);
        
        const leads = response.leads || [];
        
        if (leads.length > 0) {
          allLeads.push(...leads);
          console.log(`   ✅ Got ${leads.length} leads on page ${currentPage}`);
        }

        if (response.meta && response.meta.pagination) {
          const pagination = response.meta.pagination;
          totalPages = pagination.pageCount || 1;
          
          console.log(`   📊 Pagination: Page ${pagination.page}/${pagination.pageCount}`);
          
          if (!pagination.nextUrl || pagination.page >= pagination.pageCount) {
            console.log(`   ✅ Reached last page`);
            break;
          }
        } else {
          console.log('   ℹ️  No pagination meta, assuming single page');
          break;
        }

        if (currentPage >= 10) {
          console.log('⚠️  Stopped at 10 pages to respect rate limits');
          break;
        }

        currentPage++;

      } catch (error) {
        console.error(`❌ Error fetching page ${currentPage}:`, error.message);
        
        if (error.message === 'RATE_LIMIT_EXCEEDED') {
          console.log('⏸️  Stopping pagination due to rate limit');
        }
        break;
      }
    }

    console.log(`\n✅ Fetched ${allLeads.length} total leads from API`);

    console.log(`\n🔍 Filtering by Order date...`);
    const filteredLeads = allLeads.filter(lead => {
      const orderDate = this.getOrderDate(lead);
      
      if (!orderDate) {
        return false;
      }
      
      return orderDate >= startDate && orderDate <= endDate;
    });

    console.log(`✅ ${filteredLeads.length} leads match Order date range`);
    console.log(`   (Filtered out ${allLeads.length - filteredLeads.length} leads outside date range)\n`);

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
    
    const response = await this.request('/users', defaultParams);
    
    if (response.meta && response.meta.pagination) {
      const p = response.meta.pagination;
      console.log(`👥 Users: Page ${p.page}/${p.pageCount}`);
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
    
    const response = await this.request('/groups', defaultParams);
    
    if (response.meta && response.meta.pagination) {
      const p = response.meta.pagination;
      console.log(`👨‍👩‍👧‍👦 Groups: Page ${p.page}/${p.pageCount}`);
    }
    
    return response;
  }
}

module.exports = new AdversusAPI();
