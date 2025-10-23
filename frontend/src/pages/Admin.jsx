import { useState, useEffect } from 'react';
import { 
  getAgents, 
  createAgent, 
  uploadProfileImage,
  getAdversusUsers,
  getAdversusUserGroups,
  getLeaderboardStats,
  triggerManualPoll,
  getLeaderboards,
  createLeaderboard,
  updateLeaderboard,
  deleteLeaderboard,
  getSlideshows,
  createSlideshow,
  updateSlideshow,
  deleteSlideshow
} from '../services/api';
import './Admin.css';

const Admin = () => {
  const [activeTab, setActiveTab] = useState('agents');
  const [agents, setAgents] = useState([]);
  const [adversusUsers, setAdversusUsers] = useState([]);
  const [userGroups, setUserGroups] = useState([]);
  const [stats, setStats] = useState([]);
  const [leaderboards, setLeaderboards] = useState([]);
  const [slideshows, setSlideshows] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Statistik
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  // Leaderboard modal
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  const [editingLeaderboard, setEditingLeaderboard] = useState(null);
  const [leaderboardForm, setLeaderboardForm] = useState({
    name: '',
    userGroups: [],
    timePeriod: 'month',
    customStartDate: '',
    customEndDate: '',
    active: true
  });

  // Slideshow modal
  const [showSlideshowModal, setShowSlideshowModal] = useState(false);
  const [editingSlideshow, setEditingSlideshow] = useState(null);
  const [slideshowForm, setSlideshowForm] = useState({
    name: '',
    leaderboards: [],
    duration: 30,
    active: true
  });

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'agents') {
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
      } else if (activeTab === 'leaderboards') {
        const [leaderboardsRes, groupsRes] = await Promise.all([
          getLeaderboards(),
          getAdversusUserGroups()
        ]);
        setLeaderboards(leaderboardsRes.data);
        setUserGroups(groupsRes.data.groups || []);
      } else if (activeTab === 'slideshows') {
        const [slideshowsRes, leaderboardsRes] = await Promise.all([
          getSlideshows(),
          getLeaderboards()
        ]);
        setSlideshows(slideshowsRes.data);
        setLeaderboards(leaderboardsRes.data);
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

  // Leaderboard functions
  const handleAddLeaderboard = () => {
    setEditingLeaderboard(null);
    setLeaderboardForm({
      name: '',
      userGroups: [],
      timePeriod: 'month',
      customStartDate: '',
      customEndDate: '',
      active: true
    });
    setShowLeaderboardModal(true);
  };

  const handleEditLeaderboard = (leaderboard) => {
    setEditingLeaderboard(leaderboard);
    setLeaderboardForm({
      name: leaderboard.name,
      userGroups: leaderboard.userGroups || [],
      timePeriod: leaderboard.timePeriod,
      customStartDate: leaderboard.customStartDate || '',
      customEndDate: leaderboard.customEndDate || '',
      active: leaderboard.active
    });
    setShowLeaderboardModal(true);
  };

  const handleSaveLeaderboard = async () => {
    try {
      if (!leaderboardForm.name.trim()) {
        alert('Namn krävs!');
        return;
      }

      if (editingLeaderboard) {
        await updateLeaderboard(editingLeaderboard.id, leaderboardForm);
      } else {
        await createLeaderboard(leaderboardForm);
      }
      
      setShowLeaderboardModal(false);
      fetchData();
    } catch (error) {
      console.error('Error saving leaderboard:', error);
      alert('Fel vid sparande: ' + error.message);
    }
  };

  const handleDeleteLeaderboard = async (id) => {
    if (!confirm('Är du säker på att du vill ta bort denna leaderboard?')) return;
    
    try {
      await deleteLeaderboard(id);
      fetchData();
    } catch (error) {
      console.error('Error deleting leaderboard:', error);
      alert('Fel vid borttagning: ' + error.message);
    }
  };

  const handleToggleLeaderboardActive = async (leaderboard) => {
    try {
      await updateLeaderboard(leaderboard.id, {
        ...leaderboard,
        active: !leaderboard.active
      });
      fetchData();
    } catch (error) {
      console.error('Error toggling active:', error);
      alert('Fel: ' + error.message);
    }
  };

  const handleGroupToggle = (groupId) => {
    const currentGroups = leaderboardForm.userGroups;
    if (currentGroups.includes(groupId)) {
      setLeaderboardForm({
        ...leaderboardForm,
        userGroups: currentGroups.filter(id => id !== groupId)
      });
    } else {
      setLeaderboardForm({
        ...leaderboardForm,
        userGroups: [...currentGroups, groupId]
      });
    }
  };

  // Slideshow functions
  const handleAddSlideshow = () => {
    setEditingSlideshow(null);
    setSlideshowForm({
      name: '',
      leaderboards: [],
      duration: 30,
      active: true
    });
    setShowSlideshowModal(true);
  };

  const handleEditSlideshow = (slideshow) => {
    setEditingSlideshow(slideshow);
    setSlideshowForm({
      name: slideshow.name,
      leaderboards: slideshow.leaderboards || [],
      duration: slideshow.duration || 30,
      active: slideshow.active
    });
    setShowSlideshowModal(true);
  };

  const handleSaveSlideshow = async () => {
    try {
      if (!slideshowForm.name.trim()) {
        alert('Namn krävs!');
        return;
      }

      if (slideshowForm.leaderboards.length === 0) {
        alert('Välj minst en leaderboard!');
        return;
      }

      if (editingSlideshow) {
        await updateSlideshow(editingSlideshow.id, slideshowForm);
      } else {
        await createSlideshow(slideshowForm);
      }
      
      setShowSlideshowModal(false);
      fetchData();
    } catch (error) {
      console.error('Error saving slideshow:', error);
      alert('Fel vid sparande: ' + error.message);
    }
  };

  const handleDeleteSlideshow = async (id) => {
    if (!confirm('Är du säker på att du vill ta bort denna slideshow?')) return;
    
    try {
      await deleteSlideshow(id);
      fetchData();
    } catch (error) {
      console.error('Error deleting slideshow:', error);
      alert('Fel vid borttagning: ' + error.message);
    }
  };

  const handleToggleSlideshowActive = async (slideshow) => {
    try {
      await updateSlideshow(slideshow.id, {
        ...slideshow,
        active: !slideshow.active
      });
      fetchData();
    } catch (error) {
      console.error('Error toggling active:', error);
      alert('Fel: ' + error.message);
    }
  };

  const handleLeaderboardToggle = (leaderboardId) => {
    const currentLeaderboards = slideshowForm.leaderboards;
    if (currentLeaderboards.includes(leaderboardId)) {
      setSlideshowForm({
        ...slideshowForm,
        leaderboards: currentLeaderboards.filter(id => id !== leaderboardId)
      });
    } else {
      setSlideshowForm({
        ...slideshowForm,
        leaderboards: [...currentLeaderboards, leaderboardId]
      });
    }
  };

  const handleReorderLeaderboard = (index, direction) => {
    const newLeaderboards = [...slideshowForm.leaderboards];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex >= 0 && newIndex < newLeaderboards.length) {
      [newLeaderboards[index], newLeaderboards[newIndex]] = [newLeaderboards[newIndex], newLeaderboards[index]];
      setSlideshowForm({
        ...slideshowForm,
        leaderboards: newLeaderboards
      });
    }
  };

  const getSlideshowUrl = (slideshowId) => {
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}#/?slideshow=${slideshowId}`;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('URL kopierad till urklipp!');
  };

  const getTimePeriodLabel = (period) => {
    const labels = {
      day: 'Idag',
      week: 'Denna vecka',
      month: 'Denna månad',
      custom: 'Anpassat'
    };
    return labels[period] || period;
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
          className={activeTab === 'leaderboards' ? 'active' : ''}
          onClick={() => setActiveTab('leaderboards')}
        >
          🏆 Leaderboards
        </button>
        <button 
          className={activeTab === 'slideshows' ? 'active' : ''}
          onClick={() => setActiveTab('slideshows')}
        >
          🎬 Slideshows
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

        {/* Leaderboards Tab */}
        {activeTab === 'leaderboards' && !isLoading && (
          <div className="leaderboards-section">
            <div className="section-header">
              <h2>Leaderboards ({leaderboards.length})</h2>
              <button onClick={handleAddLeaderboard} className="btn-primary">
                ➕ Skapa Leaderboard
              </button>
            </div>

            <div className="leaderboards-list">
              {leaderboards.map(lb => (
                <div key={lb.id} className="leaderboard-card">
                  <div className="leaderboard-card-header">
                    <h3>{lb.name}</h3>
                    <div className="leaderboard-status">
                      <label className="toggle-switch">
                        <input 
                          type="checkbox" 
                          checked={lb.active}
                          onChange={() => handleToggleLeaderboardActive(lb)}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                      <span className={lb.active ? 'status-active' : 'status-inactive'}>
                        {lb.active ? '✓ Aktiv' : '○ Inaktiv'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="leaderboard-card-body">
                    <div className="leaderboard-info">
                      <span className="info-label">Tidsperiod:</span>
                      <span className="info-value">{getTimePeriodLabel(lb.timePeriod)}</span>
                    </div>
                    
                    <div className="leaderboard-info">
                      <span className="info-label">User Groups:</span>
                      <span className="info-value">
                        {lb.userGroups.length === 0 ? 'Alla' : `${lb.userGroups.length} valda`}
                      </span>
                    </div>
                  </div>
                  
                  <div className="leaderboard-card-footer">
                    <button onClick={() => handleEditLeaderboard(lb)} className="btn-secondary">
                      ✏️ Redigera
                    </button>
                    <button onClick={() => handleDeleteLeaderboard(lb.id)} className="btn-danger">
                      🗑️ Ta bort
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Slideshows Tab - NEW! */}
        {activeTab === 'slideshows' && !isLoading && (
          <div className="slideshows-section">
            <div className="section-header">
              <h2>Slideshows ({slideshows.length})</h2>
              <button onClick={handleAddSlideshow} className="btn-primary">
                ➕ Skapa Slideshow
              </button>
            </div>

            <div className="slideshows-list">
              {slideshows.map(slideshow => (
                <div key={slideshow.id} className="slideshow-card">
                  <div className="slideshow-card-header">
                    <h3>{slideshow.name}</h3>
                    <div className="slideshow-status">
                      <label className="toggle-switch">
                        <input 
                          type="checkbox" 
                          checked={slideshow.active}
                          onChange={() => handleToggleSlideshowActive(slideshow)}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                      <span className={slideshow.active ? 'status-active' : 'status-inactive'}>
                        {slideshow.active ? '✓ Aktiv' : '○ Inaktiv'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="slideshow-card-body">
                    <div className="slideshow-info">
                      <span className="info-label">Antal leaderboards:</span>
                      <span className="info-value">{slideshow.leaderboards.length}</span>
                    </div>
                    
                    <div className="slideshow-info">
                      <span className="info-label">Duration per slide:</span>
                      <span className="info-value">{slideshow.duration} sekunder</span>
                    </div>

                    <div className="slideshow-url">
                      <span className="info-label">TV URL:</span>
                      <div className="url-copy-box">
                        <input 
                          type="text" 
                          value={getSlideshowUrl(slideshow.id)} 
                          readOnly 
                          className="url-input"
                        />
                        <button 
                          onClick={() => copyToClipboard(getSlideshowUrl(slideshow.id))}
                          className="btn-copy"
                        >
                          📋 Kopiera
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="slideshow-card-footer">
                    <button onClick={() => handleEditSlideshow(slideshow)} className="btn-secondary">
                      ✏️ Redigera
                    </button>
                    <button onClick={() => handleDeleteSlideshow(slideshow.id)} className="btn-danger">
                      🗑️ Ta bort
                    </button>
                  </div>
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
                        <td>{stat.totalCommission.toLocaleString('sv-SE')} THB</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Leaderboard Modal */}
      {showLeaderboardModal && (
        <div className="modal-overlay" onClick={() => setShowLeaderboardModal(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <h2>{editingLeaderboard ? 'Redigera Leaderboard' : 'Skapa Leaderboard'}</h2>
            
            <div className="form-group">
              <label>Namn:</label>
              <input
                type="text"
                value={leaderboardForm.name}
                onChange={(e) => setLeaderboardForm({ ...leaderboardForm, name: e.target.value })}
                placeholder="t.ex. Bangkok Team - Dagens Sälj"
              />
            </div>

            <div className="form-group">
              <label>Tidsperiod:</label>
              <select
                value={leaderboardForm.timePeriod}
                onChange={(e) => setLeaderboardForm({ ...leaderboardForm, timePeriod: e.target.value })}
              >
                <option value="day">Idag</option>
                <option value="week">Denna vecka</option>
                <option value="month">Denna månad</option>
                <option value="custom">Anpassat datum</option>
              </select>
            </div>

            {leaderboardForm.timePeriod === 'custom' && (
              <div className="form-row">
                <div className="form-group">
                  <label>Från datum:</label>
                  <input
                    type="date"
                    value={leaderboardForm.customStartDate}
                    onChange={(e) => setLeaderboardForm({ ...leaderboardForm, customStartDate: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Till datum:</label>
                  <input
                    type="date"
                    value={leaderboardForm.customEndDate}
                    onChange={(e) => setLeaderboardForm({ ...leaderboardForm, customEndDate: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label>User Groups (lämna tomt för alla):</label>
              <div className="checkbox-group">
                {userGroups.map(group => (
                  <label key={group.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={leaderboardForm.userGroups.includes(group.id)}
                      onChange={() => handleGroupToggle(group.id)}
                    />
                    <span>{group.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={leaderboardForm.active}
                  onChange={(e) => setLeaderboardForm({ ...leaderboardForm, active: e.target.checked })}
                />
                <span>Aktiv (visas på TV)</span>
              </label>
            </div>

            <div className="modal-actions">
              <button onClick={() => setShowLeaderboardModal(false)} className="btn-secondary">
                Avbryt
              </button>
              <button onClick={handleSaveLeaderboard} className="btn-primary">
                Spara
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slideshow Modal - NEW! */}
      {showSlideshowModal && (
        <div className="modal-overlay" onClick={() => setShowSlideshowModal(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <h2>{editingSlideshow ? 'Redigera Slideshow' : 'Skapa Slideshow'}</h2>
            
            <div className="form-group">
              <label>Namn:</label>
              <input
                type="text"
                value={slideshowForm.name}
                onChange={(e) => setSlideshowForm({ ...slideshowForm, name: e.target.value })}
                placeholder="t.ex. Bangkok Office TV"
              />
            </div>

            <div className="form-group">
              <label>Duration per slide (sekunder):</label>
              <input
                type="number"
                min="5"
                max="300"
                value={slideshowForm.duration}
                onChange={(e) => setSlideshowForm({ ...slideshowForm, duration: parseInt(e.target.value) })}
              />
            </div>

            <div className="form-group">
              <label>Välj leaderboards att visa:</label>
              <div className="checkbox-group">
                {leaderboards.map(lb => (
                  <label key={lb.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={slideshowForm.leaderboards.includes(lb.id)}
                      onChange={() => handleLeaderboardToggle(lb.id)}
                    />
                    <span>{lb.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {slideshowForm.leaderboards.length > 0 && (
              <div className="form-group">
                <label>Ordning (dra för att ändra):</label>
                <div className="leaderboard-order-list">
                  {slideshowForm.leaderboards.map((lbId, index) => {
                    const lb = leaderboards.find(l => l.id === lbId);
                    return (
                      <div key={lbId} className="order-item">
                        <span className="order-number">{index + 1}.</span>
                        <span className="order-name">{lb?.name || 'Unknown'}</span>
                        <div className="order-controls">
                          <button 
                            onClick={() => handleReorderLeaderboard(index, 'up')}
                            disabled={index === 0}
                            className="btn-icon"
                          >
                            ▲
                          </button>
                          <button 
                            onClick={() => handleReorderLeaderboard(index, 'down')}
                            disabled={index === slideshowForm.leaderboards.length - 1}
                            className="btn-icon"
                          >
                            ▼
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={slideshowForm.active}
                  onChange={(e) => setSlideshowForm({ ...slideshowForm, active: e.target.checked })}
                />
                <span>Aktiv</span>
              </label>
            </div>

            <div className="modal-actions">
              <button onClick={() => setShowSlideshowModal(false)} className="btn-secondary">
                Avbryt
              </button>
              <button onClick={handleSaveSlideshow} className="btn-primary">
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
