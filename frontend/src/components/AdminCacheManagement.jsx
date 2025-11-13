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
  getLoginTimeCacheStats,
  syncLoginTimeManually,
  clearLoginTimeCache,
  syncDatabase,
  getSyncStatus,
  invalidateCache,
  backfillLoginTime,
  getPendingDuplicates
} from '../services/api';
import './AdminCacheManagement.css';

const AdminCacheManagement = () => {
  const [dealsStats, setDealsStats] = useState(null);
  const [smsStats, setSmsStats] = useState(null);
  const [loginTimeStats, setLoginTimeStats] = useState(null);
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

  const [loginTimeSyncing, setLoginTimeSyncing] = useState(false);
  const [loginTimeClearing, setLoginTimeClearing] = useState(false);

  const [dbSyncing, setDbSyncing] = useState(false);
  const [cacheInvalidating, setCacheInvalidating] = useState(false);

  const [backfillDays, setBackfillDays] = useState(30);
  const [backfilling, setBackfilling] = useState(false);

  useEffect(() => {
    fetchAllStats();
  }, []);

  const fetchAllStats = async () => {
    setLoading(true);
    try {
      const [dealsResponse, smsResponse, loginTimeResponse, statusResponse] = await Promise.all([
        getDealsCacheStats(),
        getSMSCacheStats(),
        getLoginTimeCacheStats(),
        getSyncStatus()
      ]);

      setDealsStats(dealsResponse.data);
      setSmsStats(smsResponse.data);
      setLoginTimeStats(loginTimeResponse.data);
      setSyncStatus(statusResponse.data);

      // Try to fetch pending duplicates (might fail if table doesn't exist yet)
      try {
        const duplicatesResponse = await getPendingDuplicates();
        setPendingDuplicates(duplicatesResponse.data.pending || []);
      } catch (dupError) {
        console.warn('Could not fetch pending duplicates (table might not exist yet):', dupError);
        setPendingDuplicates([]);
      }
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

  // LOGIN TIME ACTIONS
  const handleSyncLoginTime = async () => {
    setLoginTimeSyncing(true);
    try {
      const response = await syncLoginTimeManually();
      alert(`✅ Login time synced successfully!\n\nSynced ${response.data.synced} users`);
      await fetchAllStats();
    } catch (error) {
      console.error('Error syncing login time:', error);
      alert('❌ Error syncing login time: ' + error.message);
    } finally {
      setLoginTimeSyncing(false);
    }
  };

  const handleClearLoginTimeCache = async () => {
    if (!window.confirm('🚨 WARNING: This will DELETE ALL login time data from the database!\n\nAre you absolutely sure?\n\nThis action cannot be undone.')) {
      return;
    }

    if (!window.confirm('⚠️ FINAL WARNING\n\nAll login time data will be permanently deleted.\n\nClick OK to proceed or Cancel to abort.')) {
      return;
    }

    setLoginTimeClearing(true);
    try {
      await clearLoginTimeCache();
      alert('✅ Login time database cleared completely!');
      await fetchAllStats();
    } catch (error) {
      console.error('Error clearing login time database:', error);
      alert('❌ Error clearing database: ' + error.message);
    } finally {
      setLoginTimeClearing(false);
    }
  };

  const handleBackfillLoginTime = async () => {
    const estimatedMinutes = Math.ceil(backfillDays * 2 / 60);

    if (!window.confirm(`📅 Backfill Login Time\n\nDetta kommer att hämta login time för ${backfillDays} dagar bakåt från Adversus.\n\nBeräknad tid: ~${estimatedMinutes} minuter (2 sekunder per dag för att undvika rate limits)\n\nFortsätt?`)) {
      return;
    }

    setBackfilling(true);
    try {
      const response = await backfillLoginTime(backfillDays);
      const details = response.data.details;

      alert(`✅ Login Time Backfill Klar!\n\n` +
            `Dagar: ${details.successCount}/${details.totalDays}\n` +
            `Användare: ${details.userCount}\n` +
            `Period: ${new Date(details.startDate).toLocaleDateString('sv-SE')} - ${new Date(details.endDate).toLocaleDateString('sv-SE')}`);

      await fetchAllStats();
    } catch (error) {
      console.error('Error backfilling login time:', error);
      alert('❌ Backfill failed: ' + error.message);
    } finally {
      setBackfilling(false);
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
              {pendingDuplicates.length} duplicate{pendingDuplicates.length > 1 ? 's' : ''} upptäckt
            </strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#78350f' }}>
              Duplicates sparas i pending_duplicates tabellen i PostgreSQL för manuell granskning.
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
                <div className="stat-label">📅 Today's Deals (Cache)</div>
                <div className="stat-value">{dealsStats?.todayDeals?.toLocaleString('sv-SE') || 0}</div>
              </div>

              <div className="stat-box">
                <div className="stat-label">📦 Rolling Window Deals</div>
                <div className="stat-value">{dealsStats?.totalDeals?.toLocaleString('sv-SE') || 0}</div>
              </div>

              <div className="stat-box">
                <div className="stat-label">Total Commission</div>
                <div className="stat-value">{(dealsStats?.totalCommission || 0).toLocaleString('sv-SE')} THB</div>
              </div>

              <div className="stat-box">
                <div className="stat-label">🔄 Retry Queue</div>
                <div className="stat-value">{dealsStats?.retryQueueLength || 0}</div>
              </div>
            </div>

            <div className="stat-info-box">
              <div className="info-row">
                <span className="info-label">📅 Rolling Window:</span>
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
                <span className="info-label">💾 Cache Strategy:</span>
                <span className="info-value">Today's data in memory, history in PostgreSQL</span>
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
                <div className="stat-label">📅 Today's SMS (Cache)</div>
                <div className="stat-value">{smsStats?.todaySMS?.toLocaleString('sv-SE') || 0}</div>
              </div>

              <div className="stat-box">
                <div className="stat-label">📦 Rolling Window SMS</div>
                <div className="stat-value">{smsStats?.totalSMS?.toLocaleString('sv-SE') || 0}</div>
              </div>

              <div className="stat-box">
                <div className="stat-label">Unique SMS</div>
                <div className="stat-value">{smsStats?.uniqueSMS || 0}</div>
              </div>

              <div className="stat-box">
                <div className="stat-label">🔄 Retry Queue</div>
                <div className="stat-value">{smsStats?.retryQueueLength || 0}</div>
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
                <span className="info-label">📅 Rolling Window:</span>
                <span className="info-value">{smsStats?.rollingWindow || 'N/A'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">🕐 Last Sync:</span>
                <span className="info-value">{formatDate(smsStats?.lastSync)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">💾 Cache Strategy:</span>
                <span className="info-value">Today's data in memory, history in PostgreSQL</span>
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

        {/* LOGIN TIME CACHE */}
        <div className="cache-section login-time-section">
          <div className="section-header">
            <h2>🕒 Login Time Cache (Order/h)</h2>
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
                <div className="stat-label">📦 Total Records (DB)</div>
                <div className="stat-value">{loginTimeStats?.totalRecords?.toLocaleString('sv-SE') || 0}</div>
              </div>

              <div className="stat-box">
                <div className="stat-label">📅 Today's Records</div>
                <div className="stat-value">{loginTimeStats?.todayRecords || 0}</div>
              </div>

              <div className="stat-box">
                <div className="stat-label">💾 Cached Users</div>
                <div className="stat-value">{loginTimeStats?.cachedUsers || 0}</div>
              </div>

              <div className="stat-box">
                <div className="stat-label">🔄 Status</div>
                <div className="stat-value" style={{ fontSize: '13px' }}>
                  {loginTimeStats?.ongoingSync ? '⏳ Syncing...' : '✅ Ready'}
                </div>
              </div>
            </div>

            <div className="stat-info-box">
              <div className="info-row">
                <span className="info-label">🕐 Last Sync:</span>
                <span className="info-value">{formatDate(loginTimeStats?.lastSync)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">🕐 Last Today Sync:</span>
                <span className="info-value">{formatDate(loginTimeStats?.lastTodaySync)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">⏱️ Sync Interval:</span>
                <span className="info-value">{loginTimeStats?.syncIntervalMinutes || 2} minutes</span>
              </div>
              <div className="info-row">
                <span className="info-label">💾 Cache Strategy:</span>
                <span className="info-value">Smart caching: Historical (DB) + Today's (2 min refresh)</span>
              </div>
              <div className="info-row">
                <span className="info-label">📊 Data Source:</span>
                <span className="info-value">Adversus Workforce API (activity breakdown)</span>
              </div>
            </div>
          </div>

          <div className="cache-actions">
            <button
              onClick={handleSyncLoginTime}
              className="btn-action btn-sync"
              disabled={loginTimeSyncing}
            >
              {loginTimeSyncing ? '⏳ Syncing...' : '🔄 Sync Now'}
            </button>

            <button
              onClick={handleClearLoginTimeCache}
              className="btn-action btn-danger"
              disabled={loginTimeClearing}
            >
              {loginTimeClearing ? '⏳ Clearing...' : '🗑️ Clear Database'}
            </button>
          </div>

          {/* BACKFILL SECTION */}
          <div style={{
            marginTop: '20px',
            padding: '16px',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '2px solid #3b82f6',
            borderRadius: '8px'
          }}>
            <div style={{ marginBottom: '12px' }}>
              <strong style={{ color: '#1e40af', fontSize: '15px' }}>📅 Backfill Historical Data</strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#475569' }}>
                Hämta historisk login time från Adversus. Endast login time stöds för närvarande.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label htmlFor="backfillDays" style={{ fontSize: '14px', color: '#334155' }}>
                  Dagar bakåt:
                </label>
                <input
                  id="backfillDays"
                  type="number"
                  min="1"
                  max="365"
                  value={backfillDays}
                  onChange={(e) => setBackfillDays(parseInt(e.target.value) || 1)}
                  disabled={backfilling}
                  style={{
                    padding: '6px 12px',
                    fontSize: '14px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    width: '80px'
                  }}
                />
                <span style={{ fontSize: '13px', color: '#64748b' }}>
                  (~{Math.ceil(backfillDays * 2 / 60)} min)
                </span>
              </div>
              <button
                onClick={handleBackfillLoginTime}
                disabled={backfilling || backfillDays < 1 || backfillDays > 365}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  background: backfilling ? '#94a3b8' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: backfilling ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  transition: 'background 0.2s'
                }}
                onMouseOver={(e) => !backfilling && (e.target.style.background = '#2563eb')}
                onMouseOut={(e) => !backfilling && (e.target.style.background = '#3b82f6')}
              >
                {backfilling ? '⏳ Backfilling...' : '📥 Backfill Login Time'}
              </button>
            </div>
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
