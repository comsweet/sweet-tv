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

  // Hämta ALLA leads - MED KORREKT ADVERSUS PAGINATION
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
    const pageSize = 1000; // Max enligt Adversus

    // PAGINATION LOOP med korrekt Adversus struktur
    while (currentPage <= totalPages) {
      const params = {
        filters: JSON.stringify(filters),
        page: currentPage,
        pageSize: pageSize,
        sortProperty: 'lastUpdatedTime',
        sortDirection: 'DESC',
        includeMeta: true  // VIKTIGT!
      };

      try {
        console.log(`📄 Fetching page ${currentPage}/${totalPages}...`);
        const response = await this.request('/leads', params);
        
        const leads = response.leads || [];
        
        if (leads.length > 0) {
          allLeads.push(...leads);
          console.log(`   ✅ Got ${leads.length} leads on page ${currentPage}`);
        }

        // KORREKT ADVERSUS META STRUKTUR
        if (response.meta && response.meta.pagination) {
          const pagination = response.meta.pagination;
          totalPages = pagination.pageCount || 1;
          
          console.log(`   📊 Pagination: Page ${pagination.page}/${pagination.pageCount}, PageSize: ${pagination.pageSize}`);
          
          // Om vi är på sista sidan, sluta
          if (!pagination.nextUrl || pagination.page >= pagination.pageCount) {
            console.log(`   ✅ Reached last page (${pagination.page})`);
            break;
          }
        } else {
          // Ingen meta = endast en sida
          console.log('   ℹ️  No pagination meta, assuming single page');
          break;
        }

        // Safety: Max 50 sidor (50,000 leads)
        if (currentPage >= 50) {
          console.log('⚠️  Stopped at 50 pages for safety');
          break;
        }

        currentPage++;

        // Rate limit protection: 500ms delay mellan requests
        if (currentPage <= totalPages) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (error) {
        console.error(`❌ Error fetching page ${currentPage}:`, error.message);
        break;
      }
    }

    console.log(`\n✅ TOTAL: Fetched ${allLeads.length} leads across ${currentPage} pages\n`);

    return {
      leads: allLeads,
      meta: {
        totalCount: allLeads.length,
        totalPages: currentPage
      }
    };
  }

  // Hämta user details
  async getUser(userId) {
    return await this.request(`/users/${userId}`);
  }

  // Hämta users
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
      console.log(`👥 Users: Page ${p.page}/${p.pageCount}, Total users on page: ${response.users?.length || 0}`);
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
    
    if (response.meta && response.meta.pagination) {
      const p = response.meta.pagination;
      console.log(`👨‍👩‍👧‍👦 Groups: Page ${p.page}/${p.pageCount}, Total groups on page: ${response.groups?.length || 0}`);
    }
    
    return response;
  }
}

module.exports = new AdversusAPI();
