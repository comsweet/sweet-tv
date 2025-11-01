// 🎯 ADMIN.JSX - Modern Sidebar Design

import { useState } from 'react';
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
import AdminAuditLogs from '../components/AdminAuditLogs';
import AdminAPIMonitoring from '../components/AdminAPIMonitoring';
import AdminTVCodes from '../components/AdminTVCodes';
import AdminChangePassword from '../components/AdminChangePassword';
import AdminUserManagement from '../components/AdminUserManagement';
import './Admin.css';

const Admin = () => {
  const { user, logout, isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const menuItems = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard', section: 'main' },
    { id: 'tvCodes', icon: '🔑', label: 'TV Koder', section: 'main' },
    { id: 'agents', icon: '👥', label: 'Agenter', section: 'content' },
    { id: 'groups', icon: '👨‍👩‍👧‍👦', label: 'Groups', section: 'content' },
    { id: 'leaderboards', icon: '🏆', label: 'Leaderboards', section: 'content' },
    { id: 'slideshows', icon: '🎬', label: 'Slideshows', section: 'content' },
    { id: 'sounds', icon: '🔊', label: 'Ljud', section: 'content' },
    { id: 'notifications', icon: '🔔', label: 'Notis', section: 'content' },
    { id: 'stats', icon: '📊', label: 'Statistik', section: 'analytics' },
    { id: 'campaignBonus', icon: '💰', label: 'Bonus', section: 'analytics' },
    { id: 'thresholds', icon: '🎨', label: 'Tröskelvärden', section: 'analytics' },
    { id: 'auditLogs', icon: '📋', label: 'Audit Logs', section: 'monitoring' },
    { id: 'apiMonitoring', icon: '📈', label: 'API Monitor', section: 'monitoring' },
    { id: 'cache', icon: '🗂️', label: 'Cache', section: 'system' },
    { id: 'settings', icon: '⚙️', label: 'Settings', section: 'system' },
    { id: 'changePassword', icon: '🔒', label: 'Byt Lösenord', section: 'account' },
    { id: 'users', icon: '👤', label: 'Användare', section: 'account', superadmin: isSuperAdmin },
  ];

  const renderMenuItem = (item) => (
    <div
      key={item.id}
      className={`sidebar-item ${activeTab === item.id ? 'active' : ''} ${item.superadmin ? 'superadmin' : ''}`}
      onClick={() => setActiveTab(item.id)}
    >
      <span className="sidebar-item-icon">{item.icon}</span>
      {!sidebarCollapsed && <span className="sidebar-item-label">{item.label}</span>}
    </div>
  );

  const sections = {
    main: menuItems.filter(item => item.section === 'main'),
    content: menuItems.filter(item => item.section === 'content'),
    analytics: menuItems.filter(item => item.section === 'analytics'),
    monitoring: menuItems.filter(item => item.section === 'monitoring'),
    system: menuItems.filter(item => item.section === 'system'),
    account: menuItems.filter(item => item.section === 'account'),
  };

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <div className={`admin-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          {!sidebarCollapsed && <h2>Sweet TV</h2>}
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Expandera meny' : 'Kollapsa meny'}
          >
            {sidebarCollapsed ? '→' : '←'}
          </button>
        </div>

        <div className="sidebar-content">
          {/* Main Section */}
          {sections.main.map(renderMenuItem)}

          {/* Content Management */}
          {!sidebarCollapsed && <div className="sidebar-section-title">Innehåll</div>}
          {sections.content.map(renderMenuItem)}

          {/* Analytics */}
          {!sidebarCollapsed && <div className="sidebar-section-title">Analys</div>}
          {sections.analytics.map(renderMenuItem)}

          {/* Monitoring */}
          {!sidebarCollapsed && <div className="sidebar-section-title">Övervakning</div>}
          {sections.monitoring.map(renderMenuItem)}

          {/* System */}
          {!sidebarCollapsed && <div className="sidebar-section-title">System</div>}
          {sections.system.map(renderMenuItem)}

          {/* Account */}
          {!sidebarCollapsed && <div className="sidebar-section-title">Konto</div>}
          {sections.account.map(renderMenuItem)}
        </div>

        <div className="sidebar-footer">
          {!sidebarCollapsed && (
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user?.name}</div>
              <div className="sidebar-user-role">{user?.role}</div>
            </div>
          )}
          <button onClick={logout} className="sidebar-logout">
            🚪 {!sidebarCollapsed && 'Logga ut'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="admin-main">
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
          {activeTab === 'users' && <AdminUserManagement />}
          {activeTab === 'settings' && <AdminAutoRefreshSettings />}
        </div>
      </div>
    </div>
  );
};

export default Admin;
