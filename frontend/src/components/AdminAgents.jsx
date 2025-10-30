import { useState, useEffect } from 'react';
import {
  getAgents,
  createAgent,
  uploadProfileImage,
  getAdversusUsers
} from '../services/api';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const AdminAgents = () => {
  const [agents, setAgents] = useState([]);
  const [adversusUsers, setAdversusUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncingGroups, setIsSyncingGroups] = useState(false);
  const [syncGroupsMessage, setSyncGroupsMessage] = useState(null);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    setIsLoading(true);
    try {
      const usersRes = await getAdversusUsers();
      const adversusUsersList = usersRes.data.users || [];

      const agentsRes = await getAgents();
      const localAgents = agentsRes.data;

      const combinedAgents = adversusUsersList.map(user => {
        const localAgent = localAgents.find(a => String(a.userId) === String(user.id));
        return {
          userId: user.id,
          name: user.name || `${user.firstname || ''} ${user.lastname || ''}`.trim() || `User ${user.id}`,
          email: user.email || '',
          profileImage: localAgent?.profileImage || null,
          groupId: localAgent?.groupId || (user.group?.id ? parseInt(user.group.id) : null),
          groupName: localAgent?.groupName || user.group?.name || null
        };
      });

      setAgents(combinedAgents);
      setAdversusUsers(adversusUsersList);
    } catch (error) {
      console.error('Error fetching agents:', error);
      alert('Fel vid hämtning: ' + error.message);
    }
    setIsLoading(false);
  };

  const handleImageUpload = async (userId, event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const agentsRes = await getAgents();
      const existingAgent = agentsRes.data.find(a => String(a.userId) === String(userId));

      if (!existingAgent) {
        const user = adversusUsers.find(u => u.id === userId);
        await createAgent({
          userId: userId,
          name: user?.name || `${user?.firstname || ''} ${user?.lastname || ''}`.trim(),
          email: user?.email || ''
        });
      }

      const response = await uploadProfileImage(userId, file);
      const imageUrl = response.data.imageUrl;

      setAgents(prevAgents => prevAgents.map(agent =>
        String(agent.userId) === String(userId)
          ? { ...agent, profileImage: imageUrl }
          : agent
      ));

      alert('Profilbild uppladdad!');
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Fel vid uppladdning: ' + error.message);
    }
  };

  const handleSyncGroups = async () => {
    if (!confirm('Detta synkar user groups från Adversus. Fortsätt?')) {
      return;
    }

    try {
      setIsSyncingGroups(true);
      setSyncGroupsMessage(null);

      const response = await axios.post(`${API_BASE_URL}/agents/sync-groups`, {}, {
        timeout: 60000
      });

      if (response.data.success) {
        setSyncGroupsMessage({
          type: 'success',
          text: `✅ ${response.data.message}`
        });
        await fetchAgents();
      }
    } catch (error) {
      console.error('❌ Sync groups error:', error);
      setSyncGroupsMessage({
        type: 'error',
        text: `❌ Fel: ${error.response?.data?.error || error.message}`
      });
    } finally {
      setIsSyncingGroups(false);
      setTimeout(() => setSyncGroupsMessage(null), 5000);
    }
  };

  if (isLoading) {
    return <div className="loading">Laddar agenter...</div>;
  }

  return (
    <div className="agents-section">
      <div className="section-header">
        <h2>Agenter från Adversus ({agents.length})</h2>
        <button
          onClick={handleSyncGroups}
          className="btn-primary"
          disabled={isSyncingGroups}
        >
          {isSyncingGroups ? '⏳ Synkar...' : '🔄 Synka Groups'}
        </button>
      </div>

      {syncGroupsMessage && (
        <div className={`sync-message ${syncGroupsMessage.type}`}>
          {syncGroupsMessage.text}
        </div>
      )}

      <div className="agents-list">
        {agents.map(agent => (
          <div key={agent.userId} className="agent-list-item">
            {agent.profileImage ? (
              <img src={agent.profileImage} alt={agent.name} className="agent-list-avatar" />
            ) : (
              <div className="agent-list-avatar-placeholder">
                {agent.name?.charAt(0) || '?'}
              </div>
            )}

            <div className="agent-list-info">
              <h3 className="agent-list-name">{agent.name}</h3>
              <div className="agent-list-meta">
                <span>🆔 {agent.userId}</span>
                {agent.email && <span>📧 {agent.email}</span>}
                {agent.groupId && (
                  <span>👥 {agent.groupName || `Group ${agent.groupId}`}</span>
                )}
                {!agent.groupId && (
                  <span style={{ color: '#e74c3c' }}>⚠️ No group</span>
                )}
              </div>
            </div>

            <div className="agent-list-upload">
              <label className="upload-button-small">
                📸
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(agent.userId, e)}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminAgents;
