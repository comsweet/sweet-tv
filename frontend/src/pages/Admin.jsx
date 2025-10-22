import { useState, useEffect } from 'react';
import { 
  getAgents, 
  createAgent, 
  updateAgent, 
  deleteAgent,
  uploadProfileImage,
  getAdversusUsers,
  getAdversusUserGroups,
  getLeaderboardStats,
  triggerManualPoll
} from '../services/api';
import './Admin.css';

const Admin = () => {
  const [activeTab, setActiveTab] = useState('agents');
  const [agents, setAgents] = useState([]);
  const [adversusUsers, setAdversusUsers] = useState([]);
  const [userGroups, setUserGroups] = useState([]);
  const [stats, setStats] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const [formData, setFormData] = useState({
    userId: '',
    name: '',
    email: ''
  });

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'agents') {
  // Hämta bara från Adversus API
  const usersRes = await getAdversusUsers();
  const adversusUsersList = usersRes.data.users || [];
  
  // Hämta våra lokala agenter (för profilbilder)
  const agentsRes = await getAgents();
  const localAgents = agentsRes.data;
  
  // Kombinera: Visa alla Adversus users, men lägg till profilbilder från lokala agenter
  const combinedAgents = adversusUsersList.map(user => {
    const localAgent = localAgents.find(a => a.userId === user.id);
    return {
      userId: user.id,
      name: user.name || `${user.firstname || ''} ${user.lastname || ''}`.trim(),
      email: user.email || '',
      profileImage: localAgent?.profileImage || null
    };
  });
  
  setAgents(combinedAgents);
  setAdversusUsers(adversusUsersList);
}
        setAgents(agentsRes.data);
        setAdversusUsers(usersRes.data.users || []);
      } else if (activeTab === 'groups') {
        const groupsRes = await getAdversusUserGroups();
        setUserGroups(groupsRes.data.groups || []);
      } else if (activeTab === 'stats') {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const statsRes = await getLeaderboardStats(
          startOfMonth.toISOString(),
          now.toISOString()
        );
        setStats(statsRes.data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      alert('Fel vid hämtning: ' + error.message);
    }
    setIsLoading(false);
  };

  const handleAddAgent = () => {
    setEditingAgent(null);
    setFormData({ userId: '', name: '', email: '' });
    setShowAddModal(true);
  };

  const handleEditAgent = (agent) => {
    setEditingAgent(agent);
    setFormData({
      userId: agent.userId,
      name: agent.name || '',
      email: agent.email || ''
    });
    setShowAddModal(true);
  };

  const handleSaveAgent = async () => {
    try {
      if (editingAgent) {
        await updateAgent(formData.userId, formData);
      } else {
        await createAgent(formData);
      }
      setShowAddModal(false);
      fetchData();
    } catch (error) {
      console.error('Error saving agent:', error);
      alert('Fel vid sparande: ' + error.message);
    }
  };

  const handleDeleteAgent = async (userId) => {
    if (!confirm('Är du säker på att du vill ta bort denna agent?')) return;
    
    try {
      await deleteAgent(userId);
      fetchData();
    } catch (error) {
      console.error('Error deleting agent:', error);
      alert('Fel vid borttagning: ' + error.message);
    }
  };

const handleImageUpload = async (userId, event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    // Först, se till att agenten finns i databasen
    const existingAgent = await database.getAgent(userId);
    if (!existingAgent) {
      // Hitta agent-info från Adversus
      const user = adversusUsers.find(u => u.id === userId);
      await createAgent({
        userId: userId,
        name: user?.name || `${user?.firstname || ''} ${user?.lastname || ''}`.trim(),
        email: user?.email || ''
      });
    }
    
    // Sedan ladda upp bilden
    await uploadProfileImage(userId, file);
    fetchData();
    alert('Profilbild uppladdad!');
  } catch (error) {
    console.error('Error uploading image:', error);
    alert('Fel vid uppladdning: ' + error.message);
  }
};

  const handleManualPoll = async () => {
    try {
      setIsLoading(true);
      await triggerManualPoll();
      alert('Manuell check genomförd!');
      if (activeTab === 'stats') {
        fetchData();
      }
    } catch (error) {
      console.error('Error triggering poll:', error);
      alert('Fel vid manuell check: ' + error.message);
    }
    setIsLoading(false);
  };

  return (
    <div className="admin-container">
      <header className="admin-header">
        <h1>⚙️ Sweet TV Admin</h1>
        <button onClick={handleManualPoll} className="btn-primary" disabled={isLoading}>
          🔄 Kolla efter nya affärer
        </button>
      </header>

      <div className="admin-tabs">
        <button 
          className={activeTab === 'agents' ? 'active' : ''}
          onClick={() => setActiveTab('agents')}
        >
          👥 Agenter
        </button>
        <button 
          className={activeTab === 'groups' ? 'active' : ''}
          onClick={() => setActiveTab('groups')}
        >
          👨‍👩‍👧‍👦 User Groups
        </button>
        <button 
          className={activeTab === 'stats' ? 'active' : ''}
          onClick={() => setActiveTab('stats')}
        >
          📊 Statistik
        </button>
      </div>

      <div className="admin-content">
        {isLoading && <div className="loading">Laddar...</div>}

        {/* Agents Tab */}
        {activeTab === 'agents' && !isLoading && (
          <div className="agents-section">
            <div className="section-header">
              <h2>Agenter från Adversus ({agents.length})</h2>
          </div>

            <div className="agents-grid">
              {agents.map(agent => (
                <div key={agent.userId} className="agent-card">
                  <div className="agent-card-header">
                    {agent.profileImage ? (
                      <img src={agent.profileImage} alt={agent.name} className="agent-image" />
                    ) : (
                      <div className="agent-image-placeholder">
                        {agent.name?.charAt(0) || '?'}
                      </div>
                    )}
                    <label className="upload-button">
                      📸
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={(e) => handleImageUpload(agent.userId, e)}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                  <h3>{agent.name}</h3>
                  <p className="agent-id">ID: {agent.userId}</p>
                  {agent.email && <p className="agent-email">📧 {agent.email}</p>}
                  <div className="agent-actions">
                    <p style={{ fontSize: '0.9rem', color: '#7f8c8d', margin: 0 }}>
                      Från Adversus API
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User Groups Tab */}
        {activeTab === 'groups' && !isLoading && (
          <div className="groups-section">
            <h2>User Groups från Adversus</h2>
            <div className="groups-list">
              {userGroups.map((group, index) => (
                <div key={index} className="group-card">
                  <h3>{group.name || 'Unnamed Group'}</h3>
                  <p>ID: {group.id}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats Tab */}
        {activeTab === 'stats' && !isLoading && (
          <div className="stats-section">
            <h2>Statistik denna månad</h2>
            <div className="stats-table">
              <table>
                <thead>
                  <tr>
                    <th>Placering</th>
                    <th>Agent</th>
                    <th>Antal affärer</th>
                    <th>Total provision</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((stat, index) => (
                    <tr key={stat.userId}>
                      <td>{index + 1}</td>
                      <td>
                        <div className="stat-agent">
                          {stat.agent.profileImage ? (
                            <img src={stat.agent.profileImage} alt={stat.agent.name} />
                          ) : (
                            <div className="stat-avatar-placeholder">
                              {stat.agent.name?.charAt(0) || '?'}
                            </div>
                          )}
                          <span>{stat.agent.name}</span>
                        </div>
                      </td>
                      <td>{stat.dealCount}</td>
                      <td>{stat.totalCommission.toLocaleString('sv-SE')} kr</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingAgent ? 'Redigera agent' : 'Lägg till agent'}</h2>
            <div className="form-group">
              <label>User ID (från Adversus):</label>
              <input
                type="text"
                value={formData.userId}
                onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                disabled={editingAgent !== null}
                placeholder="t.ex. 279036"
              />
            </div>
            <div className="form-group">
              <label>Namn:</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Förnamn Efternamn"
              />
            </div>
            <div className="form-group">
              <label>Email:</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@exempel.se"
              />
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowAddModal(false)} className="btn-secondary">
                Avbryt
              </button>
              <button onClick={handleSaveAgent} className="btn-primary">
                Spara
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
