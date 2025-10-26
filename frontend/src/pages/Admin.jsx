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

  // 🔥 FIX: handleClearDealsDatabase är nu på rätt nivå (UTANFÖR handleSyncDeals)
  const handleClearDealsDatabase = async () => {
    if (!confirm('⚠️ VARNING: Detta raderar alla deals från databasen!\n\nDetta påverkar "dagens totaler" för notifikationer.\nLeaderboards påverkas EJ (de använder deals-cache).\n\nFortsätt?')) {
      return;
    }

    try {
      const response = await axios.delete(`${API_BASE_URL}/deals/database`);
      
      if (response.data.success) {
        alert('✅ ' + response.data.message);
        console.log('✅ Cleared deals database');
        
        // Refresh om vi är på stats
        if (activeTab === 'stats') {
          fetchData();
        }
      }
    } catch (error) {
      console.error('❌ Error clearing deals database:', error);
      alert('❌ Fel: ' + (error.response?.data?.error || error.message));
    }
  };

  // 🔥 SYNC DEALS FUNKTION
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
      alert('❌ Fel vid synkning: ' + (error.response?.data?.error || error.message));
    }
    setIsSyncing(false);
  };

  // Leaderboard functions
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
      active: leaderboard.active
    });
    setShowLeaderboardModal(true);
  };

  const handleGroupToggle = (groupId) => {
    const current = leaderboardForm.userGroups;
    const updated = current.includes(groupId)
      ? current.filter(id => id !== groupId)
      : [...current, groupId];
    setLeaderboardForm({ ...leaderboardForm, userGroups: updated });
  };

  const handleSaveLeaderboard = async () => {
    if (!leaderboardForm.name.trim()) {
      alert('Ange ett namn!');
      return;
    }

    if (leaderboardForm.timePeriod === 'custom' && (!leaderboardForm.customStartDate || !leaderboardForm.customEndDate)) {
      alert('Ange både start- och slutdatum för anpassad period!');
      return;
    }

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
    if (!confirm('Ta bort denna leaderboard?')) return;
    
    try {
      await deleteLeaderboard(id);
      fetchData();
    } catch (error) {
      console.error('Error deleting leaderboard:', error);
      alert('Fel vid radering: ' + error.message);
    }
  };

  // Slideshow functions
  const handleCreateSlideshow = () => {
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

  const handleLeaderboardToggle = (lbId) => {
    const current = slideshowForm.leaderboards;
    const updated = current.includes(lbId)
      ? current.filter(id => id !== lbId)
      : [...current, lbId];
    setSlideshowForm({ ...slideshowForm, leaderboards: updated });
  };

  const handleReorderLeaderboard = (index, direction) => {
    const newOrder = [...slideshowForm.leaderboards];
    if (direction === 'up' && index > 0) {
      [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
    } else if (direction === 'down' && index < newOrder.length - 1) {
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    }
    setSlideshowForm({ ...slideshowForm, leaderboards: newOrder });
  };

  const handleSaveSlideshow = async () => {
    if (!slideshowForm.name.trim()) {
      alert('Ange ett namn!');
      return;
    }

    if (slideshowForm.leaderboards.length === 0) {
      alert('Välj minst en leaderboard!');
      return;
    }

    try {
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
    if (!confirm('Ta bort denna slideshow?')) return;
    
    try {
      await deleteSlideshow(id);
      fetchData();
    } catch (error) {
      console.error('Error deleting slideshow:', error);
      alert('Fel vid radering: ' + error.message);
    }
  };

  const getSlideshowUrl = (slideshowId) => {
    return `${window.location.origin}/slideshow/${slideshowId}`;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('URL kopierad!');
  };

  return (
    <div className="admin-container">
      <h1>Admin Panel</h1>

      <div className="tabs">
        <button 
          className={activeTab === 'agents' ? 'active' : ''} 
          onClick={() => setActiveTab('agents')}
        >
          👤 Agents
        </button>
        <button 
          className={activeTab === 'groups' ? 'active' : ''} 
          onClick={() => setActiveTab('groups')}
        >
          👥 Groups
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

      <div className="tab-content">
        {isLoading && <div className="loading">⏳ Laddar...</div>}

        {activeTab === 'agents' && (
          <div className="agents-section">
            <h2>Adversus Agents</h2>
            <div className="agents-grid">
              {agents.map(agent => (
                <div key={agent.userId} className="agent-card">
                  <div className="agent-image-container">
                    {agent.profileImage ? (
                      <img 
                        src={agent.profileImage} 
                        alt={agent.name}
                        className="agent-image"
                      />
                    ) : (
                      <div className="agent-image-placeholder">
                        <span>👤</span>
                      </div>
                    )}
                    <label className="upload-btn">
                      📷 Ladda upp
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageUpload(agent.userId, e)}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                  <div className="agent-info">
                    <h3>{agent.name}</h3>
                    <p className="agent-email">{agent.email || 'Ingen email'}</p>
                    <p className="agent-id">ID: {agent.userId}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'groups' && (
          <div className="groups-section">
            <h2>User Groups</h2>
            <div className="groups-list">
              {userGroups.map(group => (
                <div key={group.id} className="group-card">
                  <h3>{group.name}</h3>
                  <p>ID: {group.id}</p>
                  <p>Användare: {group.users?.length || 0}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="stats-section">
            <div className="stats-header">
              <h2>Statistik från Adversus</h2>
              <div className="date-filters">
                <div className="date-input">
                  <label>Från:</label>
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="date-input">
                  <label>Till:</label>
                  <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
                <button onClick={fetchData} className="btn-primary">
                  🔄 Uppdatera
                </button>
                <button 
                  onClick={handleManualPoll} 
                  className="btn-secondary"
                  disabled={isLoading}
                >
                  ⚡ Manuell Check
                </button>
              </div>
            </div>

            {/* 🔥 NYA KNAPPAR FÖR DEALS SYNC */}
            <div className="sync-section">
              <h3>🔧 Database Management</h3>
              <div className="sync-buttons">
                <button 
                  onClick={handleSyncDeals}
                  className="btn-warning"
                  disabled={isSyncing}
                >
                  {isSyncing ? '⏳ Synkar...' : '🔄 Synka Alla Deals'}
                </button>
                <button 
                  onClick={handleClearDealsDatabase}
                  className="btn-danger"
                  disabled={isSyncing}
                >
                  🗑️ Rensa Deals Database
                </button>
              </div>
              {syncProgress && (
                <div className="sync-progress">
                  {syncProgress}
                </div>
              )}
              <div className="sync-info">
                <p><strong>Synka Alla Deals:</strong> Hämtar alla deals från Adversus och sparar i database (kan ta flera minuter)</p>
                <p><strong>Rensa Database:</strong> Raderar alla deals från database (påverkar "dagens totaler" i notifikationer)</p>
              </div>
            </div>

            <div className="stats-grid">
              {stats.map((stat, index) => (
                <div key={index} className="stat-card">
                  <h3>{stat.userName}</h3>
                  <div className="stat-details">
                    <p>💰 Revenue: {stat.revenue?.toLocaleString() || 0} SEK</p>
                    <p>📞 Calls: {stat.calls || 0}</p>
                    <p>⏱️ Talk Time: {Math.round((stat.talkTime || 0) / 60)} min</p>
                    <p>✅ Deals: {stat.deals || 0}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'leaderboards' && (
          <div className="leaderboards-section">
            <div className="section-header">
              <h2>Leaderboards</h2>
              <button onClick={handleCreateLeaderboard} className="btn-primary">
                ➕ Skapa Leaderboard
              </button>
            </div>

            <div className="leaderboards-grid">
              {leaderboards.map(lb => (
                <div key={lb.id} className="leaderboard-card">
                  <div className="card-header">
                    <h3>{lb.name}</h3>
                    <span className={`status-badge ${lb.active ? 'active' : 'inactive'}`}>
                      {lb.active ? '✅ Aktiv' : '⏸️ Inaktiv'}
                    </span>
                  </div>
                  
                  <div className="card-body">
                    <p><strong>Tidsperiod:</strong> {
                      lb.timePeriod === 'day' ? 'Idag' :
                      lb.timePeriod === 'week' ? 'Denna vecka' :
                      lb.timePeriod === 'month' ? 'Denna månad' :
                      `${lb.customStartDate} → ${lb.customEndDate}`
                    }</p>
                    <p><strong>Groups:</strong> {lb.userGroups?.length > 0 ? lb.userGroups.length + ' groups' : 'Alla'}</p>
                  </div>
                  
                  <div className="card-footer">
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

        {activeTab === 'slideshows' && (
          <div className="slideshows-section">
            <div className="section-header">
              <h2>TV Slideshows</h2>
              <button onClick={handleCreateSlideshow} className="btn-primary">
                ➕ Skapa Slideshow
              </button>
            </div>

            <div className="slideshows-grid">
              {slideshows.map(slideshow => (
                <div key={slideshow.id} className="slideshow-card">
                  <div className="slideshow-card-header">
                    <h3>{slideshow.name}</h3>
                    <span className={`status-badge ${slideshow.active ? 'active' : 'inactive'}`}>
                      {slideshow.active ? '✅ Aktiv' : '⏸️ Inaktiv'}
                    </span>
                  </div>
                  
                  <div className="slideshow-card-body">
                    <p><strong>Leaderboards:</strong> {slideshow.leaderboards?.length || 0} st</p>
                    <p><strong>Duration:</strong> {slideshow.duration} sekunder/slide</p>
                    
                    <div className="slideshow-url-section">
                      <p><strong>🔗 TV URL:</strong></p>
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

      {/* Slideshow Modal */}
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
