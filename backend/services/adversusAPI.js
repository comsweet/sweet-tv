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
      sortDirection: 'DESC',
      includeMeta: true  // Include pagination metadata
    };

    return await this.request('/leads', params);
  }

  // Hämta leads med datum-range - för statistik
  async getLeadsInDateRange(startDate, endDate) {
    const filters = {
      "status": { "$eq": "success" },
      "lastUpdatedTime": { 
        "$gt": startDate.toISOString(),
        "$lt": endDate.toISOString()
      }
    };

    const params = {
      filters: JSON.stringify(filters),
      page: 1,
      pageSize: 1000,  // Max för att få så många som möjligt
      sortProperty: 'lastUpdatedTime',
      sortDirection: 'DESC',
      includeMeta: true
    };

    console.log('🔍 Fetching leads with filters:', JSON.stringify(filters));

    const response = await this.request('/leads', params);
    
    // Log metadata if available
    if (response.meta) {
      console.log(`📊 Meta: Page ${response.meta.currentPage}/${response.meta.totalPages}, Total: ${response.meta.totalCount} leads`);
      
      // If there are more pages, warn about it
      if (response.meta.totalPages > 1) {
        console.log(`⚠️  Warning: ${response.meta.totalPages} pages available, but only fetching page 1. Consider pagination for complete data.`);
      }
    }

    return response;
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

  // Helper method to fetch ALL pages if needed
  async getAllPages(endpoint, initialParams = {}) {
    const allResults = [];
    let currentPage = 1;
    let totalPages = 1;
    
    while (currentPage <= totalPages) {
      const params = {
        ...initialParams,
        page: currentPage,
        includeMeta: true
      };
      
      const response = await this.request(endpoint, params);
      
      // Add results
      if (response.leads) {
        allResults.push(...response.leads);
      } else if (response.users) {
        allResults.push(...response.users);
      } else if (response.groups) {
        allResults.push(...response.groups);
      }
      
      // Update pagination info
      if (response.meta) {
        totalPages = response.meta.totalPages;
        console.log(`📄 Fetched page ${currentPage}/${totalPages}`);
      } else {
        break; // No meta, assume single page
      }
      
      currentPage++;
      
      // Safety break after 50 pages
      if (currentPage > 50) {
        console.log('⚠️  Stopped after 50 pages for safety');
        break;
      }
    }
    
    return allResults;
  }
}

module.exports = new AdversusAPI();
