const axios = require('axios');

class AdversusAPI {
  constructor() {
    this.baseURL = 'https://api.adversus.dk/v1';
    this.username = process.env.ADVERSUS_USERNAME;
    this.password = process.env.ADVERSUS_PASSWORD;
    this.auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
  }

  async request(endpoint, params = {}) {
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
        console.error('⏰ Rate limit exceeded');
        throw new Error('RATE_LIMIT_EXCEEDED');
      }
      console.error('❌ API Error:', error.message);
      throw error;
    }
  }

  // Hämta leads med filter - för polling
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

  // Hämta ALLA leads med datum-range - MED FULLSTÄNDIG PAGINATION
  async getLeadsInDateRange(startDate, endDate) {
    const filters = {
      "status": { "$eq": "success" },
      "lastUpdatedTime": { 
        "$gt": startDate.toISOString(),
        "$lt": endDate.toISOString()
      }
    };

    console.log('🔍 Fetching leads with filters:', JSON.stringify(filters));

    let allLeads = [];
    let currentPage = 1;
    let totalPages = 1;

    // PAGINATION LOOP - Hämta alla sidor!
    while (currentPage <= totalPages) {
      const params = {
        filters: JSON.stringify(filters),
        page: currentPage,
        pageSize: 1000,  // Max per sida
        sortProperty: 'lastUpdatedTime',
        sortDirection: 'DESC',
        includeMeta: true
      };

      try {
        console.log(`📄 Fetching page ${currentPage}...`);
        const response = await this.request('/leads', params);
        
        // Lägg till leads från denna sida
        if (response.leads && response.leads.length > 0) {
          allLeads.push(...response.leads);
          console.log(`   ✅ Got ${response.leads.length} leads on page ${currentPage}`);
        }

        // Uppdatera pagination info
        if (response.meta) {
          totalPages = response.meta.totalPages || 1;
          console.log(`📊 Meta: Page ${response.meta.currentPage}/${totalPages}, Total: ${response.meta.totalCount} leads`);
        } else {
          // Ingen meta = endast en sida
          console.log('   ℹ️  No meta returned, assuming single page');
          break;
        }

        // Gå till nästa sida
        currentPage++;

        // Safety: Max 50 sidor (50,000 leads)
        if (currentPage > 50) {
          console.log('⚠️  Stopped at 50 pages for safety');
          break;
        }

        // Rate limit protection: Vänta lite mellan requests
        if (currentPage <= totalPages) {
          await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
        }

      } catch (error) {
        console.error(`❌ Error fetching page ${currentPage}:`, error.message);
        break;
      }
    }

    console.log(`✅ TOTAL: Fetched ${allLeads.length} leads across ${currentPage - 1} pages`);

    return {
      leads: allLeads,
      meta: {
        totalCount: allLeads.length,
        totalPages: currentPage - 1
      }
    };
  }

  // Hämta user details
  async getUser(userId) {
    return await this.request(`/users/${userId}`);
  }

  // Hämta users (with pagination support)
  async getUsers(params = {}) {
    const defaultParams = {
      page: 1,
      pageSize: 1000,  // Get as many as possible
      includeMeta: true,
      ...params
    };
    
    const response = await this.request('/users', defaultParams);
    
    if (response.meta) {
      console.log(`👥 Users fetched: Page ${response.meta.currentPage}/${response.meta.totalPages}, Total: ${response.meta.totalCount} users`);
    }
    
    return response;
  }

  // Hämta user groups
  async getUserGroups(params = {}) {
    const defaultParams = {
      page: 1,
      pageSize: 1000,
      includeMeta: true,
      ...params
    };
    
    const response = await this.request('/groups', defaultParams);
    
    if (response.meta) {
      console.log(`👨‍👩‍👧‍👦 Groups fetched: Page ${response.meta.currentPage}/${response.meta.totalPages}, Total: ${response.meta.totalCount} groups`);
    }
    
    return response;
  }
}

module.exports = new AdversusAPI();
