import { useState, useEffect } from 'react';
import {
  getDealsCacheStats,
  getSMSCacheStats,
  syncDealsManually,
  cleanOldDeals,
  clearDealsCache,
  syncSMSManually,
  cleanOldSMS,
  clearSMSCache
} from '../services/api';
import './AdminCacheManagement.css';

const AdminCacheManagement = () => {
  const [dealsStats, setDealsStats] = useState(null);
  const [smsStats, setSmsStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Loading states for individual actions
  const [dealsSyncing, setDealsSyncing] = useState(false);
  const [dealsCleaning, setDealsCleaning] = useState(false);
  const [dealsClearing, setDealsClearing] = useState(false);

  const [smsSyncing, setSmsSyncing] = useState(false);
  const [smsCleaning, setSmsCleaning] = useState(false);
  const [smsClearing, setSmsClearing] = useState(false);

  useEffect(() => {
    fetchAllStats();
  }, []);

  const fetchAllStats = async () => {
    setLoading(true);
    try {
      const [dealsResponse, smsResponse] = await Promise.all([
        getDealsCacheStats(),
        getSMSCacheStats()
      ]);

      setDealsStats(dealsResponse.data);
      setSmsStats(smsResponse.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
      alert('Error loading cache stats: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString || dateString === 'Never') return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString('sv-SE');
  };

  // DEALS ACTIONS
  const handleSyncDeals = async () => {
    setDealsSyncing(true);
    try {
      const response = await syncDealsManually();
      alert(`✅ Synced ${response.data.deals} deals successfully!`);
      await fetchAllStats();
    } catch (error) {
      console.error('Error syncing deals:', error);
      alert('❌ Error syncing deals: ' + error.message);
    } finally {
      setDealsSyncing(false);
    }
  };

  const handleCleanOldDeals = async () => {
    if (!window.confirm('🧹 Are you sure you want to clean old deals outside the rolling window?\n\nThis will remove old data but keep recent deals.')) {
      return;
    }

    setDealsCleaning(true);
    try {
      const response = await cleanOldDeals();
      alert(`✅ Cleaned old deals!\n\nRemaining: ${response.data.stats.totalDeals} deals`);
      await fetchAllStats();
    } catch (error) {
      console.error('Error cleaning deals:', error);
      alert('❌ Error cleaning deals: ' + error.message);
    } finally {
      setDealsCleaning(false);
    }
  };

  const handleClearDealsCache = async () => {
    if (!window.confirm('🚨 WARNING: This will DELETE ALL deals from cache!\n\nAre you absolutely sure?\n\nThis action cannot be undone.')) {
      return;
    }

    // Double confirmation for destructive action
    if (!window.confirm('⚠️ FINAL WARNING\n\nAll deals data will be permanently deleted.\n\nClick OK to proceed or Cancel to abort.')) {
      return;
    }

    setDealsClearing(true);
    try {
      await clearDealsCache();
      alert('✅ Deals cache cleared completely!');
      await fetchAllStats();
    } catch (error) {
      console.error('Error clearing deals cache:', error);
      alert('❌ Error clearing cache: ' + error.message);
    } finally {
      setDealsClearing(false);
    }
  };

  // SMS ACTIONS
  const handleSyncSMS = async () => {
    setSmsSyncing(true);
    try {
      await syncSMSManually();
      alert('✅ SMS cache synced successfully!');
      await fetchAllStats();
    } catch (error) {
      console.error('Error syncing SMS:', error);
      alert('❌ Error syncing SMS: ' + error.message);
    } finally {
      setSmsSyncing(false);
    }
  };

  const handleCleanOldSMS = async () => {
    if (!window.confirm('🧹 Are you sure you want to clean old SMS outside the rolling window?\n\nThis will remove old data but keep recent SMS.')) {
      return;
    }

    setSmsCleaning(true);
    try {
      const response = await cleanOldSMS();
      alert(`✅ Cleaned old SMS!\n\nRemaining: ${response.data.stats.totalSMS} SMS`);
      await fetchAllStats();
    } catch (error) {
      console.error('Error cleaning SMS:', error);
      alert('❌ Error cleaning SMS: ' + error.message);
    } finally {
      setSmsCleaning(false);
    }
  };

  const handleClearSMSCache = async () => {
    if (!window.confirm('🚨 WARNING: This will DELETE ALL SMS from cache!\n\nAre you absolutely sure?\n\nThis action cannot be undone.')) {
      return;
    }

    // Double confirmation for destructive action
    if (!window.confirm('⚠️ FINAL WARNING\n\nAll SMS data will be permanently deleted.\n\nClick OK to proceed or Cancel to abort.')) {
      return;
    }

    setSmsClearing(true);
    try {
      await clearSMSCache();
      alert('✅ SMS cache cleared completely!');
      await fetchAllStats();
    } catch (error) {
      console.error('Error clearing SMS cache:', error);
      alert('❌ Error clearing cache: ' + error.message);
    } finally {
      setSmsClearing(false);
    }
  };

  if (loading) {
    return <div className="cache-loading">Loading cache management...</div>;
  }

  return (
    <div className="cache-management">
      <div className="cache-header">
        <h1>🗂️ Cache Management</h1>
        <p className="cache-subtitle">Manage and sync your Deals and SMS cache</p>
      </div>

      <div className="cache-grid">
        {/* DEALS CACHE */}
        <div className="cache-section deals-section">
          <div className="section-header">
            <h2>🎯 Deals Cache</h2>
            <div className="header-actions">
              <button
                onClick={fetchAllStats}
                className="btn-refresh"
                disabled={loading}
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          <div className="cache-stats">
            <div className="stat-grid">
              <div className="stat-box">
                <div className="stat-label">Total Deals</div>
                <div className="stat-value">{dealsStats?.totalDeals?.toLocaleString('sv-SE') || 0}</div>
              </div>

              <div className="stat-box">
                <div className="stat-label">Total Commission</div>
                <div className="stat-value">{(dealsStats?.totalCommission || 0).toLocaleString('sv-SE')} THB</div>
              </div>

              <div className="stat-box">
                <div className="stat-label">Unique Agents</div>
                <div className="stat-value">{dealsStats?.uniqueAgents || 0}</div>
              </div>

              <div className="stat-box">
                <div className="stat-label">Queue Length</div>
                <div className="stat-value">{dealsStats?.queueLength || 0}</div>
              </div>
            </div>

            <div className="stat-info-box">
              <div className="info-row">
                <span className="info-label">📅 Date Range:</span>
                <span className="info-value">
                  {dealsStats?.rollingWindow?.start && dealsStats?.rollingWindow?.end
                    ? `${new Date(dealsStats.rollingWindow.start).toLocaleDateString('sv-SE')} - ${new Date(dealsStats.rollingWindow.end).toLocaleDateString('sv-SE')}`
                    : 'N/A'}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">🕐 Last Sync:</span>
                <span className="info-value">{formatDate(dealsStats?.lastSync)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">📊 Needs Sync:</span>
                <span className={`info-value ${dealsStats?.needsImmediateSync ? 'needs-sync' : ''}`}>
                  {dealsStats?.needsImmediateSync ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>

          <div className="cache-actions">
            <button
              onClick={handleSyncDeals}
              className="btn-action btn-sync"
              disabled={dealsSyncing}
            >
              {dealsSyncing ? '⏳ Syncing...' : '🔄 Sync Now'}
            </button>

            <button
              onClick={handleCleanOldDeals}
              className="btn-action btn-clean"
              disabled={dealsCleaning}
            >
              {dealsCleaning ? '⏳ Cleaning...' : '🧹 Clean Old'}
            </button>

            <button
              onClick={handleClearDealsCache}
              className="btn-action btn-danger"
              disabled={dealsClearing}
            >
              {dealsClearing ? '⏳ Clearing...' : '🗑️ Clear Cache'}
            </button>
          </div>
        </div>

        {/* SMS CACHE */}
        <div className="cache-section sms-section">
          <div className="section-header">
            <h2>📱 SMS Cache</h2>
            <div className="header-actions">
              <button
                onClick={fetchAllStats}
                className="btn-refresh"
                disabled={loading}
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          <div className="cache-stats">
            <div className="stat-grid">
              <div className="stat-box">
                <div className="stat-label">Total SMS</div>
                <div className="stat-value">{smsStats?.totalSMS?.toLocaleString('sv-SE') || 0}</div>
              </div>

              <div className="stat-box">
                <div className="stat-label">Success Rate</div>
                <div className="stat-value">
                  {smsStats?.totalSMS > 0
                    ? ((smsStats.statusBreakdown?.success || 0) / smsStats.totalSMS * 100).toFixed(1)
                    : 0}%
                </div>
              </div>

              <div className="stat-box">
                <div className="stat-label">Unique Agents</div>
                <div className="stat-value">{smsStats?.uniqueAgents || 0}</div>
              </div>

              <div className="stat-box">
                <div className="stat-label">Failed SMS</div>
                <div className="stat-value">{smsStats?.statusBreakdown?.failed || 0}</div>
              </div>
            </div>

            {smsStats?.statusBreakdown && (
              <div className="status-breakdown">
                <div className="breakdown-title">Status Breakdown:</div>
                <div className="breakdown-grid">
                  {Object.entries(smsStats.statusBreakdown).map(([status, count]) => (
                    <div key={status} className={`breakdown-item ${status}`}>
                      <span className="breakdown-label">{status}</span>
                      <span className="breakdown-count">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="stat-info-box">
              <div className="info-row">
                <span className="info-label">📅 Date Range:</span>
                <span className="info-value">{smsStats?.rollingWindow || 'N/A'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">🕐 Last Sync:</span>
                <span className="info-value">{formatDate(smsStats?.lastSync)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">📊 Needs Sync:</span>
                <span className={`info-value ${smsStats?.needsSync ? 'needs-sync' : ''}`}>
                  {smsStats?.needsSync ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>

          <div className="cache-actions">
            <button
              onClick={handleSyncSMS}
              className="btn-action btn-sync"
              disabled={smsSyncing}
            >
              {smsSyncing ? '⏳ Syncing...' : '🔄 Sync Now'}
            </button>

            <button
              onClick={handleCleanOldSMS}
              className="btn-action btn-clean"
              disabled={smsCleaning}
            >
              {smsCleaning ? '⏳ Cleaning...' : '🧹 Clean Old'}
            </button>

            <button
              onClick={handleClearSMSCache}
              className="btn-action btn-danger"
              disabled={smsClearing}
            >
              {smsClearing ? '⏳ Clearing...' : '🗑️ Clear Cache'}
            </button>
          </div>
        </div>
      </div>

      <div className="cache-help">
        <div className="help-section">
          <h3>💡 Cache Management Guide</h3>
          <div className="help-grid">
            <div className="help-item">
              <div className="help-icon">🔄</div>
              <div className="help-content">
                <div className="help-title">Sync Now</div>
                <div className="help-desc">Fetches latest data from Adversus API and updates cache. Safe to use anytime.</div>
              </div>
            </div>

            <div className="help-item">
              <div className="help-icon">🧹</div>
              <div className="help-content">
                <div className="help-title">Clean Old</div>
                <div className="help-desc">Removes data outside the rolling window. Keeps recent data, improves performance.</div>
              </div>
            </div>

            <div className="help-item">
              <div className="help-icon">🗑️</div>
              <div className="help-content">
                <div className="help-title">Clear Cache</div>
                <div className="help-desc">Deletes ALL cache data. Use with caution! Requires double confirmation.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminCacheManagement;
