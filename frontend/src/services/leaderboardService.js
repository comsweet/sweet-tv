// frontend/src/services/leaderboardService.js
// Service för att hämta och formatera leaderboard-data från backend

const API_BASE_URL = 'http://localhost:5000/api';

/**
 * Synka deals från Adversus
 */
export const syncDeals = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/deals/sync`, {
      method: 'POST'
    });
    const data = await response.json();
    console.log('✅ Deals synkade:', data);
    return data;
  } catch (error) {
    console.error('❌ Fel vid synkning av deals:', error);
    throw error;
  }
};

/**
 * Synka SMS från Adversus
 */
export const syncSMS = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/sms/sync`, {
      method: 'POST'
    });
    const data = await response.json();
    console.log('✅ SMS synkade:', data);
    return data;
  } catch (error) {
    console.error('❌ Fel vid synkning av SMS:', error);
    throw error;
  }
};

/**
 * Hämta leaderboard för en specifik period
 * @param {string} type - 'today' eller 'month'
 * @returns {Promise<Object>} - Formaterad leaderboard-data
 */
export const getLeaderboard = async (type) => {
  try {
    const response = await fetch(`${API_BASE_URL}/leaderboards/${type}`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Kunde inte hämta leaderboard');
    }
    
    console.log(`✅ Hämtade ${type} leaderboard:`, data);
    return data;
  } catch (error) {
    console.error(`❌ Fel vid hämtning av ${type} leaderboard:`, error);
    throw error;
  }
};

/**
 * Formatera backend-data till DualLeaderboardSlide-format
 * @param {Object} leaderboardData - Data från backend
 * @param {Object} agentsMap - Map av userId -> agent info (namn, profilbild, etc)
 * @param {string} name - Namn på leaderboarden
 * @param {string} timePeriod - 'day', 'week', eller 'month'
 * @returns {Object} - Formaterad data för DualLeaderboardSlide
 */
export const formatLeaderboardForSlide = (leaderboardData, agentsMap, name, timePeriod) => {
  if (!leaderboardData || !leaderboardData.leaderboard) {
    console.error('❌ Ogiltig leaderboard-data:', leaderboardData);
    return {
      leaderboard: { name, timePeriod },
      stats: []
    };
  }

  const stats = leaderboardData.leaderboard.map(item => {
    const agent = agentsMap[item.userId] || {
      id: item.userId,
      name: `Agent ${item.userId}`,
      profileImage: null
    };

    return {
      userId: item.userId,
      dealCount: item.deals,
      totalCommission: item.commission,
      uniqueSMS: item.uniqueSms,
      smsSuccessRate: item.successRate,
      agent: {
        id: agent.id || item.userId,
        name: agent.name || `Agent ${item.userId}`,
        profileImage: agent.profileImage || null
      }
    };
  });

  return {
    leaderboard: {
      name: name,
      timePeriod: timePeriod
    },
    stats: stats
  };
};

/**
 * Rensa cache
 */
export const clearCache = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/leaderboards/cache/invalidate-all`, {
      method: 'POST'
    });
    const data = await response.json();
    console.log('✅ Cache rensad:', data);
    return data;
  } catch (error) {
    console.error('❌ Fel vid rensning av cache:', error);
    throw error;
  }
};

/**
 * Hämta cache-statistik
 */
export const getCacheStats = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/leaderboards/cache/stats`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Fel vid hämtning av cache stats:', error);
    throw error;
  }
};

export default {
  syncDeals,
  syncSMS,
  getLeaderboard,
  formatLeaderboardForSlide,
  clearCache,
  getCacheStats
};
