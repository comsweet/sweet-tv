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
import AdminSounds from './AdminSounds';
import './Admin.css';

// Import axios directly for sync call with custom timeout
import axios from 'axios';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const Admin = () => {
  // ==================== AUTHENTICATION STATE ====================
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // ==================== EXISTING STATE ====================
  const [activeTab, setActiveTab] = useState('agents');
  const [agents, setAgents] = useState([]);
  const [adversusUsers, setAdversusUsers] = useState([]);
  const [userGroups, setUserGroups] = useState([]);
  const [stats, setStats] = useState([]);
  const [leaderboards, setLeaderboards] = useState([]);
  const [slideshows, setSlideshows] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  
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
    type: 'single',
    leaderboards: [],
    duration: 30,
    dualSlides: [],
    active: true
  });

  // ==================== AUTHENTICATION LOGIC ====================
  
  // Check if already authenticated on mount
  useEffect(() => {
    const authStatus = sessionStorage.getItem('adminAuth');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/admin-login`, {
        password: loginPassword
      });
      
      if (response.data.success) {
        setIsAuthenticated(true);
        sessionStorage.setItem('adminAuth', 'true');
        console.log('✅ Admin login successful');
      } else {
        alert('❌ Felaktigt lösenord!');
        setLoginPassword('');
      }
    } catch (error) {
      console.error('Login error:', error);
      if (error.response?.status === 401) {
        alert('❌ Felaktigt lösenord!');
      } else {
        alert('❌ Fel vid inloggning: ' + (error.response?.data?.error || error.message));
      }
      setLoginPassword('');
    }
    
    setIsLoggingIn(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('adminAuth');
    setIsAuthenticated(false);
    setLoginPassword('');
  };

  // ==================== SHOW LOGIN SCREEN IF NOT AUTHENTICATED ====================
  
  if (!isAuthenticated) {
    return (
      <div className="admin-login">
        <form onSubmit={handleLogin} className="login-form">
          <h1>🔒 Sweet TV Admin</h1>
          <p className="login-subtitle">Ange lösenord för att fortsätta</p>
          <input
            type="password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            placeholder="Lösenord"
            disabled={isLoggingIn}
            autoFocus
            className="login-input"
          />
          <button type="submit" className="btn-login" disabled={isLoggingIn}>
            {isLoggingIn ? '⏳ Loggar in...' : '🔓 Logga in'}
          </button>
        </form>
      </div>
    );
  }

  // ==================== EXISTING FUNCTIONS (unchanged) ====================

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
      
      const response = await uploadProfileImage(userId, file);
      const imageUrl = response.data.imageUrl;
      
      console.log('✅ Image uploaded:', imageUrl);
      
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

  const handleClearDealsDatabase = async () => {
    if (!confirm('⚠️ VARNING: Detta raderar alla deals från BÅDE databasen OCH cachen!\n\n• Rensar deals.json (dagens totaler för notifikationer)\n• Rensar deals-cache.json (leaderboard data)\n\nBåda filerna synkas med varandra.\n\nFortsätt?')) {
      return;
    }

    try {
      const response = await axios.delete(`${API_BASE_URL}/deals/database`);
      
      if (response.data.success) {
        alert('✅ ' + response.data.message);
        console.log('✅ Cleared both deals database and cache');
        
        if (activeTab === 'stats') {
          fetchData();
        }
      }
    } catch (error) {
      console.error('❌ Error clearing deals:', error);
      alert('❌ Fel: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleSyncDeals = async () => {
    if (!confirm('Detta kommer att synka deals cache med Adversus. Detta kan ta några minuter. Fortsätt?')) {
      return;
    }

    setIsSyncing(true);
    setSyncProgress('Startar synkronisering...');

    try {
      const response = await axios.post(
        `${API_BASE_URL}/deals-cache/sync`,
        { forceFull: false },
        { timeout: 600000 }
      );

      if (response.data.success) {
        const { newDeals, updatedDeals, totalDeals, message } = response.data;
        setSyncProgress(`✅ ${message}`);
        alert(`✅ Sync klar!\n\nNya deals: ${newDeals}\nUppdaterade deals: ${updatedDeals}\nTotalt i cache: ${totalDeals}`);
        
        if (activeTab === 'stats') {
          fetchData();
        }
      }
    } catch (error) {
      console.error('❌ Error syncing deals:', error);
      setSyncProgress('');
      alert('❌ Fel vid synkning: ' + (error.response?.data?.error || error.message));
    }

    setIsSyncing(false);
    setTimeout(() => setSyncProgress(''), 3000);
  };

  const handleForceRefresh = async () => {
    if (!confirm('⚠️ FORCE REFRESH kommer att hämta ALLA deals på nytt från Adversus.\n\nDetta kan ta 5-10 minuter och bör endast göras om cachen är korrupt.\n\nVill du fortsätta?')) {
      return;
    }

    setIsSyncing(true);
    setSyncProgress('Startar FORCE REFRESH...');

    try {
      const response = await axios.post(
        `${API_BASE_URL}/deals-cache/force-refresh`,
        {},
        { timeout: 900000 }
      );

      if (response.data.success) {
        setSyncProgress('✅ Force refresh klar!');
        alert('✅ Force refresh klar!\n\nCachen har återuppbyggts från grunden.');
        
        if (activeTab === 'stats') {
          fetchData();
        }
      }
    } catch (error) {
      console.error('❌ Error during force refresh:', error);
      setSyncProgress('');
      alert('❌ Fel: ' + (error.response?.data?.error || error.message));
    }

    setIsSyncing(false);
    setTimeout(() => setSyncProgress(''), 3000);
  };

  const handleCreateLeaderboard = () => {
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
      timePeriod: leaderboard.timePeriod || 'month',
      customStartDate: leaderboard.customStartDate || '',
      customEndDate: leaderboard.customEndDate || '',
      active: leaderboard.active !== undefined ? leaderboard.active : true
    });
    setShowLeaderboardModal(true);
  };

  const handleSaveLeaderboard = async () => {
    try {
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

  const handleGroupToggle = (groupId) => {
    setLeaderboardForm(prev => ({
      ...prev,
      userGroups: prev.userGroups.includes(groupId)
        ? prev.userGroups.filter(id => id !== groupId)
        : [...prev.userGroups, groupId]
    }));
  };

  const handleCreateSlideshow = () => {
    setEditingSlideshow(null);
    setSlideshowForm({
      name: '',
      type: 'single',
      leaderboards: [],
      duration: 30,
      dualSlides: [],
      active: true
    });
    setShowSlideshowModal(true);
  };

  const handleEditSlideshow = (slideshow) => {
    setEditingSlideshow(slideshow);
    setSlideshowForm({
      name: slideshow.name,
      type: slideshow.type || 'single',
      leaderboards: slideshow.leaderboards || [],
      duration: slideshow.duration || 30,
      dualSlides: slideshow.dualSlides || [],
      active: slideshow.active !== undefined ? slideshow.active : true
    });
    setShowSlideshowModal(true);
  };

  const handleSaveSlideshow = async () => {
    try {
      if (slideshowForm.type === 'single' && slideshowForm.leaderboards.length === 0) {
        alert('Välj minst en leaderboard för single mode!');
        return;
      }
      
      if (slideshowForm.type === 'dual' && slideshowForm.dualSlides.length === 0) {
        alert('Lägg till minst en dual slide!');
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

  const handleLeaderboardToggle = (lbId) => {
    setSlideshowForm(prev => {
      const newLeaderboards = prev.leaderboards.includes(lbId)
        ? prev.leaderboards.filter(id => id !== lbId)
        : [...prev.leaderboards, lbId];
      
      return {
        ...prev,
        leaderboards: newLeaderboards
      };
    });
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

  const handleAddDualSlide = () => {
    setSlideshowForm({
      ...slideshowForm,
      dualSlides: [
        ...slideshowForm.dualSlides,
        {
          left: '',
          right: '',
          duration: 30
        }
      ]
    });
  };

  const handleRemoveDualSlide = (index) => {
    const newDualSlides = slideshowForm.dualSlides.filter((_, i) => i !== index);
    setSlideshowForm({
      ...slideshowForm,
      dualSlides: newDualSlides
    });
  };

  const handleUpdateDualSlide = (index, field, value) => {
    const newDualSlides = [...slideshowForm.dualSlides];
    newDualSlides[index] = {
      ...newDualSlides[index],
      [field]: value
    };
    setSlideshowForm({
      ...slideshowForm,
      dualSlides: newDualSlides
    });
  };

  const getSlideshowUrl = (slideshowId) => {
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}#/slideshow/${slideshowId}`;
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
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {syncProgress && (
            <span style={{ color: '#667eea', fontWeight: '500' }}>
              {syncProgress}
            </span>
          )}
          <button 
            onClick={handleSyncDeals} 
            className="btn-primary" 
            disabled={isSyncing}
            style={{ opacity: isSyncing ? 0.6 : 1 }}
          >
            {isSyncing ? '⏳ Synkar...' : '🔄 Synka Deals Cache'}
          </button>
          <button 
            onClick={handleForceRefresh} 
            className="btn-primary" 
            disabled={isSyncing}
            style={{ opacity: isSyncing ? 0.6 : 1 }}
          >
            {isSyncing ? '⏳ Arbetar...' : '🔥 Force Refresh Cache'}
          </button>
          <button 
            onClick={handleLogout} 
            className="btn-secondary"
          >
            🚪 Logga ut
          </button>
        </div>
      </header>

      <div className="admin-tabs">
        <button 
          className={activeTab === 'agents' ? 'active' : ''} 
          onClick={() => setActiveTab('agents')}
        >
          👤 Agenter
        </button>
        <button 
          className={activeTab === 'groups' ? 'active' : ''} 
          onClick={() => setActiveTab('groups')}
        >
          👥 Grupper
        </button>
        <button 
          className={activeTab === 'stats' ? 'active' : ''} 
          onClick={() => setActiveTab('stats')}
        >
          📊 Statistik
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
          📺 Slideshows
        </button>
        <button 
          className={activeTab === 'sounds' ? 'active' : ''} 
          onClick={() => setActiveTab('sounds')}
        >
          🔊 Ljud
        </button>
      </div>

      <div className="admin-content">
        {isLoading && <div className="loading">Laddar...</div>}
        
        {activeTab === 'agents' && !isLoading && (
          <div>
            <div className="section-header">
              <h2>Agenter ({agents.length})</h2>
            </div>
            
            <div className="agents-list">
              {agents.map(agent => (
                <div key={agent.userId} className="agent-list-item">
                  <div className="agent-list-avatar">
                    {agent.profileImage ? (
                      <img src={agent.profileImage} alt={agent.name} />
                    ) : (
                      <div className="avatar-placeholder">
                        {agent.name?.charAt(0) || '?'}
                      </div>
                    )}
                  </div>
                  <div className="agent-list-info">
                    <h3>{agent.name}</h3>
                    <div className="agent-list-meta">
                      <span>ID: {agent.userId}</span>
                      {agent.email && <span>{agent.email}</span>}
                    </div>
                  </div>
                  <div className="agent-list-actions">
                    <label className="upload-btn">
                      📸 Bild
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

        {activeTab === 'groups' && !isLoading && (
          <div>
            <div className="section-header">
              <h2>Användargrupper ({userGroups.length})</h2>
            </div>
            
            <div className="groups-list">
              {userGroups.map(group => (
                <div key={group.id} className="group-card">
                  <div className="group-card-header">
                    <h3>{group.name}</h3>
                    <span className="group-count">{group.userCount || 0} medlemmar</span>
                  </div>
                  <div className="group-card-body">
                    <p className="group-id">ID: {group.id}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'stats' && !isLoading && (
          <div>
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
                  Uppdatera
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem' }}>
              <button 
                onClick={handleManualPoll} 
                className="btn-secondary"
                disabled={isLoading}
              >
                🔄 Manuell Check
              </button>
              <button 
                onClick={handleClearDealsDatabase} 
                className="btn-danger"
              >
                🗑️ Rensa Deals Database
              </button>
            </div>

            {stats.length > 0 ? (
              <div className="stats-table-container">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>Placering</th>
                      <th>Agent</th>
                      <th>Total Provision</th>
                      <th>Antal Deals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((stat, index) => (
                      <tr key={stat.userId}>
                        <td className="rank-cell">#{index + 1}</td>
                        <td>
                          <div className="agent-cell">
                            {stat.agent?.profileImage ? (
                              <img 
                                src={stat.agent.profileImage} 
                                alt={stat.agent.name} 
                                className="agent-avatar"
                              />
                            ) : (
                              <div className="agent-avatar-placeholder">
                                {stat.agent?.name?.charAt(0) || '?'}
                              </div>
                            )}
                            <span>{stat.agent?.name || `Agent ${stat.userId}`}</span>
                          </div>
                        </td>
                        <td className="commission-cell">
                          {stat.totalCommission.toLocaleString('sv-SE')} THB
                        </td>
                        <td>{stat.dealCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="no-data">Ingen data för vald period</div>
            )}
          </div>
        )}

        {activeTab === 'leaderboards' && !isLoading && (
          <div>
            <div className="section-header">
              <h2>Leaderboards ({leaderboards.length})</h2>
              <button onClick={handleCreateLeaderboard} className="btn-primary">
                ➕ Skapa Leaderboard
              </button>
            </div>

            <div className="leaderboards-list">
              {leaderboards.map(leaderboard => (
                <div key={leaderboard.id} className="leaderboard-card">
                  <div className="leaderboard-card-header">
                    <h3>{leaderboard.name}</h3>
                    <span className={leaderboard.active ? 'status-active' : 'status-inactive'}>
                      {leaderboard.active ? '✓ Aktiv' : '○ Inaktiv'}
                    </span>
                  </div>
                  
                  <div className="leaderboard-card-body">
                    <div className="leaderboard-info">
                      <span className="info-label">Tidsperiod:</span>
                      <span className="info-value">{getTimePeriodLabel(leaderboard.timePeriod)}</span>
                    </div>
                    
                    <div className="leaderboard-info">
                      <span className="info-label">Grupper:</span>
                      <span className="info-value">
                        {leaderboard.userGroups?.length === 0 ? 'Alla agenter' : `${leaderboard.userGroups.length} grupper`}
                      </span>
                    </div>
                  </div>
                  
                  <div className="leaderboard-card-footer">
                    <button onClick={() => handleEditLeaderboard(leaderboard)} className="btn-secondary">
                      ✏️ Redigera
                    </button>
                    <button onClick={() => handleDeleteLeaderboard(leaderboard.id)} className="btn-danger">
                      🗑️ Ta bort
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'slideshows' && !isLoading && (
          <div>
            <div className="section-header">
              <h2>Slideshows ({slideshows.length})</h2>
              <button onClick={handleCreateSlideshow} className="btn-primary">
                ➕ Skapa Slideshow
              </button>
            </div>

            <div className="slideshows-list">
              {slideshows.map(slideshow => (
                <div key={slideshow.id} className="slideshow-card">
                  <div className="slideshow-card-header">
                    <div>
                      <h3>{slideshow.name}</h3>
                      <span className="slideshow-type-badge">
                        {slideshow.type === 'dual' ? '📺 Dual Mode' : '📱 Single Mode'}
                      </span>
                    </div>
                    <div>
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

        {activeTab === 'sounds' && <AdminSounds />}
      </div>

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
                placeholder="t.ex. Denna månad - Team A"
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
                <option value="custom">Anpassat</option>
              </select>
            </div>

            {leaderboardForm.timePeriod === 'custom' && (
              <div className="form-row">
                <div className="form-group">
                  <label>Startdatum:</label>
                  <input
                    type="date"
                    value={leaderboardForm.customStartDate}
                    onChange={(e) => setLeaderboardForm({ ...leaderboardForm, customStartDate: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Slutdatum:</label>
                  <input
                    type="date"
                    value={leaderboardForm.customEndDate}
                    onChange={(e) => setLeaderboardForm({ ...leaderboardForm, customEndDate: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Användargrupper (tom = alla agenter):</label>
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

      {showSlideshowModal && (
        <div className="modal-overlay" onClick={() => setShowSlideshowModal(false)}>
          <div className="modal modal-xl" onClick={(e) => e.stopPropagation()}>
            <h2>{editingSlideshow ? 'Redigera Slideshow' : 'Skapa Slideshow'}</h2>
            
            <div className="form-group">
              <label>Namn:</label>
              <input
                type="text"
                value={slideshowForm.name}
                onChange={(e) => setSlideshowForm({ ...slideshowForm, name: e.target.value })}
                placeholder="t.ex. Huvudkontor Slideshow"
              />
            </div>

            <div className="form-group">
              <label>Mode:</label>
              <select
                value={slideshowForm.type}
                onChange={(e) => setSlideshowForm({ ...slideshowForm, type: e.target.value })}
              >
                <option value="single">Single (en leaderboard i taget)</option>
                <option value="dual">Dual (två leaderboards sida vid sida)</option>
              </select>
            </div>

            {slideshowForm.type === 'single' && (
              <>
                <div className="form-group">
                  <label>Default duration per slide (sekunder):</label>
                  <input
                    type="number"
                    min="10"
                    max="300"
                    value={slideshowForm.duration}
                    onChange={(e) => setSlideshowForm({ ...slideshowForm, duration: parseInt(e.target.value) })}
                  />
                </div>

                <div className="form-group">
                  <label>Leaderboards:</label>
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
              </>
            )}

            {slideshowForm.type === 'dual' && (
              <>
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <label>Dual Slides:</label>
                    <button 
                      onClick={handleAddDualSlide}
                      className="btn-secondary"
                      style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                    >
                      ➕ Lägg till slide
                    </button>
                  </div>

                  {slideshowForm.dualSlides.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', background: '#f8f9fa', borderRadius: '8px' }}>
                      <p style={{ color: '#7f8c8d' }}>Inga dual slides än. Klicka "Lägg till slide" för att skapa!</p>
                    </div>
                  ) : (
                    <div className="dual-slides-list">
                      {slideshowForm.dualSlides.map((slide, index) => {
                        const leftLb = leaderboards.find(lb => lb.id === slide.left);
                        const rightLb = leaderboards.find(lb => lb.id === slide.right);
                        
                        return (
                          <div key={index} className="dual-slide-config">
                            <div className="dual-slide-header">
                              <h4>Slide {index + 1}</h4>
                              <button 
                                onClick={() => handleRemoveDualSlide(index)}
                                className="btn-danger"
                                style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}
                              >
                                🗑️
                              </button>
                            </div>

                            <div className="dual-slide-selectors">
                              <div className="dual-selector">
                                <label>Vänster leaderboard:</label>
                                <select
                                  value={slide.left || ''}
                                  onChange={(e) => handleUpdateDualSlide(index, 'left', e.target.value)}
                                >
                                  <option value="">Välj leaderboard...</option>
                                  {leaderboards
                                    .filter(lb => lb.id !== slide.right)
                                    .map(lb => (
                                      <option key={lb.id} value={lb.id}>
                                        {lb.name}
                                      </option>
                                    ))
                                  }
                                </select>
                                {leftLb && (
                                  <div className="lb-info">
                                    <span className="info-badge">
                                      {leftLb.userGroups?.length === 0 ? 'Alla agenter' : `${leftLb.userGroups.length} grupper`}
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="dual-arrow">⇄</div>

                              <div className="dual-selector">
                                <label>Höger leaderboard:</label>
                                <select
                                  value={slide.right || ''}
                                  onChange={(e) => handleUpdateDualSlide(index, 'right', e.target.value)}
                                >
                                  <option value="">Välj leaderboard...</option>
                                  {leaderboards
                                    .filter(lb => lb.id !== slide.left)
                                    .map(lb => (
                                      <option key={lb.id} value={lb.id}>
                                        {lb.name}
                                      </option>
                                    ))
                                  }
                                </select>
                                {rightLb && (
                                  <div className="lb-info">
                                    <span className="info-badge">
                                      {rightLb.userGroups?.length === 0 ? 'Alla agenter' : `${rightLb.userGroups.length} grupper`}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="dual-duration">
                              <label>Visningstid (sekunder):</label>
                              <input
                                type="number"
                                min="10"
                                max="300"
                                value={slide.duration}
                                onChange={(e) => handleUpdateDualSlide(index, 'duration', parseInt(e.target.value))}
                              />
                            </div>

                            {(slide.left || slide.right) && (
                              <div className="dual-slide-info">
                                <span className="info-label">ℹ️ Auto-scroll:</span>
                                <span className="info-text">
                                  Aktiveras automatiskt om någon leaderboard har fler än 18 agenter
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
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
