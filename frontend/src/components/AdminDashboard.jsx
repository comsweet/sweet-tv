import { useState, useEffect } from 'react';
import { getDealsCacheStats, getSMSCacheStats } from '../services/api';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const [dealsStats, setDealsStats] = useState(null);
  const [smsStats, setSmsStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllStats();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchAllStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchAllStats = async () => {
    try {
      const [dealsResponse, smsResponse] = await Promise.all([
        getDealsCacheStats(),
        getSMSCacheStats()
      ]);

      setDealsStats(dealsResponse.data);
      setSmsStats(smsResponse.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>;
  }

  return (
    <div className="admin-dashboard">
      <div className="dashboard-header">
        <h1>📊 Dashboard</h1>
        <p className="dashboard-subtitle">Real-time overview of your Sweet TV system</p>
      </div>

      <div className="dashboard-grid">
        {/* DEALS SECTION */}
        <div className="dashboard-card deals-card">
          <div className="card-header">
            <h2>🎯 Deals Cache</h2>
            <span className="card-badge">Active</span>
          </div>

          <div className="card-stats">
            <div className="stat-row">
              <div className="stat-item large">
                <div className="stat-icon">🎯</div>
                <div className="stat-content">
                  <div className="stat-value">{dealsStats?.totalDeals?.toLocaleString('sv-SE') || 0}</div>
                  <div className="stat-label">Total Deals</div>
                </div>
              </div>

              <div className="stat-item large">
                <div className="stat-icon">💰</div>
                <div className="stat-content">
                  <div className="stat-value">
                    {(dealsStats?.totalCommission || 0).toLocaleString('sv-SE')} THB
                  </div>
                  <div className="stat-label">Total Commission</div>
                </div>
              </div>
            </div>

            <div className="stat-row">
              <div className="stat-item">
                <div className="stat-icon">👥</div>
                <div className="stat-content">
                  <div className="stat-value">{dealsStats?.uniqueAgents || 0}</div>
                  <div className="stat-label">Unique Agents</div>
                </div>
              </div>

              <div className="stat-item">
                <div className="stat-icon">🕐</div>
                <div className="stat-content">
                  <div className="stat-value">{formatDate(dealsStats?.lastSync)}</div>
                  <div className="stat-label">Last Sync</div>
                </div>
              </div>
            </div>

            <div className="stat-info">
              <span className="info-label">📅 Date Range:</span>
              <span className="info-value">
                {dealsStats?.rollingWindow?.start && dealsStats?.rollingWindow?.end
                  ? `${new Date(dealsStats.rollingWindow.start).toLocaleDateString('sv-SE')} - ${new Date(dealsStats.rollingWindow.end).toLocaleDateString('sv-SE')}`
                  : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* SMS SECTION */}
        <div className="dashboard-card sms-card">
          <div className="card-header">
            <h2>📱 SMS Cache</h2>
            <span className="card-badge">Active</span>
          </div>

          <div className="card-stats">
            <div className="stat-row">
              <div className="stat-item large">
                <div className="stat-icon">📱</div>
                <div className="stat-content">
                  <div className="stat-value">{smsStats?.totalSMS?.toLocaleString('sv-SE') || 0}</div>
                  <div className="stat-label">Total SMS</div>
                </div>
              </div>

              <div className="stat-item large">
                <div className="stat-icon">✅</div>
                <div className="stat-content">
                  <div className="stat-value">
                    {smsStats?.totalSMS > 0
                      ? ((smsStats.statusBreakdown?.success || 0) / smsStats.totalSMS * 100).toFixed(1)
                      : 0}%
                  </div>
                  <div className="stat-label">Success Rate</div>
                </div>
              </div>
            </div>

            <div className="stat-row">
              <div className="stat-item">
                <div className="stat-icon">👥</div>
                <div className="stat-content">
                  <div className="stat-value">{smsStats?.uniqueAgents || 0}</div>
                  <div className="stat-label">Unique Agents</div>
                </div>
              </div>

              <div className="stat-item">
                <div className="stat-icon">🕐</div>
                <div className="stat-content">
                  <div className="stat-value">{formatDate(smsStats?.lastSync)}</div>
                  <div className="stat-label">Last Sync</div>
                </div>
              </div>
            </div>

            <div className="stat-info">
              <span className="info-label">📅 Date Range:</span>
              <span className="info-value">{smsStats?.rollingWindow || 'N/A'}</span>
            </div>

            {smsStats?.statusBreakdown && (
              <div className="stat-breakdown">
                <div className="breakdown-item success">
                  <span className="breakdown-label">✅ Success</span>
                  <span className="breakdown-value">{smsStats.statusBreakdown.success || 0}</span>
                </div>
                <div className="breakdown-item failed">
                  <span className="breakdown-label">❌ Failed</span>
                  <span className="breakdown-value">{smsStats.statusBreakdown.failed || 0}</span>
                </div>
                <div className="breakdown-item pending">
                  <span className="breakdown-label">⏳ Other</span>
                  <span className="breakdown-value">
                    {Object.entries(smsStats.statusBreakdown)
                      .filter(([key]) => key !== 'success' && key !== 'failed')
                      .reduce((sum, [, val]) => sum + val, 0)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SYSTEM INFO */}
        <div className="dashboard-card system-card">
          <div className="card-header">
            <h2>⚙️ System Status</h2>
            <span className="card-badge status-ok">Healthy</span>
          </div>

          <div className="card-stats">
            <div className="system-status-item">
              <span className="status-icon">🟢</span>
              <span className="status-label">Backend API</span>
              <span className="status-value">Online</span>
            </div>

            <div className="system-status-item">
              <span className="status-icon">🟢</span>
              <span className="status-label">Cache System</span>
              <span className="status-value">Operational</span>
            </div>

            <div className="system-status-item">
              <span className="status-icon">🟢</span>
              <span className="status-label">Adversus API</span>
              <span className="status-value">Connected</span>
            </div>

            <div className="system-status-item">
              <span className="status-icon">{dealsStats?.queueLength > 0 ? '🟡' : '🟢'}</span>
              <span className="status-label">Deal Queue</span>
              <span className="status-value">{dealsStats?.queueLength || 0} pending</span>
            </div>
          </div>

          <div className="card-footer">
            <p className="footer-text">
              💡 Navigate to Cache Management to manually sync or clear caches
            </p>
          </div>
        </div>

        {/* QUICK ACTIONS */}
        <div className="dashboard-card actions-card">
          <div className="card-header">
            <h2>⚡ Quick Actions</h2>
          </div>

          <div className="quick-actions">
            <a href="/#/admin" onClick={(e) => { e.preventDefault(); window.location.hash = '/admin'; }} className="action-link">
              <div className="action-icon">👥</div>
              <div className="action-content">
                <div className="action-title">Manage Agents</div>
                <div className="action-desc">Add, edit or sync agents</div>
              </div>
            </a>

            <a href="/#/admin" onClick={(e) => { e.preventDefault(); window.location.hash = '/admin'; }} className="action-link">
              <div className="action-icon">📊</div>
              <div className="action-content">
                <div className="action-title">Leaderboards</div>
                <div className="action-desc">Create and manage leaderboards</div>
              </div>
            </a>

            <a href="/#/admin" onClick={(e) => { e.preventDefault(); window.location.hash = '/admin'; }} className="action-link">
              <div className="action-icon">🎬</div>
              <div className="action-content">
                <div className="action-title">Slideshows</div>
                <div className="action-desc">Configure slideshow displays</div>
              </div>
            </a>

            <a href="/#/admin" onClick={(e) => { e.preventDefault(); window.location.hash = '/admin'; }} className="action-link">
              <div className="action-icon">🗂️</div>
              <div className="action-content">
                <div className="action-title">Cache Management</div>
                <div className="action-desc">Sync and clear cache data</div>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
