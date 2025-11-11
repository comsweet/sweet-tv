import { useState, useEffect } from 'react';
import { getLeaderboardStats2 } from '../services/api';
import './GroupComparisonSlide.css';

/**
 * GROUP COMPARISON SLIDE
 *
 * Jämför flera user groups side-by-side i en grid-layout
 *
 * Rader (metrics):
 * 1. Order/h idag (+ antal ordrar)
 * 2. SMS% idag
 * 3. Order/h månaden
 * 4. Antal ordrar månaden
 *
 * Kolumner: En per user group
 */
const GroupComparisonSlide = ({ config, isActive }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const {
    title = 'Grupps jämförelse',
    leaderboardIds = [], // Array of leaderboard IDs (one per group)
    refreshInterval = 20000 // 20 seconds
  } = config;

  useEffect(() => {
    if (!isActive) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch stats for each leaderboard/group
        const promises = leaderboardIds.map(async (lbId) => {
          try {
            const response = await getLeaderboardStats2(lbId);
            const stats = response.data.stats || [];
            const leaderboard = response.data.leaderboard;

            // Aggregate stats for this group
            const totalDeals = stats.reduce((sum, s) => sum + (s.dealCount || 0), 0);
            const totalCommission = stats.reduce((sum, s) => sum + (s.totalCommission || 0), 0);
            const totalSMS = stats.reduce((sum, s) => sum + (s.uniqueSMS || 0), 0);
            const totalLoginSeconds = stats.reduce((sum, s) => sum + (s.loginSeconds || 0), 0);

            // Calculate aggregated metrics
            const dealsPerHour = totalLoginSeconds > 0
              ? (totalDeals / (totalLoginSeconds / 3600)).toFixed(2)
              : '0.00';

            // SMS success rate (average)
            const avgSMSRate = stats.length > 0
              ? (stats.reduce((sum, s) => sum + (s.smsSuccessRate || 0), 0) / stats.length).toFixed(1)
              : '0.0';

            return {
              groupName: leaderboard.name,
              leaderboardId: lbId,
              timePeriod: leaderboard.timePeriod,
              totalDeals,
              totalCommission,
              dealsPerHour,
              smsSuccessRate: avgSMSRate,
              totalSMS,
              agentCount: stats.length
            };
          } catch (err) {
            console.error(`Error fetching stats for leaderboard ${lbId}:`, err);
            return null;
          }
        });

        const results = await Promise.all(promises);
        setData(results.filter(r => r !== null));
        setError(null);
      } catch (err) {
        console.error('Error fetching group comparison data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Auto-refresh
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [isActive, leaderboardIds, refreshInterval]);

  if (loading) {
    return (
      <div className="group-comparison-slide">
        <div className="comparison-loading">
          <div className="spinner"></div>
          <p>Laddar gruppjämförelse...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="group-comparison-slide">
        <div className="comparison-error">
          <p>⚠️ Kunde inte ladda data</p>
          <p className="error-message">{error}</p>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="group-comparison-slide">
        <div className="comparison-no-data">
          <p>📊 Ingen data tillgänglig</p>
        </div>
      </div>
    );
  }

  // Separate data by time period
  const todayGroups = data.filter(g => g.timePeriod === 'day');
  const monthGroups = data.filter(g => g.timePeriod === 'month');

  return (
    <div className="group-comparison-slide">
      <div className="comparison-header">
        <h1>{title}</h1>
      </div>

      <div className="comparison-grid">
        {/* Header Row - Group Names */}
        <div className="grid-row grid-header">
          <div className="grid-cell metric-label"></div>
          {data.map((group, idx) => (
            <div key={idx} className="grid-cell group-header">
              <h3>{group.groupName}</h3>
              <span className="agent-count">{group.agentCount} agenter</span>
            </div>
          ))}
        </div>

        {/* Row 1: Order/h idag + antal ordrar */}
        {todayGroups.length > 0 && (
          <div className="grid-row">
            <div className="grid-cell metric-label">
              <span className="metric-title">🕒 Order/h</span>
              <span className="metric-subtitle">(idag)</span>
            </div>
            {todayGroups.map((group, idx) => (
              <div key={idx} className="grid-cell metric-value">
                <div className="primary-value">{group.dealsPerHour}</div>
                <div className="secondary-value">({group.totalDeals} ordrar)</div>
              </div>
            ))}
          </div>
        )}

        {/* Row 2: SMS% idag */}
        {todayGroups.length > 0 && (
          <div className="grid-row">
            <div className="grid-cell metric-label">
              <span className="metric-title">📱 SMS%</span>
              <span className="metric-subtitle">(idag)</span>
            </div>
            {todayGroups.map((group, idx) => (
              <div key={idx} className="grid-cell metric-value">
                <div className="primary-value sms-rate">{group.smsSuccessRate}%</div>
                <div className="secondary-value">({group.totalSMS} SMS)</div>
              </div>
            ))}
          </div>
        )}

        {/* Row 3: Order/h månaden */}
        {monthGroups.length > 0 && (
          <div className="grid-row">
            <div className="grid-cell metric-label">
              <span className="metric-title">🕒 Order/h</span>
              <span className="metric-subtitle">(månaden)</span>
            </div>
            {monthGroups.map((group, idx) => (
              <div key={idx} className="grid-cell metric-value">
                <div className="primary-value">{group.dealsPerHour}</div>
                <div className="secondary-value">({group.totalDeals} ordrar)</div>
              </div>
            ))}
          </div>
        )}

        {/* Row 4: Antal ordrar månaden */}
        {monthGroups.length > 0 && (
          <div className="grid-row">
            <div className="grid-cell metric-label">
              <span className="metric-title">🎯 Ordrar</span>
              <span className="metric-subtitle">(månaden)</span>
            </div>
            {monthGroups.map((group, idx) => (
              <div key={idx} className="grid-cell metric-value">
                <div className="primary-value deals-count">{group.totalDeals}</div>
                <div className="secondary-value">{group.totalCommission.toLocaleString('sv-SE')} THB</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default GroupComparisonSlide;
