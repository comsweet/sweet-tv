// 🎯 REFAKTORERAD ADMIN.JSX - Modulär arkitektur med JWT Authentication

import { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
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
import AdminAuditLogs from '../components/AdminAuditLogs';
import AdminAPIMonitoring from '../components/AdminAPIMonitoring';
import AdminTVCodes from '../components/AdminTVCodes';
import AdminChangePassword from '../components/AdminChangePassword';
import AdminUserManagement from '../components/AdminUserManagement';
import './Admin.css';

const Admin = () => {
  const { user, logout, isSuperAdmin } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState('dashboard');

  // 📊 MAIN ADMIN INTERFACE
  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1 style={{ margin: 0 }}>🏆 Sweet TV Admin Panel</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{
            fontSize: '14px',
            color: '#fff',
            background: 'rgba(255,255,255,0.2)',
            padding: '8px 16px',
            borderRadius: '20px'
          }}>
            <strong>{user?.name}</strong> · {user?.role}
          </div>
          <button onClick={logout} className="btn-logout">
            🚪 Logga ut
          </button>
        </div>
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
          🗂️ Cache
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
          🔔 Notis
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
          💰 Bonus
        </button>
        <button
          className={`tab ${activeTab === 'thresholds' ? 'active' : ''}`}
          onClick={() => setActiveTab('thresholds')}
        >
          🎨 Tröskelvärden
        </button>
        <button
          className={`tab ${activeTab === 'tvCodes' ? 'active' : ''}`}
          onClick={() => setActiveTab('tvCodes')}
        >
          🔑 TV Koder
        </button>
        <button
          className={`tab ${activeTab === 'auditLogs' ? 'active' : ''}`}
          onClick={() => setActiveTab('auditLogs')}
        >
          📋 Audit Logs
        </button>
        <button
          className={`tab ${activeTab === 'apiMonitoring' ? 'active' : ''}`}
          onClick={() => setActiveTab('apiMonitoring')}
        >
          📈 API Monitor
        </button>
        <button
          className={`tab ${activeTab === 'changePassword' ? 'active' : ''}`}
          onClick={() => setActiveTab('changePassword')}
        >
          🔒 Byt Lösenord
        </button>
        {isSuperAdmin && (
          <button
            className={`tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
            style={{
              background: activeTab === 'users' ? 'linear-gradient(135deg, #9c27b0 0%, #ba68c8 100%)' : 'rgba(156, 39, 176, 0.1)',
              color: activeTab === 'users' ? 'white' : '#9c27b0'
            }}
          >
            👥 Användare
          </button>
        )}
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
        {activeTab === 'thresholds' && <AdminThresholds />}
        {activeTab === 'tvCodes' && <AdminTVCodes />}
        {activeTab === 'auditLogs' && <AdminAuditLogs />}
        {activeTab === 'apiMonitoring' && <AdminAPIMonitoring />}
        {activeTab === 'changePassword' && <AdminChangePassword />}
        {activeTab === 'users' && isSuperAdmin && <AdminUserManagement />}
        {activeTab === 'settings' && <AdminAutoRefreshSettings />}
      </div>
    </div>
  );
};

export default Admin;
