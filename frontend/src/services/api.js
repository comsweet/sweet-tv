import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

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

// Stats
export const getLeaderboardStats = (startDate, endDate) => 
  api.get('/stats/leaderboard', { params: { startDate, endDate } });

// Adversus
export const getAdversusUserGroups = () => api.get('/adversus/user-groups');
export const getAdversusUsers = () => api.get('/adversus/users');

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

export default api;
