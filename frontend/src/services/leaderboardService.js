// frontend/src/services/leaderboardService.js
const API_BASE_URL = 'http://localhost:5000/api';

export const syncDeals = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/deals/sync`, { method: 'POST' });
    const data = await response.json();
    console.log('✅ Deals synkade:', data);
    return data;
  } catch (error) {
    console.error('❌ Fel vid synkning av deals:', error);
    throw error;
  }
};

export const syncSMS = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/sms/sync`, { method: 'POST' });
    const data = await response.json();
    console.log('✅ SMS synkade:', data);
    return data;
  } catch (error) {
    console.error('❌ Fel vid synkning av SMS:', error);
    throw error;
  }
};

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

export const formatLeaderboardForSlide = (leaderboardData, agentsMap, name, timePeriod) => {
  if (!leaderboardData || !leaderboardData.leaderboard) {
    console.error('❌ Ogiltig leaderboard-data:', leaderboardData);
    return { leaderboard: { name, timePeriod }, stats: [] };
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
    leaderboard: { name: name, timePeriod: timePeriod },
    stats: stats
  };
};

export const clearCache = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/leaderboards/cache/invalidate-all`, { method: 'POST' });
    const data = await response.json();
    console.log('✅ Cache rensad:', data);
    return data;
  } catch (error) {
    console.error('❌ Fel vid rensning av cache:', error);
    throw error;
  }
};

export default { syncDeals, syncSMS, getLeaderboard, formatLeaderboardForSlide, clearCache };
