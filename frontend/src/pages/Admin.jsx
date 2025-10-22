import { useState, useEffect } from 'react';
import { 
  getAgents, 
  createAgent, 
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
  
  // Datumväljare för statistik
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'agents') {
        // Hämta users från Adversus
        const usersRes = await getAdversusUsers();
        const adversusUsersList = usersRes.data.users || [];
        
        // Hämta lokala agenter (för profilbilder)
        const agentsRes = await getAgents();
        const localAgents = agentsRes.data;
        
        // Kombinera: Visa alla Adversus users med eventuella profilbilder
        const combinedAgents = adversusUsersList.map(user => {
          const localAgent = localAgents.find(a => String(a.userId) === String(user.id));
          return {
            userId: user.id,
            name: user.name || `${user.firstname || ''} ${user.lastname || ''}`.trim() || `User ${user.id}`,
            email: user.email || '',
            profileImage: localAgent?.profileImage || null
          };
        });
        
        setAgents(combinedAgents);
        setAdversusUsers(adversusUsersList);
      } else if (activeTab === 'groups') {
        const groupsRes = await getAdversusUserGroups();
        setUserGroups(groupsRes.data.groups || []);
      } else if (activeTab === 'stats') {
        const statsRes = await getLeaderboardStats(
          new Date(startDate).toISOString(),
          new Date(endDate + 'T23:59:59').toISOString()
        );
        setStats(statsRes.data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      alert('Fel vid hämtning: ' + error.message);
    }
    setIsLoading(false);
  };

  const handleImageUpload = async (userId, event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      // Kolla om agenten finns lokalt
      const agentsRes = await getAgents();
      const existingAgent = agentsRes.data.find(a => String(a.userId) === String(userId));
      
      if (!existingAgent) {
        // Skapa agent lokalt först (för att spara profilbilden)
        const user = adversusUsers.find(u => u.id === userId);
        await createAgent({
          userId: userId,
          name: user?.name || `${user?.firstname || ''} ${user?.lastname || ''}`.trim(),
          email: user?.email || ''
        });
      }
      
      // Ladda upp profilbild
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
        )}

        {/* User Groups Tab */}
        {activeTab === 'groups' && !isLoading && (
          <div className="groups-section">
            <div className="section-header">
              <h2>User Groups från Adversus ({userGroups.length})</h2>
            </div>
            <div className="groups-list">
              {userGroups.map((group, index) => (
                <div key={index} className="group-list-item">
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
            <div className="stats-header">
              <h2>Statistik</h2>
              <div className="date-picker">
                <label>
                  Från:
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </label>
                <label>
                  Till:
                  <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </label>
                <button onClick={fetchData} className="btn-primary">
                  Ladda statistik
                </button>
              </div>
            </div>
            
            {stats.length === 0 ? (
              <div className="no-data">Inga affärer för vald period</div>
            ) : (
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
                        <td>
                          {index === 0 && '🥇'}
                          {index === 1 && '🥈'}
                          {index === 2 && '🥉'}
                          {index > 2 && `#${index + 1}`}
                        </td>
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
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin;
