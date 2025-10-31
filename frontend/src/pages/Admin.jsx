// 🎯 REFAKTORERAD ADMIN.JSX - Modulär arkitektur med separata komponenter

import { useState } from 'react';
import AdminDashboard from '../components/AdminDashboard';
import AdminCacheManagement from '../components/AdminCacheManagement';
import AdminAutoRefreshSettings from '../components/AdminAutoRefreshSettings';
import AdminAgents from '../components/AdminAgents';
import AdminGroups from '../components/AdminGroups';
import AdminLeaderboards from '../components/AdminLeaderboards';
import AdminSlideshows from '../components/AdminSlideshows';
import AdminSounds from '../components/AdminSounds';
import AdminStats from '../components/AdminStats';
import AdminCampaignBonusTiers from '../components/AdminCampaignBonusTiers';
import NotificationSettingsAdmin from '../components/NotificationSettingsAdmin';
import './Admin.css';

const Admin = () => {
  // 🔐 AUTHENTICATION STATE
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('sweetTvAdminAuth') === 'true';
  });
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [activeTab, setActiveTab] = useState('dashboard');

  // 🔐 AUTHENTICATION
  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    try {
      // Send password to backend for verification
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${API_BASE_URL}/auth/admin-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password })
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem('sweetTvAdminAuth', 'true');
        setIsAuthenticated(true);
        setPassword('');
        console.log('✅ Admin login successful');
      } else {
        setLoginError(data.error || 'Felaktigt lösenord');
        console.log('❌ Login failed:', data.error);
      }
    } catch (error) {
      console.error('❌ Login error:', error);
      setLoginError('Kunde inte ansluta till servern');
    }

    setIsLoggingIn(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('sweetTvAdminAuth');
    setIsAuthenticated(false);
    setActiveTab('dashboard');
  };

  // 🔐 LOGIN FORM
  if (!isAuthenticated) {
    return (
      <div className="login-container">
        <div className="login-box">
          <h1>🏆 Sweet TV Admin</h1>
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Lösenord:</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ange admin-lösenord"
                autoFocus
              />
            </div>
            {loginError && <div className="login-error">{loginError}</div>}
            <button type="submit" className="btn-primary" disabled={isLoggingIn}>
              {isLoggingIn ? 'Loggar in...' : 'Logga in'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 📊 MAIN ADMIN INTERFACE
  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>🏆 Sweet TV Admin Panel</h1>
        <button onClick={handleLogout} className="btn-logout">
          Logga ut
        </button>
      </div>

      <div className="admin-tabs">
        <button
          className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          📊 Dashboard
        </button>
        <button
          className={`tab ${activeTab === 'cache' ? 'active' : ''}`}
          onClick={() => setActiveTab('cache')}
        >
          🗂️ Cache Management
        </button>
        <button
          className={`tab ${activeTab === 'agents' ? 'active' : ''}`}
          onClick={() => setActiveTab('agents')}
        >
          👥 Agenter
        </button>
        <button
          className={`tab ${activeTab === 'groups' ? 'active' : ''}`}
          onClick={() => setActiveTab('groups')}
        >
          👨‍👩‍👧‍👦 Groups
        </button>
        <button
          className={`tab ${activeTab === 'leaderboards' ? 'active' : ''}`}
          onClick={() => setActiveTab('leaderboards')}
        >
          🏆 Leaderboards
        </button>
        <button
          className={`tab ${activeTab === 'slideshows' ? 'active' : ''}`}
          onClick={() => setActiveTab('slideshows')}
        >
          🎬 Slideshows
        </button>
        <button
          className={`tab ${activeTab === 'sounds' ? 'active' : ''}`}
          onClick={() => setActiveTab('sounds')}
        >
          🔊 Ljud
        </button>
        <button
          className={`tab ${activeTab === 'notifications' ? 'active' : ''}`}
          onClick={() => setActiveTab('notifications')}
        >
          🔔 Notifikationer
        </button>
        <button
          className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          📊 Statistik
        </button>
        <button
          className={`tab ${activeTab === 'campaignBonus' ? 'active' : ''}`}
          onClick={() => setActiveTab('campaignBonus')}
        >
          💰 Kampanjbonus
        </button>
        <button
          className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          ⚙️ Settings
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'dashboard' && <AdminDashboard />}
        {activeTab === 'cache' && <AdminCacheManagement />}
        {activeTab === 'agents' && <AdminAgents />}
        {activeTab === 'groups' && <AdminGroups />}
        {activeTab === 'leaderboards' && <AdminLeaderboards />}
        {activeTab === 'slideshows' && <AdminSlideshows />}
        {activeTab === 'sounds' && <AdminSounds />}
        {activeTab === 'notifications' && <NotificationSettingsAdmin />}
        {activeTab === 'stats' && <AdminStats />}
        {activeTab === 'campaignBonus' && <AdminCampaignBonusTiers />}
        {activeTab === 'settings' && <AdminAutoRefreshSettings />}
      </div>
    </div>
  );
};

export default Admin;
