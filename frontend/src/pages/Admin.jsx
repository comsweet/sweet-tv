// 🎯 FÖRBÄTTRAD ADMIN.JSX - Matchar Slideshow.jsx funktionalitet
// Uppdaterad UI för bättre slide management

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
    slides: [],
    duration: 30, // Fallback duration
    dualSlides: [],
    active: true
  });

  // 🔐 AUTHENTICATION
  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    try {
      const response = await axios.post(`${API_BASE_URL}/auth/admin-login`, {
        password: password
      });

      if (response.data.success) {
        setIsAuthenticated(true);
        localStorage.setItem('sweetTvAdminAuth', 'true');
        setPassword('');
      }
    } catch (error) {
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
          const statsRes = await getLeaderboardStats(
            new Date(startDate).toISOString(),
            new Date(endDate + 'T23:59:59').toISOString()
          );
          
          if (statsRes && statsRes.data) {
            if (Array.isArray(statsRes.data)) {
              setStats(statsRes.data);
            } else if (statsRes.data.stats && Array.isArray(statsRes.data.stats)) {
              setStats(statsRes.data.stats);
            } else {
              setStats([]);
              alert('Oväntat format på statistikdata');
            }
          } else {
            setStats([]);
            alert('Ingen data returnerades');
          }
        } catch (error) {
          console.error('❌ Error fetching stats:', error);
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
    if (!confirm('⚠️ VARNING: Detta raderar alla deals från BÅDE databasen OCH cachen!\n\nFortsätt?')) {
      return;
    }

    try {
      const response = await axios.delete(`${API_BASE_URL}/deals/database`);
      
      if (response.data.success) {
        alert('✅ ' + response.data.message);
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
    if (!confirm('Detta synkar alla deals från Adversus (kan ta flera minuter). Fortsätt?')) {
      return;
    }

    try {
      setIsSyncing(true);
      setSyncProgress('🔄 Startar synkning...');
      
      const response = await axios.post(
        `${API_BASE_URL}/deals/sync`,
        {},
        { 
          timeout: 300000,
          onUploadProgress: () => {
            setSyncProgress('🔄 Synkar deals från Adversus...');
          }
        }
      );
      
      setSyncProgress('✅ Synkning klar!');
      alert(`Synkning klar! ${response.data.deals} deals synkade.`);
      
      if (activeTab === 'stats') {
        fetchData();
      }
    } catch (error) {
      console.error('❌ Sync error:', error);
      setSyncProgress('❌ Synkning misslyckades');
      
      if (error.code === 'ECONNABORTED') {
        alert('Timeout: Synkningen tog för lång tid. Försök igen.');
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
      
      await axios.post(`${API_BASE_URL}/deals/sync`, {}, { timeout: 300000 });
      
      setSyncProgress('🗑️ Rensar cache...');
      await axios.post(`${API_BASE_URL}/leaderboards/cache/invalidate`, {});
      
      setSyncProgress('✅ Uppdatering klar!');
      alert('Fullständig uppdatering klar!');
      
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

  // LEADERBOARD FUNCTIONS
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

  // SLIDESHOW FUNCTIONS
  const handleAddSlideshow = () => {
    setEditingSlideshow(null);
    setSlideshowForm({
      name: '',
      type: 'single',
      slides: [],
      duration: 30,
      dualSlides: [],
      active: true
    });
    setShowSlideshowModal(true);
  };

  const handleEditSlideshow = (slideshow) => {
    setEditingSlideshow(slideshow);
    
    // Konvertera gamla formatet till nya om nödvändigt
    let slides = [];
    if (slideshow.slides && slideshow.slides.length > 0) {
      slides = slideshow.slides;
    } else if (slideshow.leaderboards && slideshow.leaderboards.length > 0) {
      slides = slideshow.leaderboards.map(lbId => ({
        leaderboardId: lbId,
        duration: slideshow.duration || 30
      }));
    }
    
    setSlideshowForm({
      name: slideshow.name,
      type: slideshow.type,
      slides: slides,
      duration: slideshow.duration || 30,
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

      if (slideshowForm.type === 'single') {
        if (!slideshowForm.slides || slideshowForm.slides.length === 0) {
          alert('Lägg till minst en slide!');
          return;
        }
        
        const invalidSlides = slideshowForm.slides.filter(
          slide => !slide.leaderboardId
        );
        if (invalidSlides.length > 0) {
          alert('Alla slides måste ha en leaderboard vald!');
          return;
        }
      } else if (slideshowForm.type === 'dual') {
        if (!slideshowForm.dualSlides || slideshowForm.dualSlides.length === 0) {
          alert('Lägg till minst en dual slide!');
          return;
        }
        
        const invalidDualSlides = slideshowForm.dualSlides.filter(
          slide => !slide.left || !slide.right
        );
        if (invalidDualSlides.length > 0) {
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

  const handleOpenSlideshow = (slideshowId) => {
    window.open(`/#/slideshow/${slideshowId}`, '_blank');
  };

  const getSlideshowUrl = (slideshowId) => {
    return `${window.location.origin}/#/slideshow/${slideshowId}`;
  };

  const handleCopySlideshowUrl = (slideshowId) => {
    const url = getSlideshowUrl(slideshowId);
    navigator.clipboard.writeText(url).then(() => {
      alert('📋 URL kopierad till urklipp!');
    }).catch(err => {
      console.error('Error copying:', err);
      alert('Kunde inte kopiera URL');
    });
  };

  // ⭐ SLIDE MANAGEMENT (SINGLE MODE)
  const handleAddSlideToSingle = () => {
    setSlideshowForm(prev => ({
      ...prev,
      slides: [
        ...prev.slides,
        { leaderboardId: null, duration: prev.duration || 30 }
      ]
    }));
  };
  
  const handleRemoveSlideFromSingle = (index) => {
    setSlideshowForm(prev => ({
      ...prev,
      slides: prev.slides.filter((_, i) => i !== index)
    }));
  };
  
  const handleUpdateSlide = (index, field, value) => {
    setSlideshowForm(prev => ({
      ...prev,
      slides: prev.slides.map((slide, i) => 
        i === index ? { ...slide, [field]: value } : slide
      )
    }));
  };
  
  const handleReorderSlide = (index, direction) => {
    const newSlides = [...slideshowForm.slides];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newSlides.length) return;
    
    [newSlides[index], newSlides[targetIndex]] = 
    [newSlides[targetIndex], newSlides[index]];
    
    setSlideshowForm(prev => ({ ...prev, slides: newSlides }));
  };

  // ⭐ DUAL SLIDE MANAGEMENT
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

  const handleReorderDualSlide = (index, direction) => {
    const newSlides = [...slideshowForm.dualSlides];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newSlides.length) return;
    
    [newSlides[index], newSlides[targetIndex]] = 
    [newSlides[targetIndex], newSlides[index]];
    
    setSlideshowForm(prev => ({ ...prev, dualSlides: newSlides }));
  };

  // 🎨 HELPER FUNCTIONS FOR UI
  const formatDuration = (seconds) => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  const getTotalSlideshowDuration = (slideshow) => {
    if (slideshow.type === 'dual') {
      return slideshow.dualSlides?.reduce((sum, slide) => sum + (slide.duration || 30), 0) || 0;
    } else {
      return slideshow.slides?.reduce((sum, slide) => sum + (slide.duration || slideshow.duration || 30), 0) || 0;
    }
  };

  // 🔐 LOGIN FORM
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

  // 🎯 MAIN ADMIN PANEL
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
          >
            {isSyncing ? '⏳ Synkar...' : '🔄 Synka Deals'}
          </button>
          <button 
            onClick={handleForceRefresh} 
            className="btn-primary" 
            disabled={isSyncing}
          >
            {isSyncing ? '⏳ Uppdaterar...' : '⚡ Force Refresh'}
          </button>
          <button 
            onClick={handleClearDealsDatabase} 
            className="btn-danger"
          >
            🗑️ Rensa DB
          </button>
          <button onClick={handleManualPoll} className="btn-secondary" disabled={isLoading}>
            🔄 Kolla nya affärer
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

        {/* 👥 AGENTS TAB */}
        {activeTab === 'agents' && !isLoading && (
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
        )}

        {/* 👨‍👩‍👧‍👦 GROUPS TAB */}
        {activeTab === 'groups' && !isLoading && (
          <div className="groups-section">
            <div className="section-header">
              <h2>User Groups från Adversus ({userGroups.length})</h2>
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
        
        {/* 🔊 SOUNDS TAB */}
        {activeTab === 'sounds' && (
          <AdminSounds />
        )}

        {/* 🔔 NOTIFICATIONS TAB */}
        {activeTab === 'notifications' && (
          <NotificationSettingsAdmin />
        )}

        {/* 📊 STATS TAB */}
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
                      if (!stat || !stat.agent) {
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

        {/* 🏆 LEADERBOARDS TAB */}
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

        {/* 🎬 SLIDESHOWS TAB */}
        {activeTab === 'slideshows' && !isLoading && (
          <div className="slideshows-section">
            <div className="section-header">
              <h2>Slideshows ({slideshows.length})</h2>
              <button onClick={handleAddSlideshow} className="btn-primary">
                ➕ Skapa Slideshow
              </button>
            </div>

            <div className="slideshows-list">
              {slideshows.map(ss => {
                const totalDuration = getTotalSlideshowDuration(ss);
                
                return (
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
                          {ss.type === 'single' ? '📊 Single' : '📊📊 Dual'}
                        </span>
                      </div>

                      {ss.type === 'single' && (
                        <>
                          <div className="slideshow-info">
                            <span className="info-label">Slides:</span>
                            <span className="info-value">
                              {ss.slides?.length || ss.leaderboards?.length || 0}
                            </span>
                          </div>
                          <div className="slideshow-info">
                            <span className="info-label">⏱️ Total tid:</span>
                            <span className="info-value">{formatDuration(totalDuration)}</span>
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
                            <span className="info-label">⏱️ Total tid:</span>
                            <span className="info-value">{formatDuration(totalDuration)}</span>
                          </div>
                        </>
                      )}

                      <div className="slideshow-info slideshow-url-info">
                        <span className="info-label">🔗 URL:</span>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: 1 }}>
                          <input 
                            type="text" 
                            value={getSlideshowUrl(ss.id)}
                            readOnly
                            className="slideshow-url-input"
                            onClick={(e) => e.target.select()}
                          />
                          <button 
                            onClick={() => handleCopySlideshowUrl(ss.id)}
                            className="btn-icon"
                            title="Kopiera URL"
                          >
                            📋
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="slideshow-card-footer">
                      <button 
                        onClick={() => handleOpenSlideshow(ss.id)} 
                        className="btn-primary"
                      >
                        🚀 Öppna
                      </button>
                      <button onClick={() => handleEditSlideshow(ss)} className="btn-secondary">
                        ✏️ Redigera
                      </button>
                      <button onClick={() => handleDeleteSlideshow(ss.id)} className="btn-danger">
                        🗑️ Ta bort
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 🏆 LEADERBOARD MODAL */}
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

      {/* 🎬 SLIDESHOW MODAL */}
      {showSlideshowModal && (
        <div className="modal-overlay" onClick={() => setShowSlideshowModal(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingSlideshow ? 'Redigera' : 'Skapa'} Slideshow</h2>
              <button 
                className="modal-close"
                onClick={() => setShowSlideshowModal(false)}
              >
                ✕
              </button>
            </div>
            
            {/* NAME */}
            <div className="form-group">
              <label>Namn:</label>
              <input
                type="text"
                value={slideshowForm.name}
                onChange={(e) => setSlideshowForm({ ...slideshowForm, name: e.target.value })}
                placeholder="T.ex. 'Daglig Leaderboard'"
              />
            </div>

            {/* TYPE */}
            <div className="form-group">
              <label>Typ:</label>
              <select
                value={slideshowForm.type}
                onChange={(e) => setSlideshowForm({ 
                  ...slideshowForm, 
                  type: e.target.value,
                  slides: [],
                  dualSlides: []
                })}
              >
                <option value="single">📊 Single (En leaderboard åt gången)</option>
                <option value="dual">📊📊 Dual (Två leaderboards sida vid sida)</option>
              </select>
            </div>

            {/* ============================================ */}
            {/* SINGLE MODE */}
            {/* ============================================ */}
            {slideshowForm.type === 'single' && (
              <div className="slideshow-config-section">
                <div className="form-group">
                  <label>⏱️ Fallback Duration (sekunder):</label>
                  <input
                    type="number"
                    min="10"
                    max="300"
                    value={slideshowForm.duration}
                    onChange={(e) => setSlideshowForm({ ...slideshowForm, duration: parseInt(e.target.value) })}
                  />
                  <small className="form-hint">
                    Används som standard om ingen slide-specifik duration är satt
                  </small>
                </div>

                <div className="form-group">
                  <div className="section-header-inline">
                    <label>📊 Slides (Leaderboards med individuella tider):</label>
                    <button 
                      onClick={handleAddSlideToSingle}
                      className="btn-secondary btn-sm"
                    >
                      ➕ Lägg till slide
                    </button>
                  </div>

                  {slideshowForm.slides.length === 0 ? (
                    <div className="empty-state-box">
                      <p>Inga slides än. Klicka "Lägg till slide" för att skapa!</p>
                    </div>
                  ) : (
                    <>
                      <div className="slides-list">
                        {slideshowForm.slides.map((slide, index) => {
                          const selectedLb = leaderboards.find(lb => lb.id === slide.leaderboardId);
                          
                          return (
                            <div key={index} className="slide-config-card">
                              <div className="slide-config-header">
                                <div className="slide-number">
                                  <span className="slide-badge">#{index + 1}</span>
                                  <h4>Slide {index + 1}</h4>
                                </div>
                                <div className="slide-actions">
                                  <button 
                                    onClick={() => handleReorderSlide(index, 'up')}
                                    disabled={index === 0}
                                    className="btn-icon"
                                    title="Flytta upp"
                                  >
                                    ▲
                                  </button>
                                  <button 
                                    onClick={() => handleReorderSlide(index, 'down')}
                                    disabled={index === slideshowForm.slides.length - 1}
                                    className="btn-icon"
                                    title="Flytta ner"
                                  >
                                    ▼
                                  </button>
                                  <button 
                                    onClick={() => handleRemoveSlideFromSingle(index)}
                                    className="btn-icon btn-danger"
                                    title="Ta bort"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </div>

                              <div className="slide-config-body">
                                {/* Leaderboard Selection */}
                                <div className="form-group">
                                  <label>Leaderboard:</label>
                                  <select
                                    value={slide.leaderboardId || ''}
                                    onChange={(e) => handleUpdateSlide(index, 'leaderboardId', e.target.value)}
                                    className={!slide.leaderboardId ? 'select-error' : ''}
                                  >
                                    <option value="">Välj leaderboard...</option>
                                    {leaderboards.map(lb => (
                                      <option key={lb.id} value={lb.id}>
                                        {lb.name}
                                      </option>
                                    ))}
                                  </select>
                                  
                                  {selectedLb && (
                                    <div className="lb-meta-badges">
                                      <span className="meta-badge">
                                        {selectedLb.timePeriod === 'day' && '📅 Dag'}
                                        {selectedLb.timePeriod === 'week' && '📅 Vecka'}
                                        {selectedLb.timePeriod === 'month' && '📅 Månad'}
                                        {selectedLb.timePeriod === 'custom' && '📅 Anpassad'}
                                      </span>
                                      <span className="meta-badge">
                                        {selectedLb.userGroups?.length === 0 ? '👥 Alla agenter' : `👥 ${selectedLb.userGroups.length} grupper`}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Duration */}
                                <div className="form-group">
                                  <label>⏱️ Visningstid:</label>
                                  <div className="duration-input-group">
                                    <input
                                      type="number"
                                      min="10"
                                      max="600"
                                      value={slide.duration}
                                      onChange={(e) => handleUpdateSlide(index, 'duration', parseInt(e.target.value))}
                                      className="duration-input"
                                    />
                                    <span className="duration-unit">sekunder</span>
                                    <span className="duration-display">
                                      ({formatDuration(slide.duration)})
                                    </span>
                                  </div>
                                </div>

                                {/* Preview */}
                                {selectedLb && (
                                  <div className="slide-preview">
                                    <span className="preview-icon">👁️</span>
                                    <span className="preview-text">
                                      "{selectedLb.name}" visas i <strong>{formatDuration(slide.duration)}</strong>
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Summary */}
                      <div className="slideshow-summary">
                        <h4>📊 Sammanfattning</h4>
                        <div className="summary-stats">
                          <div className="summary-stat">
                            <span className="stat-label">Slides:</span>
                            <span className="stat-value">{slideshowForm.slides.length}</span>
                          </div>
                          <div className="summary-stat">
                            <span className="stat-label">Total tid:</span>
                            <span className="stat-value">
                              {formatDuration(slideshowForm.slides.reduce((sum, s) => sum + (s.duration || 0), 0))}
                            </span>
                          </div>
                          <div className="summary-stat">
                            <span className="stat-label">Genomsnitt per slide:</span>
                            <span className="stat-value">
                              {formatDuration(Math.round(slideshowForm.slides.reduce((sum, s) => sum + (s.duration || 0), 0) / slideshowForm.slides.length))}
                            </span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ============================================ */}
            {/* DUAL MODE */}
            {/* ============================================ */}
            {slideshowForm.type === 'dual' && (
              <div className="slideshow-config-section">
                <div className="form-group">
                  <div className="section-header-inline">
                    <label>📊📊 Dual Slides:</label>
                    <button 
                      onClick={handleAddDualSlide}
                      className="btn-secondary btn-sm"
                    >
                      ➕ Lägg till dual slide
                    </button>
                  </div>

                  {slideshowForm.dualSlides.length === 0 ? (
                    <div className="empty-state-box">
                      <p>Inga dual slides än. Klicka "Lägg till dual slide" för att skapa!</p>
                    </div>
                  ) : (
                    <>
                      <div className="slides-list">
                        {slideshowForm.dualSlides.map((slide, index) => {
                          const leftLb = leaderboards.find(lb => lb.id === slide.left);
                          const rightLb = leaderboards.find(lb => lb.id === slide.right);
                          
                          return (
                            <div key={index} className="slide-config-card dual-slide">
                              <div className="slide-config-header">
                                <div className="slide-number">
                                  <span className="slide-badge">#{index + 1}</span>
                                  <h4>Dual Slide {index + 1}</h4>
                                </div>
                                <div className="slide-actions">
                                  <button 
                                    onClick={() => handleReorderDualSlide(index, 'up')}
                                    disabled={index === 0}
                                    className="btn-icon"
                                    title="Flytta upp"
                                  >
                                    ▲
                                  </button>
                                  <button 
                                    onClick={() => handleReorderDualSlide(index, 'down')}
                                    disabled={index === slideshowForm.dualSlides.length - 1}
                                    className="btn-icon"
                                    title="Flytta ner"
                                  >
                                    ▼
                                  </button>
                                  <button 
                                    onClick={() => handleRemoveDualSlide(index)}
                                    className="btn-icon btn-danger"
                                    title="Ta bort"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </div>

                              <div className="slide-config-body dual-config">
                                <div className="dual-selectors">
                                  {/* Left Leaderboard */}
                                  <div className="dual-selector-box">
                                    <label>📊 Vänster:</label>
                                    <select
                                      value={slide.left || ''}
                                      onChange={(e) => handleUpdateDualSlide(index, 'left', e.target.value)}
                                      className={!slide.left ? 'select-error' : ''}
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
                                      <div className="lb-meta-badges">
                                        <span className="meta-badge">
                                          {leftLb.userGroups?.length === 0 ? '👥 Alla' : `👥 ${leftLb.userGroups.length}`}
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  <div className="dual-separator">⇄</div>

                                  {/* Right Leaderboard */}
                                  <div className="dual-selector-box">
                                    <label>📊 Höger:</label>
                                    <select
                                      value={slide.right || ''}
                                      onChange={(e) => handleUpdateDualSlide(index, 'right', e.target.value)}
                                      className={!slide.right ? 'select-error' : ''}
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
                                      <div className="lb-meta-badges">
                                        <span className="meta-badge">
                                          {rightLb.userGroups?.length === 0 ? '👥 Alla' : `👥 ${rightLb.userGroups.length}`}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Duration */}
                                <div className="form-group">
                                  <label>⏱️ Visningstid:</label>
                                  <div className="duration-input-group">
                                    <input
                                      type="number"
                                      min="10"
                                      max="300"
                                      value={slide.duration}
                                      onChange={(e) => handleUpdateDualSlide(index, 'duration', parseInt(e.target.value))}
                                      className="duration-input"
                                    />
                                    <span className="duration-unit">sekunder</span>
                                    <span className="duration-display">
                                      ({formatDuration(slide.duration)})
                                    </span>
                                  </div>
                                </div>

                                {/* Auto-scroll info */}
                                {(slide.left || slide.right) && (
                                  <div className="slide-info-box">
                                    <span className="info-icon">ℹ️</span>
                                    <span className="info-text">
                                      Auto-scroll aktiveras automatiskt om någon leaderboard har fler än 18 agenter
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Summary */}
                      <div className="slideshow-summary">
                        <h4>📊 Sammanfattning</h4>
                        <div className="summary-stats">
                          <div className="summary-stat">
                            <span className="stat-label">Dual Slides:</span>
                            <span className="stat-value">{slideshowForm.dualSlides.length}</span>
                          </div>
                          <div className="summary-stat">
                            <span className="stat-label">Total tid:</span>
                            <span className="stat-value">
                              {formatDuration(slideshowForm.dualSlides.reduce((sum, s) => sum + (s.duration || 0), 0))}
                            </span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ACTIVE CHECKBOX */}
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

            {/* ACTIONS */}
            <div className="modal-actions">
              <button onClick={() => setShowSlideshowModal(false)} className="btn-secondary">
                Avbryt
              </button>
              <button onClick={handleSaveSlideshow} className="btn-primary">
                💾 Spara Slideshow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
