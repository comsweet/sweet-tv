// 🎯 REFAKTORERAD ADMIN.JSX - Modulär arkitektur med separata komponenter

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
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
import AdminThresholds from '../components/AdminThresholds';
import NotificationSettingsAdmin from '../components/NotificationSettingsAdmin';
import AdminUserManagement from '../components/AdminUserManagement';
import AdminChangePassword from '../components/AdminChangePassword';
import './Admin.css';

const Admin = () => {
  const { user, logout, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // 📊 MAIN ADMIN INTERFACE
  return (
    <div className="admin-container">
      <div className="admin-header">
        <div>
          <h1>🏆 Sweet TV Admin Panel</h1>
          <p className="user-info">
            👤 {user?.name} ({user?.email}) - <strong>{user?.role}</strong>
          </p>
        </div>
        <button onClick={handleLogout} className="btn-logout">
          🚪 Logga ut
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
          className={`tab ${activeTab === 'thresholds' ? 'active' : ''}`}
          onClick={() => setActiveTab('thresholds')}
        >
          🎨 Tröskelvärden
        </button>
        <button
          className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          ⚙️ Settings
        </button>

        {/* Superadmin only */}
        {isSuperAdmin() && (
          <button
            className={`tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            👥 Användare
          </button>
        )}

        <button
          className={`tab ${activeTab === 'password' ? 'active' : ''}`}
          onClick={() => setActiveTab('password')}
        >
          🔒 Byt Lösenord
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
        {activeTab === 'thresholds' && <AdminThresholds />}
        {activeTab === 'settings' && <AdminAutoRefreshSettings />}
        {activeTab === 'users' && isSuperAdmin() && <AdminUserManagement />}
        {activeTab === 'password' && <AdminChangePassword />}
      </div>
    </div>
  );
};

export default Admin;
