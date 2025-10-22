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
      pageSize: 1000,
      sortProperty: 'lastUpdatedTime',
      sortDirection: 'DESC'
    };

    console.log('🔍 Fetching leads with filters:', JSON.stringify(filters));

    return await this.request('/leads', params);
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
