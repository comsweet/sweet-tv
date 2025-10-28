// SOUND MANAGEMENT API FUNCTIONS
// Add these to your existing api.js

// Sound Settings
export const getSoundSettings = () => api.get('/sounds/settings');
export const updateSoundSettings = (data) => api.put('/sounds/settings', data);
export const setDefaultSound = (soundUrl) => api.put('/sounds/settings/default', { soundUrl });
export const setMilestoneSound = (soundUrl) => api.put('/sounds/settings/milestone', { soundUrl });
export const setDailyBudget = (amount) => api.put('/sounds/settings/budget', { amount });

// Sound Library
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

// Agent Sound Linkage
export const linkAgentToSound = (soundId, userId) => 
  api.post(`/sounds/${soundId}/link-agent`, { userId });
export const unlinkAgentFromSound = (soundId, userId) => 
  api.post(`/sounds/${soundId}/unlink-agent`, { userId });
export const getSoundForAgent = (userId) => api.get(`/sounds/agent/${userId}`);
export const updateAgentSoundPreferences = (userId, preferCustomSound) =>
  api.put(`/agents/${userId}/sound-preferences`, { preferCustomSound });
