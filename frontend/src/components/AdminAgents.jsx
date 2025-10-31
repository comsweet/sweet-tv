import { useState, useEffect } from 'react';
import {
  getAgents,
  createAgent,
  uploadProfileImage,
  deleteProfileImage,
  createUploadToken,
  getAdversusUsers
} from '../services/api';
import axios from 'axios';
import './AdminAgents.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const AdminAgents = () => {
  const [agents, setAgents] = useState([]);
  const [adversusUsers, setAdversusUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncingGroups, setIsSyncingGroups] = useState(false);
  const [syncGroupsMessage, setSyncGroupsMessage] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

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

  const handleDeleteImage = async (userId, agentName) => {
    if (!confirm(`Ta bort profilbild för ${agentName}?`)) return;

    try {
      await deleteProfileImage(userId);

      setAgents(prevAgents => prevAgents.map(agent =>
        String(agent.userId) === String(userId)
          ? { ...agent, profileImage: null }
          : agent
      ));

      alert('Profilbild borttagen!');
    } catch (error) {
      console.error('Error deleting image:', error);
      alert('Fel vid borttagning: ' + error.message);
    }
  };

  const handleCreateUploadLink = async (userId, agentName) => {
    try {
      const response = await createUploadToken(userId);
      const uploadUrl = response.data.uploadUrl;

      // Copy to clipboard
      await navigator.clipboard.writeText(uploadUrl);

      alert(
        `✅ Upload-länk skapad för ${agentName}!\n\n` +
        `Länken är kopierad till urklipp och giltig i 1 timme.\n\n` +
        `Länk: ${uploadUrl}\n\n` +
        `Skicka denna länk till agenten så de kan ladda upp sin profilbild.`
      );
    } catch (error) {
      console.error('Error creating upload link:', error);
      alert('Fel vid skapande av länk: ' + error.message);
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

  // Filter agents by search query
  const getFilteredAgents = () => {
    if (!searchQuery.trim()) return agents;

    const query = searchQuery.toLowerCase();
    return agents.filter(agent =>
      agent.name.toLowerCase().includes(query) ||
      agent.email?.toLowerCase().includes(query) ||
      agent.groupName?.toLowerCase().includes(query) ||
      String(agent.userId).includes(query)
    );
  };

  const filteredAgents = getFilteredAgents();

  if (isLoading) {
    return <div className="loading">Laddar agenter...</div>;
  }

  return (
    <div className="admin-agents-compact">
      <div className="agents-header">
        <h2>👤 Agenter från Adversus ({filteredAgents.length}{filteredAgents.length !== agents.length ? ` av ${agents.length}` : ''})</h2>
        <div className="header-actions">
          <input
            type="text"
            placeholder="🔍 Sök agent, email, grupp..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          <button
            onClick={handleSyncGroups}
            className="btn-primary"
            disabled={isSyncingGroups}
          >
            {isSyncingGroups ? '⏳ Synkar...' : '🔄 Synka Groups'}
          </button>
        </div>
      </div>

      {syncGroupsMessage && (
        <div className={`sync-message ${syncGroupsMessage.type}`}>
          {syncGroupsMessage.text}
        </div>
      )}

      {filteredAgents.length === 0 ? (
        <div className="no-agents">
          {searchQuery ? `Inga agenter hittades för "${searchQuery}"` : 'Inga agenter hittades'}
        </div>
      ) : (
        <table className="agents-table">
          <thead>
            <tr>
              <th style={{ width: '80px' }}>Bild</th>
              <th>Namn</th>
              <th>Email</th>
              <th>Grupp</th>
              <th style={{ width: '150px' }}>Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            {filteredAgents.map(agent => (
              <tr key={agent.userId}>
                <td className="avatar-cell">
                  {agent.profileImage ? (
                    <img src={agent.profileImage} alt={agent.name} className="agent-avatar" />
                  ) : (
                    <div className="agent-avatar-placeholder">
                      {agent.name?.charAt(0) || '?'}
                    </div>
                  )}
                </td>
                <td className="name-cell">
                  <strong>{agent.name}</strong>
                  <span className="user-id">#{agent.userId}</span>
                </td>
                <td className="email-cell">
                  {agent.email || <span className="no-data">Ingen email</span>}
                </td>
                <td className="group-cell">
                  {agent.groupId ? (
                    <span className="group-badge">{agent.groupName || `Group ${agent.groupId}`}</span>
                  ) : (
                    <span className="no-group">⚠️ Ingen grupp</span>
                  )}
                </td>
                <td className="actions-cell">
                  <label className="action-btn upload" title="Ladda upp bild">
                    📸
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png"
                      onChange={(e) => handleImageUpload(agent.userId, e)}
                      style={{ display: 'none' }}
                    />
                  </label>

                  {agent.profileImage && (
                    <button
                      className="action-btn delete"
                      onClick={() => handleDeleteImage(agent.userId, agent.name)}
                      title="Ta bort profilbild"
                    >
                      🗑️
                    </button>
                  )}

                  <button
                    className="action-btn link"
                    onClick={() => handleCreateUploadLink(agent.userId, agent.name)}
                    title="Skapa upload-länk (1h)"
                  >
                    🔗
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AdminAgents;
