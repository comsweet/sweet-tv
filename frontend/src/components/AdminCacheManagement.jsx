import { useState, useEffect } from 'react';
import {
  getDealsCacheStats,
  getSMSCacheStats,
  syncDealsManually,
  cleanOldDeals,
  clearDealsCache,
  syncSMSManually,
  cleanOldSMS,
  clearSMSCache,
  syncDatabase,
  getSyncStatus,
  invalidateCache,
  getPendingDuplicates
} from '../services/api';
import './AdminCacheManagement.css';

const AdminCacheManagement = () => {
  const [dealsStats, setDealsStats] = useState(null);
  const [smsStats, setSmsStats] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [pendingDuplicates, setPendingDuplicates] = useState([]);
  const [loading, setLoading] = useState(true);

  // Loading states for individual actions
  const [dealsSyncing, setDealsSyncing] = useState(false);
  const [dealsCleaning, setDealsCleaning] = useState(false);
  const [dealsClearing, setDealsClearing] = useState(false);

  const [smsSyncing, setSmsSyncing] = useState(false);
  const [smsCleaning, setSmsCleaning] = useState(false);
  const [smsClearing, setSmsClearing] = useState(false);

  const [dbSyncing, setDbSyncing] = useState(false);
  const [cacheInvalidating, setCacheInvalidating] = useState(false);

  useEffect(() => {
    fetchAllStats();
  }, []);

  const fetchAllStats = async () => {
    setLoading(true);
    try {
      const [dealsResponse, smsResponse, statusResponse, duplicatesResponse] = await Promise.all([
        getDealsCacheStats(),
        getSMSCacheStats(),
        getSyncStatus(),
        getPendingDuplicates()
      ]);

      setDealsStats(dealsResponse.data);
      setSmsStats(smsResponse.data);
      setSyncStatus(statusResponse.data);
      setPendingDuplicates(duplicatesResponse.data.pending || []);
    } catch (error) {
      console.error('Error fetching stats:', error);
      alert('Error loading stats: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString || dateString === 'Never') return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString('sv-SE');
  };

  // DATABASE SYNC ACTIONS
  const handleFullSync = async () => {
    if (!window.confirm('🚨 FULL SYNC: Detta kommer att radera ALLA deals och SMS från databasen och ladda om från Adversus.\n\nÄr du säker?')) {
      return;
    }

    setDbSyncing(true);
    try {
      const response = await syncDatabase('full');
      alert(`✅ Full sync klar!\n\nDeals: ${response.data.deals}\nSMS: ${response.data.sms}\nPeriod: ${response.data.period}`);
      await fetchAllStats();
    } catch (error) {
      console.error('Error syncing database:', error);
      alert('❌ Error: ' + error.message);
    } finally {
      setDbSyncing(false);
    }
  };

  const handleRollingSync = async () => {
    if (!window.confirm('🔄 ROLLING SYNC: Detta kommer att radera innevarande månad + 7 dagar före och ladda om från Adversus.\n\nÄr du säker?')) {
      return;
    }

    setDbSyncing(true);
    try {
      const response = await syncDatabase('rolling');
      alert(`✅ Rolling sync klar!\n\nPeriod: ${response.data.period}`);
      await fetchAllStats();
    } catch (error) {
      console.error('Error syncing database:', error);
      alert('❌ Error: ' + error.message);
    } finally {
      setDbSyncing(false);
    }
  };

  const handleInvalidateCache = async () => {
    if (!window.confirm('🔄 Detta kommer att töma in-memory cache och ladda om dagens data från PostgreSQL.\n\nFortsätt?')) {
      return;
    }

    setCacheInvalidating(true);
    try {
      await invalidateCache();
      alert('✅ Cache invaliderad och omladdad!');
      await fetchAllStats();
    } catch (error) {
      console.error('Error invalidating cache:', error);
      alert('❌ Error: ' + error.message);
    } finally {
      setCacheInvalidating(false);
    }
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
    return <div className="cache-loading">Loading database & cache management...</div>;
  }

  return (
    <div className="cache-management">
      <div className="cache-header">
        <h1>🗄️ Database & Cache Management</h1>
        <p className="cache-subtitle">PostgreSQL database, in-memory cache, and duplicate detection</p>
      </div>

      {/* DATABASE SYNC SECTION */}
      <div className="database-sync-section" style={{
        background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
        padding: '24px',
        borderRadius: '12px',
        marginBottom: '24px',
        border: '2px solid #0ea5e9'
      }}>
        <h2 style={{ color: '#0369a1', marginTop: 0 }}>🗄️ PostgreSQL Database Sync</h2>
        <p style={{ color: '#0c4a6e', fontSize: '14px', marginBottom: '20px' }}>
          Synkronisera databasen med Adversus. All historik sparas i PostgreSQL.
        </p>

        {syncStatus && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '20px'
          }}>
            <div className="stat-box">
              <div className="stat-label">Total Deals (DB)</div>
              <div className="stat-value">{syncStatus.deals?.totalDeals?.toLocaleString('sv-SE') || 0}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Total SMS (DB)</div>
              <div className="stat-value">{syncStatus.sms?.totalSMS?.toLocaleString('sv-SE') || 0}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Today's Deals (Cache)</div>
              <div className="stat-value">{syncStatus.deals?.todayDeals || 0}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Today's SMS (Cache)</div>
              <div className="stat-value">{syncStatus.sms?.todaySMS || 0}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">⚠️ Pending Duplicates</div>
              <div className="stat-value" style={{ color: pendingDuplicates.length > 0 ? '#dc2626' : '#16a34a' }}>
                {syncStatus.pendingDuplicates || 0}
              </div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Last Sync</div>
              <div className="stat-value" style={{ fontSize: '13px' }}>
                {formatDate(syncStatus.deals?.lastSync)}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={handleRollingSync}
            className="btn-action btn-sync"
            disabled={dbSyncing}
            style={{ flex: '1 1 200px' }}
          >
            {dbSyncing ? '⏳ Syncing...' : '🔄 Rolling Sync (Månad + 7 dagar)'}
          </button>

          <button
            onClick={handleFullSync}
            className="btn-action btn-danger"
            disabled={dbSyncing}
            style={{ flex: '1 1 200px' }}
          >
            {dbSyncing ? '⏳ Syncing...' : '🚨 Full Sync (Radera ALLT)'}
          </button>

          <button
            onClick={handleInvalidateCache}
            className="btn-action btn-clean"
            disabled={cacheInvalidating}
            style={{ flex: '1 1 200px' }}
          >
            {cacheInvalidating ? '⏳ Invalidating...' : '🔄 Invalidate Cache'}
          </button>

          <button
            onClick={fetchAllStats}
            className="btn-action"
            disabled={loading}
            style={{ flex: '0 0 auto', background: '#6b7280' }}
          >
            🔄 Refresh Stats
          </button>
        </div>
      </div>

      {/* PENDING DUPLICATES ALERT */}
      {pendingDuplicates.length > 0 && (
        <div style={{
          background: '#fef3c7',
          border: '2px solid #f59e0b',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ fontSize: '24px' }}>⚠️</span>
          <div>
            <strong style={{ color: '#92400e' }}>
              {pendingDuplicates.length} duplicate{pendingDuplicates.length > 1 ? 's' : ''} väntar på granskning
            </strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#78350f' }}>
              Gå till "Duplicate Management" sektionen nedan för att granska och besluta.
            </p>
          </div>
        </div>
      )}

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
          <h3>💡 Management Guide</h3>
          <div className="help-grid">
            <div className="help-item">
              <div className="help-icon">🔄</div>
              <div className="help-content">
                <div className="help-title">Rolling Sync</div>
                <div className="help-desc">Raderar och laddar om innevarande månad + 7 dagar före från Adversus. Säkrast alternativet.</div>
              </div>
            </div>

            <div className="help-item">
              <div className="help-icon">🚨</div>
              <div className="help-content">
                <div className="help-title">Full Sync</div>
                <div className="help-desc">Tömmer HELA databasen och laddar om från Adversus. Använd endast vid problem.</div>
              </div>
            </div>

            <div className="help-item">
              <div className="help-icon">🔄</div>
              <div className="help-content">
                <div className="help-title">Invalidate Cache</div>
                <div className="help-desc">Tömmer in-memory cache och laddar om dagens data från PostgreSQL. Snabbt och säkert.</div>
              </div>
            </div>

            <div className="help-item">
              <div className="help-icon">🧹</div>
              <div className="help-content">
                <div className="help-title">Clean Old</div>
                <div className="help-desc">Tar bort data utanför rolling window från JSON-filer. Behövs inte med PostgreSQL.</div>
              </div>
            </div>

            <div className="help-item">
              <div className="help-icon">🗑️</div>
              <div className="help-content">
                <div className="help-title">Clear Cache</div>
                <div className="help-desc">Raderar cache-data. Med PostgreSQL är detta mindre kritiskt.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminCacheManagement;
