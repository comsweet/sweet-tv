import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add JWT token to all requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('sweetTvToken'); // Changed from 'auth_token' to 'sweetTvToken'
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle 401 Unauthorized responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Token expired or invalid - redirect to login
      localStorage.removeItem('sweetTvToken'); // Changed from 'auth_token'
      localStorage.removeItem('auth_user');

      // Only redirect if not already on login page
      if (!window.location.hash.includes('/login')) {
        window.location.hash = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ==================== AUTHENTICATION ====================

export const login = (email, password) => api.post('/auth/login', { email, password });
export const logout = () => api.post('/auth/logout');
export const getCurrentUser = () => api.get('/auth/me');
export const changePassword = (currentPassword, newPassword) =>
  api.post('/auth/change-password', { currentPassword, newPassword });

// User Management (Superadmin only)
export const getUsers = () => api.get('/auth/users');
export const createUser = (data) => api.post('/auth/users', data);
export const updateUser = (id, data) => api.put(`/auth/users/${id}`, data);
export const deleteUser = (id) => api.delete(`/auth/users/${id}`);

// Audit Logs
export const getAuditLogs = (params) => api.get('/audit/logs', { params });

// API Monitoring
export const getApiStats = (params) => api.get('/audit/api-stats', { params });


// Agents
export const getAgents = () => api.get('/agents');
export const createAgent = (data) => api.post('/agents', data);
export const updateAgent = (userId, data) => api.put(`/agents/${userId}`, data);
export const deleteAgent = (userId) => api.delete(`/agents/${userId}`);
export const uploadProfileImage = (userId, file) => {
  const formData = new FormData();
  formData.append('image', file);
  return api.post(`/agents/${userId}/profile-image`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
};
export const deleteProfileImage = (userId) => api.delete(`/agents/${userId}/profile-image`);
export const createUploadToken = (userId) => api.post(`/agents/${userId}/create-upload-token`);
export const uploadWithToken = (token, file) => {
  const formData = new FormData();
  formData.append('token', token);
  formData.append('image', file);
  return api.post('/agents/upload-with-token', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
};

// Stats
export const getLeaderboardStats = (startDate, endDate) => 
  api.get('/stats/leaderboard', { params: { startDate, endDate } });

// Adversus
export const syncGroupsFromAdversus = () => api.post('/agents/sync-groups');
export const getAdversusUserGroups = () => api.get('/agents/adversus/groups');
export const getAdversusUsers = () => api.get('/agents/adversus/users');

// Groups
export const getAvailableGroups = () => api.get('/agents/available-groups');

// Polling
export const triggerManualPoll = () => api.post('/poll/trigger');

// Leaderboards
export const getLeaderboards = () => api.get('/leaderboards');
export const getActiveLeaderboards = () => api.get('/leaderboards/active');
export const getLeaderboard = (id) => api.get(`/leaderboards/${id}`);
export const createLeaderboard = (data) => api.post('/leaderboards', data);
export const updateLeaderboard = (id, data) => api.put(`/leaderboards/${id}`, data);
export const deleteLeaderboard = (id) => api.delete(`/leaderboards/${id}`);
export const getLeaderboardStats2 = (id) => api.get(`/leaderboards/${id}/stats`);

// Slideshows
export const getSlideshows = () => api.get('/slideshows');
export const getActiveSlideshows = () => api.get('/slideshows/active');
export const getSlideshow = (id) => api.get(`/slideshows/${id}`);
export const createSlideshow = (data) => api.post('/slideshows', data);
export const updateSlideshow = (id, data) => api.put(`/slideshows/${id}`, data);
export const deleteSlideshow = (id) => api.delete(`/slideshows/${id}`);

// Sound Management
export const getSoundSettings = () => api.get('/sounds/settings');
export const updateSoundSettings = (data) => api.put('/sounds/settings', data);
export const getSounds = () => api.get('/sounds');
export const getSound = (id) => api.get(`/sounds/${id}`);
export const uploadSound = (file) => {
  const formData = new FormData();
  formData.append('sound', file);
  return api.post('/sounds/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
};
export const deleteSound = (id) => api.delete(`/sounds/${id}`);
export const updateSound = (id, data) => api.put(`/sounds/${id}`, data);
export const linkAgentToSound = (soundId, userId) => 
  api.post(`/sounds/${soundId}/link-agent`, { userId });
export const unlinkAgentFromSound = (soundId, userId) =>
  api.post(`/sounds/${soundId}/unlink-agent`, { userId });
export const getSoundForAgent = (userId) => api.get(`/sounds/agent/${userId}`);

// Deals Cache Management
export const getDealsCacheStats = () => api.get('/deals/stats');
export const syncDealsManually = () => api.post('/deals/sync');
export const cleanOldDeals = () => api.post('/deals/clean');
export const clearDealsCache = () => api.delete('/deals/database');

// SMS Cache Management
export const getSMSCacheStats = () => api.get('/sms/stats');
export const syncSMSManually = () => api.post('/sms/sync');
export const cleanOldSMS = () => api.post('/sms/clean');
export const clearSMSCache = () => api.delete('/sms/cache');

// Admin - Database Sync & Duplicate Management
export const syncDatabase = (mode, startDate, endDate) =>
  api.post('/admin/sync-database', { mode, startDate, endDate });
export const getSyncStatus = () => api.get('/admin/sync-status');
export const invalidateCache = () => api.post('/admin/cache/invalidate');
export const getPendingDuplicates = () => api.get('/admin/duplicates/pending');
export const resolveDuplicate = (id, action, note, adminName) =>
  api.post(`/admin/duplicates/${id}/resolve`, { action, note, adminName });
export const getDuplicateHistory = (limit = 100) =>
  api.get(`/admin/duplicates/history?limit=${limit}`);

// Auto-Refresh Settings
export const getAutoRefreshSettings = () => api.get('/auto-refresh/settings');
export const updateAutoRefreshSettings = (data) => api.post('/auto-refresh/settings', data);
export const resetAutoRefreshSettings = () => api.post('/auto-refresh/settings/reset');

// Campaign Bonus Tiers
export const getCampaignBonusTiers = () => api.get('/campaign-bonus-tiers');
export const getCampaignBonusTier = (id) => api.get(`/campaign-bonus-tiers/${id}`);
export const createCampaignBonusTier = (data) => api.post('/campaign-bonus-tiers', data);
export const updateCampaignBonusTier = (id, data) => api.put(`/campaign-bonus-tiers/${id}`, data);
export const deleteCampaignBonusTier = (id) => api.delete(`/campaign-bonus-tiers/${id}`);
export const calculateCampaignBonus = (data) => api.post('/campaign-bonus-tiers/calculate', data);

// Thresholds (Color Coding)
export const getThresholds = () => api.get('/thresholds');
export const getThresholdsForPeriod = (timePeriod) => api.get(`/thresholds/${timePeriod}`);
export const updateThresholds = (timePeriod, data) => api.put(`/thresholds/${timePeriod}`, data);
export const resetThresholds = () => api.post('/thresholds/reset');

export default api;
