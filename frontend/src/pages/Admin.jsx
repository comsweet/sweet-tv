import { useState, useEffect } from 'react';
import { 
  getAgents, 
  createAgent, 
  uploadProfileImage,
  getAdversusUsers,
  getAdversusUserGroups,
  getAvailableGroups,
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
import NotificationSettingsAdmin from '../components/NotificationSettingsAdmin';
import './Admin.css';

// Import axios directly for sync call with custom timeout
import axios from 'axios';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const Admin = () => {
  // 🔐 AUTHENTICATION STATE
const [isAuthenticated, setIsAuthenticated] = useState(() => {
  return localStorage.getItem('sweetTvAdminAuth') === 'true';
});
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

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
  const [isSyncingGroups, setIsSyncingGroups] = useState(false);
  const [syncGroupsMessage, setSyncGroupsMessage] = useState(null);
  
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

  // 🔐 AUTHENTICATION FUNCTIONS
  const handleLogin = async (e) => {
  e.preventDefault();
  setIsLoggingIn(true);
  setLoginError('');

  try {
    const response = await axios.post(`${API_BASE_URL}/auth/admin-login`, {
      password: password
    });

    if (response.data.success) {
      console.log('✅ Login successful');
      setIsAuthenticated(true);
      localStorage.setItem('sweetTvAdminAuth', 'true');
      setPassword('');
    }
  } catch (error) {
    console.error('❌ Login failed:', error);
    setLoginError(error.response?.data?.error || 'Inloggning misslyckades');
  } finally {
    setIsLoggingIn(false);
  }
};
  
  const handleLogout = () => {
  setIsAuthenticated(false);
  localStorage.removeItem('sweetTvAdminAuth');
  setPassword('');
  setActiveTab('agents');
};

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [activeTab, isAuthenticated]);

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
            profileImage: localAgent?.profileImage || null,
            // 🔥 NY: Inkludera groupId och groupName
            groupId: localAgent?.groupId || (user.group?.id ? parseInt(user.group.id) : null),
            groupName: localAgent?.groupName || user.group?.name || null
          };
        });
        
        setAgents(combinedAgents);
        setAdversusUsers(adversusUsersList);
      } else if (activeTab === 'groups') {
        const groupsRes = await getAvailableGroups();
        setUserGroups(groupsRes.data.groups || []);
      } else if (activeTab === 'stats') {
  try {
    console.log('📊 Fetching stats...', { startDate, endDate });
    
    const statsRes = await getLeaderboardStats(
      new Date(startDate).toISOString(),
      new Date(endDate + 'T23:59:59').toISOString()
    );
    
    console.log('📊 Stats response:', statsRes);
    
    // 🔥 SÄKERHETSKOLL: Kolla att vi har rätt data
    if (statsRes && statsRes.data) {
      if (Array.isArray(statsRes.data)) {
        console.log('✅ Got array directly:', statsRes.data.length, 'items');
        setStats(statsRes.data);
      } else if (statsRes.data.stats && Array.isArray(statsRes.data.stats)) {
        console.log('✅ Got stats property:', statsRes.data.stats.length, 'items');
        setStats(statsRes.data.stats);
      } else {
        console.error('❌ Unexpected stats format:', statsRes.data);
        setStats([]);
        alert('Oväntat format på statistikdata');
      }
    } else {
      console.error('❌ No data in response:', statsRes);
      setStats([]);
      alert('Ingen data returnerades');
    }
  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    console.error('Error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    setStats([]);
    alert('Fel vid hämtning av statistik: ' + error.message);
  }
} else if (activeTab === 'leaderboards') {
        const [leaderboardsRes, groupsRes] = await Promise.all([
          getLeaderboards(),
          getAvailableGroups()
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

  // 🔥 UPPDATERAD: RENSA DEALS DATABASE + CACHE FUNKTION
  const handleClearDealsDatabase = async () => {
    if (!confirm('⚠️ VARNING: Detta raderar alla deals från BÅDE databasen OCH cachen!\n\n• Rensar deals.json (dagens totaler för notifikationer)\n• Rensar deals-cache.json (leaderboard data)\n\nBåda filerna synkas med varandra.\n\nFortsätt?')) {
      return;
    }

    try {
      const response = await axios.delete(`${API_BASE_URL}/deals/database`);
      
      if (response.data.success) {
        alert('✅ ' + response.data.message);
        console.log('✅ Cleared both deals database and cache');
        
        // Refresh om vi är på stats
        if (activeTab === 'stats') {
          fetchData();
        }
      }
    } catch (error) {
      console.error('❌ Error clearing deals:', error);
      alert('❌ Fel: ' + (error.response?.data?.error || error.message));
    }
  };

  // 🔥 NYA FUNKTIONER FÖR DEALS SYNC
  const handleSyncDeals = async () => {
    if (!confirm('Detta synkar alla deals från Adversus (kan ta flera minuter). Fortsätt?')) {
      return;
    }

    try {
      setIsSyncing(true);
      setSyncProgress('🔄 Startar synkning...');
      
      // Custom axios call med 5 minuters timeout
      const response = await axios.post(
        `${API_BASE_URL}/deals/sync`,
        {},
        { 
          timeout: 300000, // 5 minuter
          onUploadProgress: () => {
            setSyncProgress('🔄 Synkar deals från Adversus...');
          }
        }
      );
      
      setSyncProgress('✅ Synkning klar!');
      console.log('✅ Sync response:', response.data);
      alert(`Synkning klar! ${response.data.deals} deals synkade.`);
      
      // Refresh data om vi är på stats-tab
      if (activeTab === 'stats') {
        fetchData();
      }
    } catch (error) {
      console.error('❌ Sync error:', error);
      setSyncProgress('❌ Synkning misslyckades');
      
      if (error.code === 'ECONNABORTED') {
        alert('Timeout: Synkningen tog för lång tid. Försök igen eller kontakta support.');
      } else {
        alert('Fel vid synkning: ' + (error.response?.data?.error || error.message));
      }
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncProgress(''), 3000);
    }
  };

  const handleForceRefresh = async () => {
    if (!confirm('Detta tvingar en fullständig uppdatering (sync + cache clear). Fortsätt?')) {
      return;
    }

    try {
      setIsSyncing(true);
      setSyncProgress('🔄 Synkar deals...');
      
      // 1. Sync deals
      await axios.post(`${API_BASE_URL}/deals/sync`, {}, { timeout: 300000 });
      
      setSyncProgress('🗑️ Rensar cache...');
      
      // 2. Clear cache
      await axios.post(`${API_BASE_URL}/leaderboards/cache/invalidate`, {});
      
      setSyncProgress('✅ Uppdatering klar!');
      alert('Fullständig uppdatering klar!');
      
      // 3. Refresh current view
      await fetchData();
    } catch (error) {
      console.error('❌ Refresh error:', error);
      setSyncProgress('❌ Uppdatering misslyckades');
      alert('Fel: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncProgress(''), 3000);
    }
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

      const data = {
        ...leaderboardForm,
        userGroups: leaderboardForm.userGroups.length > 0 ? leaderboardForm.userGroups : []
      };

      if (editingLeaderboard) {
        await updateLeaderboard(editingLeaderboard.id, data);
      } else {
        await createLeaderboard(data);
      }

      setShowLeaderboardModal(false);
      fetchData();
    } catch (error) {
      console.error('Error saving leaderboard:', error);
      alert('Fel: ' + error.message);
    }
  };

  const handleDeleteLeaderboard = async (id) => {
    if (!confirm('Säker på att du vill radera denna leaderboard?')) return;

    try {
      await deleteLeaderboard(id);
      fetchData();
    } catch (error) {
      console.error('Error deleting leaderboard:', error);
      alert('Fel: ' + error.message);
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
      console.error('Error toggling leaderboard:', error);
      alert('Fel: ' + error.message);
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

  // Slideshow functions
  const handleAddSlideshow = () => {
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
      type: slideshow.type,
      leaderboards: slideshow.leaderboards || [],
      duration: slideshow.duration,
      dualSlides: slideshow.dualSlides || [],
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

      if (slideshowForm.type === 'single' && slideshowForm.leaderboards.length === 0) {
        alert('Välj minst en leaderboard!');
        return;
      }

      if (slideshowForm.type === 'dual' && slideshowForm.dualSlides.length === 0) {
        alert('Lägg till minst en dual slide!');
        return;
      }

      if (slideshowForm.type === 'dual') {
        const invalidSlides = slideshowForm.dualSlides.filter(
          slide => !slide.left || !slide.right
        );
        if (invalidSlides.length > 0) {
          alert('Alla dual slides måste ha både vänster och höger leaderboard!');
          return;
        }
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
      alert('Fel: ' + error.message);
    }
  };

  const handleDeleteSlideshow = async (id) => {
    if (!confirm('Säker på att du vill radera denna slideshow?')) return;

    try {
      await deleteSlideshow(id);
      fetchData();
    } catch (error) {
      console.error('Error deleting slideshow:', error);
      alert('Fel: ' + error.message);
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
      console.error('Error toggling slideshow:', error);
      alert('Fel: ' + error.message);
    }
  };

  // 🆕 NYA FUNKTIONER FÖR SLIDESHOW URL
  const handleOpenSlideshow = (slideshowId) => {
    window.location.href = `/#/slideshow/${slideshowId}`;
  };

  const getSlideshowUrl = (slideshowId) => {
    return `${window.location.origin}/#/slideshow/${slideshowId}`;
  };

  const handleLeaderboardToggle = (lbId) => {
    setSlideshowForm(prev => ({
      ...prev,
      leaderboards: prev.leaderboards.includes(lbId)
        ? prev.leaderboards.filter(id => id !== lbId)
        : [...prev.leaderboards, lbId]
    }));
  };

  const handleReorderLeaderboard = (index, direction) => {
    const newLeaderboards = [...slideshowForm.leaderboards];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newLeaderboards.length) return;
    
    [newLeaderboards[index], newLeaderboards[targetIndex]] = 
    [newLeaderboards[targetIndex], newLeaderboards[index]];
    
    setSlideshowForm(prev => ({ ...prev, leaderboards: newLeaderboards }));
  };

  const handleAddDualSlide = () => {
    setSlideshowForm(prev => ({
      ...prev,
      dualSlides: [
        ...prev.dualSlides,
        { left: null, right: null, duration: 30 }
      ]
    }));
  };

  const handleRemoveDualSlide = (index) => {
    setSlideshowForm(prev => ({
      ...prev,
      dualSlides: prev.dualSlides.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateDualSlide = (index, field, value) => {
    setSlideshowForm(prev => ({
      ...prev,
      dualSlides: prev.dualSlides.map((slide, i) => 
        i === index ? { ...slide, [field]: value } : slide
      )
    }));
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
        
        // Refresh agents data
        await fetchData();
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

  // 🔐 IF NOT AUTHENTICATED - SHOW LOGIN FORM
  if (!isAuthenticated) {
    return (
      <div className="admin-container">
        <div className="login-form">
          <h1>🔐 Admin Login</h1>
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Lösenord:</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ange admin-lösenord"
                disabled={isLoggingIn}
              />
            </div>
            {loginError && (
              <div className="error-message">{loginError}</div>
            )}
            <button 
              type="submit" 
              className="btn-primary" 
              disabled={isLoggingIn}
            >
              {isLoggingIn ? '⏳ Loggar in...' : 'Logga in'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 🎯 SHOW ADMIN PANEL IF AUTHENTICATED
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
            {isSyncing ? '⏳ Uppdaterar...' : '⚡ Force Refresh'}
          </button>
          <button 
            onClick={handleClearDealsDatabase} 
            className="btn-danger"
            title="Rensar deals.json (dagens totaler för notifikationer)"
          > 🗑️ Rensa Deals DB
          </button>
          <button onClick={handleManualPoll} className="btn-secondary" disabled={isLoading}>
            🔄 Kolla nya affärer
          </button>
          <button 
            onClick={handleLogout} 
            className="btn-secondary"
            style={{ marginLeft: '1rem' }}
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
          className={activeTab === 'sounds' ? 'active' : ''}
          onClick={() => setActiveTab('sounds')}
        >
          🔊 Ljud
        </button>
        <button 
          className={activeTab === 'notifications' ? 'active' : ''}
          onClick={() => setActiveTab('notifications')}
        >
          🔔 Notifikationer
        </button>
        <button 
          className={activeTab === 'stats' ? 'active' : ''}
          onClick={() => setActiveTab('stats')}
        >
          📊 Statistik
        </button>
      </div>

      <div className="admin-content">
        {isLoading && activeTab !== 'sounds' && <div className="loading">Laddar...</div>}

        {/* Agents Tab */}
        {activeTab === 'agents' && !isLoading && (
          <div className="agents-section">
            <div className="section-header">
              <h2>Agenter från Adversus ({agents.length})</h2>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button 
                  onClick={handleSyncGroups} 
                  className="btn-primary"
                  disabled={isSyncingGroups}
                >
                  {isSyncingGroups ? '⏳ Synkar...' : '🔄 Synka Groups'}
                </button>
              </div>
            </div>
        
            {/* Success/Error message */}
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
                      {/* 🔥 NY: Visa group info */}
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
        )}

        {/* Groups Tab */}
      {activeTab === 'groups' && !isLoading && (
        <div className="groups-section">
          <div className="section-header">
            <h2>User Groups från Adversus ({userGroups.length})</h2>
            <p style={{ color: '#666', fontSize: '0.9rem', marginTop: '0.5rem' }}>
              Visar groups baserat på user.group.id (EJ memberOf/Teams)
            </p>
          </div>
          
          {userGroups.length === 0 ? (
            <div className="empty-state">
              <p>Inga user groups hittades</p>
            </div>
          ) : (
            <div className="groups-grid">
              {userGroups.map(group => (
                <div key={group.id} className="group-card">
                  <div className="group-header">
                    <h3>{group.name}</h3>
                    <span className="group-id">ID: {group.id}</span>
                  </div>
                  <div className="group-stats">
                    <div className="stat-item">
                      <span className="stat-icon">👥</span>
                      <span className="stat-value">{group.agentCount}</span>
                      <span className="stat-label">agenter</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
        
        {activeTab === 'sounds' && (
          <AdminSounds />
        )}

        {activeTab === 'notifications' && (
          <NotificationSettingsAdmin />
        )}

        {/* 🔥 FIXED STATS SECTION - MED SÄKERHETSKOLLAR */}
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
            
            {!stats || stats.length === 0 ? (
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
                    {stats.map((stat, index) => {
                      // 🔥 SÄKERHETSKOLL: Skydda mot undefined agent
                      if (!stat || !stat.agent) {
                        console.error('⚠️ Invalid stat object:', stat);
                        return null;
                      }
                      
                      return (
                        <tr key={stat.userId || index}>
                          <td>
                            {index === 0 && '🥇'}
                            {index === 1 && '🥈'}
                            {index === 2 && '🥉'}
                            {index > 2 && `#${index + 1}`}
                          </td>
                          <td>
                            <div className="stat-agent">
                              {stat.agent.profileImage ? (
                                <img 
                                  src={stat.agent.profileImage} 
                                  alt={stat.agent.name || 'Agent'} 
                                />
                              ) : (
                                <div className="stat-avatar-placeholder">
                                  {stat.agent.name?.charAt(0) || '?'}
                                </div>
                              )}
                              <span>{stat.agent.name || `Agent ${stat.userId}`}</span>
                            </div>
                          </td>
                          <td>{stat.dealCount || 0}</td>
                          <td>{(stat.totalCommission || 0).toLocaleString('sv-SE')} THB</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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
                        {lb.active ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </div>
                  </div>

                  <div className="leaderboard-card-body">
                    <div className="leaderboard-info">
                      <span className="info-label">Period:</span>
                      <span className="info-value">
                        {lb.timePeriod === 'day' && 'Dag'}
                        {lb.timePeriod === 'week' && 'Vecka'}
                        {lb.timePeriod === 'month' && 'Månad'}
                        {lb.timePeriod === 'custom' && 'Anpassad'}
                      </span>
                    </div>

                    <div className="leaderboard-info">
                      <span className="info-label">User Groups:</span>
                      <span className="info-value">
                        {lb.userGroups?.length === 0 ? 'Alla agenter' : `${lb.userGroups.length} grupper`}
                      </span>
                    </div>

                    {lb.timePeriod === 'custom' && (
                      <>
                        <div className="leaderboard-info">
                          <span className="info-label">Start:</span>
                          <span className="info-value">{lb.customStartDate}</span>
                        </div>
                        <div className="leaderboard-info">
                          <span className="info-label">Slut:</span>
                          <span className="info-value">{lb.customEndDate}</span>
                        </div>
                      </>
                    )}
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

        {/* Slideshows Tab */}
        {activeTab === 'slideshows' && !isLoading && (
          <div className="slideshows-section">
            <div className="section-header">
              <h2>Slideshows ({slideshows.length})</h2>
              <button onClick={handleAddSlideshow} className="btn-primary">
                ➕ Skapa Slideshow
              </button>
            </div>

            <div className="slideshows-list">
              {slideshows.map(ss => (
                <div key={ss.id} className="slideshow-card">
                  <div className="slideshow-card-header">
                    <h3>{ss.name}</h3>
                    <div className="slideshow-status">
                      <label className="toggle-switch">
                        <input 
                          type="checkbox" 
                          checked={ss.active}
                          onChange={() => handleToggleSlideshowActive(ss)}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                      <span className={ss.active ? 'status-active' : 'status-inactive'}>
                        {ss.active ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </div>
                  </div>

                  <div className="slideshow-card-body">
                    <div className="slideshow-info">
                      <span className="info-label">Typ:</span>
                      <span className="info-value">
                        {ss.type === 'single' ? 'Single (En leaderboard åt gången)' : 'Dual (Två leaderboards samtidigt)'}
                      </span>
                    </div>

                    {ss.type === 'single' && (
                      <>
                        <div className="slideshow-info">
                          <span className="info-label">Leaderboards:</span>
                          <span className="info-value">{ss.leaderboards?.length || 0}</span>
                        </div>
                        <div className="slideshow-info">
                          <span className="info-label">Varaktighet:</span>
                          <span className="info-value">{ss.duration}s per leaderboard</span>
                        </div>
                      </>
                    )}

                    {ss.type === 'dual' && (
                      <>
                        <div className="slideshow-info">
                          <span className="info-label">Dual Slides:</span>
                          <span className="info-value">{ss.dualSlides?.length || 0}</span>
                        </div>
                        <div className="slideshow-info">
                          <span className="info-label">Total tid:</span>
                          <span className="info-value">
                            {ss.dualSlides?.reduce((sum, slide) => sum + (slide.duration || 30), 0)}s
                          </span>
                        </div>
                      </>
                    )}

                    {/* 🆕 NY: Visa URL */}
                    <div className="slideshow-info slideshow-url-info">
                      <span className="info-label">🔗 URL:</span>
                      <span className="info-value slideshow-url" title="Klicka för att markera och kopiera">
                        {getSlideshowUrl(ss.id)}
                      </span>
                    </div>
                  </div>

                  <div className="slideshow-card-footer">
                    {/* 🆕 NY: Öppna slideshow-knapp */}
                    <button 
                      onClick={() => handleOpenSlideshow(ss.id)} 
                      className="btn-primary"
                      title="Öppna slideshow"
                    >
                      🚀 Öppna Slideshow
                    </button>
                    <button onClick={() => handleEditSlideshow(ss)} className="btn-secondary">
                      ✏️ Redigera
                    </button>
                    <button onClick={() => handleDeleteSlideshow(ss.id)} className="btn-danger">
                      🗑️ Ta bort
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Leaderboard Modal */}
      {showLeaderboardModal && (
        <div className="modal-overlay" onClick={() => setShowLeaderboardModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingLeaderboard ? 'Redigera' : 'Skapa'} Leaderboard</h2>
            
            <div className="form-group">
              <label>Namn:</label>
              <input
                type="text"
                value={leaderboardForm.name}
                onChange={(e) => setLeaderboardForm({ ...leaderboardForm, name: e.target.value })}
                placeholder="T.ex. 'Dagens säljare'"
              />
            </div>

            <div className="form-group">
              <label>Tidsperiod:</label>
              <select
                value={leaderboardForm.timePeriod}
                onChange={(e) => setLeaderboardForm({ ...leaderboardForm, timePeriod: e.target.value })}
              >
                <option value="day">Dag</option>
                <option value="week">Vecka</option>
                <option value="month">Månad</option>
                <option value="custom">Anpassad</option>
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
              <label>User Groups (tomt = alla agenter):</label>
              <div className="checkbox-group">
                {userGroups.map(group => (
                  <label key={group.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={leaderboardForm.userGroups.includes(group.id)}
                      onChange={() => handleGroupToggle(group.id)}
                    />
                    <span>{group.name} ({group.agentCount} agenter)</span>
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
                <span>Aktiv</span>
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

      {/* Slideshow Modal */}
      {showSlideshowModal && (
        <div className="modal-overlay" onClick={() => setShowSlideshowModal(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <h2>{editingSlideshow ? 'Redigera' : 'Skapa'} Slideshow</h2>
            
            {/* Name */}
            <div className="form-group">
              <label>Namn:</label>
              <input
                type="text"
                value={slideshowForm.name}
                onChange={(e) => setSlideshowForm({ ...slideshowForm, name: e.target.value })}
                placeholder="T.ex. 'Daglig Leaderboard'"
              />
            </div>

            {/* Type Selection */}
            <div className="form-group">
              <label>Typ:</label>
              <select
                value={slideshowForm.type}
                onChange={(e) => setSlideshowForm({ 
                  ...slideshowForm, 
                  type: e.target.value,
                  leaderboards: [],
                  dualSlides: []
                })}
              >
                <option value="single">Single (En leaderboard åt gången)</option>
                <option value="dual">Dual (Två leaderboards sida vid sida)</option>
              </select>
            </div>

            {/* SINGLE MODE */}
            {slideshowForm.type === 'single' && (
              <>
                <div className="form-group">
                  <label>Duration per leaderboard (sekunder):</label>
                  <input
                    type="number"
                    min="10"
                    max="300"
                    value={slideshowForm.duration}
                    onChange={(e) => setSlideshowForm({ ...slideshowForm, duration: parseInt(e.target.value) })}
                  />
                </div>

                <div className="form-group">
                  <label>Välj Leaderboards:</label>
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

            {/* DUAL MODE */}
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
                              {/* Left Leaderboard */}
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

                              {/* Right Leaderboard */}
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

                            {/* Duration for this dual slide */}
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

                            {/* Auto-scroll info */}
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

            {/* Active checkbox */}
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

            {/* Actions */}
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
