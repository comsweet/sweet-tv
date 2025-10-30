// 🎯 REFAKTORERAD ADMIN.JSX - Modulär arkitektur med separata komponenter

import { useState } from 'react';
import AdminAgents from '../components/AdminAgents';
import AdminGroups from '../components/AdminGroups';
import AdminLeaderboards from '../components/AdminLeaderboards';
import AdminSlideshows from '../components/AdminSlideshows';
import AdminSounds from '../components/AdminSounds';
import AdminStats from '../components/AdminStats';
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

  const [activeTab, setActiveTab] = useState('agents');

  // 🔐 AUTHENTICATION
  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    const correctPassword = import.meta.env.VITE_ADMIN_PASSWORD || 'admin123';

    if (password === correctPassword) {
      localStorage.setItem('sweetTvAdminAuth', 'true');
      setIsAuthenticated(true);
      setPassword('');
    } else {
      setLoginError('Felaktigt lösenord');
    }

    setIsLoggingIn(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('sweetTvAdminAuth');
    setIsAuthenticated(false);
    setActiveTab('agents');
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
      </div>

      <div className="admin-content">
        {activeTab === 'agents' && <AdminAgents />}
        {activeTab === 'groups' && <AdminGroups />}
        {activeTab === 'leaderboards' && <AdminLeaderboards />}
        {activeTab === 'slideshows' && <AdminSlideshows />}
        {activeTab === 'sounds' && <AdminSounds />}
        {activeTab === 'notifications' && <NotificationSettingsAdmin />}
        {activeTab === 'stats' && <AdminStats />}
      </div>
    </div>
  );
};

export default Admin;
