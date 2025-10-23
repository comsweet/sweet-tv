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

  // Hämta "Order date" från resultData
  getOrderDate(lead) {
    if (!lead.resultData) return null;
    
    // Sök efter "Order date" field (case-insensitive)
    const orderDateField = lead.resultData.find(field => 
      field.label && field.label.toLowerCase() === 'order date'
    );
    
    if (orderDateField && orderDateField.value) {
      return new Date(orderDateField.value);
    }
    
    // Fallback: använd lastUpdatedTime
    if (lead.lastUpdatedTime) {
      return new Date(lead.lastUpdatedTime);
    }
    
    return null;
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

  // Hämta ALLA leads - FILTRERAR PÅ ORDER DATE
  async getLeadsInDateRange(startDate, endDate) {
    // BRED FILTRERING: Hämta lite mer än requested period
    // för att säkerställa vi får alla deals baserat på Order date
    const bufferDays = 7; // 7 dagars buffer
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

    // PAGINATION LOOP
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

        // Adversus pagination structure
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

        if (currentPage >= 50) {
          console.log('⚠️  Stopped at 50 pages for safety');
          break;
        }

        currentPage++;

        if (currentPage <= totalPages) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (error) {
        console.error(`❌ Error fetching page ${currentPage}:`, error.message);
        break;
      }
    }

    console.log(`\n✅ Fetched ${allLeads.length} total leads from API`);

    // FILTRERA PÅ ORDER DATE
    console.log(`\n🔍 Filtering by Order date...`);
    const filteredLeads = allLeads.filter(lead => {
      const orderDate = this.getOrderDate(lead);
      
      if (!orderDate) {
        console.log(`   ⚠️  Lead ${lead.id}: No order date found, skipping`);
        return false;
      }
      
      const isInRange = orderDate >= startDate && orderDate <= endDate;
      
      if (!isInRange) {
        // Debug: Visa leads utanför range
        // console.log(`   ⏭️  Lead ${lead.id}: Order date ${orderDate.toISOString()} outside range, skipping`);
      }
      
      return isInRange;
    });

    console.log(`✅ ${filteredLeads.length} leads match Order date range`);
    console.log(`   (Filtered out ${allLeads.length - filteredLeads.length} leads outside date range)\n`);

    // SORTERA efter Order date (nyast först)
    filteredLeads.sort((a, b) => {
      const dateA = this.getOrderDate(a);
      const dateB = this.getOrderDate(b);
      return dateB - dateA; // DESC
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
      console.log(`👥 Users: Page ${p.page}/${p.pageCount}`);
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
      console.log(`👨‍👩‍👧‍👦 Groups: Page ${p.page}/${p.pageCount}`);
    }
    
    return response;
  }
}

module.exports = new AdversusAPI();
