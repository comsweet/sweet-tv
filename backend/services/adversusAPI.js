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
        console.error('Rate limit exceeded');
        throw new Error('RATE_LIMIT_EXCEEDED');
      }
      console.error('API Error:', error.message);
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
      sortDirection: 'DESC'
    };

    return await this.request('/leads', params);
  }

  // Hämta leads med datum-range - för statistik - MED PAGINATION!
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
    const pageSize = 1000; // Max page size
    let hasMorePages = true;

    while (hasMorePages) {
      const params = {
        filters: JSON.stringify(filters),
        page: currentPage,
        pageSize: pageSize,
        sortProperty: 'lastUpdatedTime',
        sortDirection: 'DESC'
      };

      console.log(`📄 Fetching page ${currentPage}...`);

      try {
        const result = await this.request('/leads', params);
        const leads = result.leads || [];
        
        console.log(`   Got ${leads.length} leads on page ${currentPage}`);
        
        allLeads = allLeads.concat(leads);

        // Kolla om det finns fler sidor
        if (leads.length < pageSize) {
          // Om vi fick färre än pageSize, är detta sista sidan
          hasMorePages = false;
          console.log(`✅ Reached last page. Total leads: ${allLeads.length}`);
        } else {
          // Det kan finnas fler sidor
          currentPage++;
          
          // Säkerhetsgräns: max 20 sidor (20,000 leads)
          if (currentPage > 20) {
            console.log(`⚠️  Reached safety limit of 20 pages. Total leads: ${allLeads.length}`);
            hasMorePages = false;
          }
        }
      } catch (error) {
        console.error(`❌ Error fetching page ${currentPage}:`, error.message);
        hasMorePages = false;
      }
    }

    console.log(`📊 Total leads fetched: ${allLeads.length}`);

    return {
      leads: allLeads,
      total: allLeads.length
    };
  }

  // Hämta user details
  async getUser(userId) {
    return await this.request(`/users/${userId}`);
  }

  // Hämta users
  async getUsers(params = {}) {
    return await this.request('/users', params);
  }

  // Hämta user groups
  async getUserGroups(params = {}) {
    return await this.request('/groups', params);
  }
}

module.exports = new AdversusAPI();
