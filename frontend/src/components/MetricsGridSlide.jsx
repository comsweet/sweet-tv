import { useState, useEffect } from 'react';
import { getGroupMetrics } from '../services/api';
import './MetricsGridSlide.css';

/**
 * METRICS GRID SLIDE
 *
 * Modern widget-based group comparison with:
 * - Configurable metrics per group
 * - Color-coding based on rules
 * - Responsive grid layout (2x2, 2x3, 3x2)
 * - Adapts to TV size (compact/normal/large/xlarge)
 */
const MetricsGridSlide = ({ leaderboard, isActive, displaySize = 'normal', refreshKey }) => {
  const [groupMetrics, setGroupMetrics] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isActive) return;

    const fetchData = async () => {
      try {
        console.log('🔄 [MetricsGrid] Fetching data for leaderboard:', leaderboard.id);
        const response = await getGroupMetrics(leaderboard.id);
        console.log('✅ [MetricsGrid] Response:', response.data);

        setGroupMetrics(response.data.groupMetrics || []);
        setError(null);

        if (!response.data.groupMetrics || response.data.groupMetrics.length === 0) {
          console.warn('⚠️ [MetricsGrid] No group metrics returned');
        }
      } catch (err) {
        console.error('❌ [MetricsGrid] Error fetching data:', err);
        console.error('Error details:', err.response?.data || err.message);
        setError(err.response?.data?.error || err.message || 'Kunde inte ladda data');
      }
    };

    fetchData();

    // Auto-refresh every 30 seconds (silent, no loading spinner)
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [isActive, leaderboard.id, refreshKey]);

  // Determine grid layout based on number of groups
  const getGridLayout = (numGroups) => {
    if (numGroups <= 2) return 'grid-2x1';
    if (numGroups <= 4) return 'grid-2x2'; // 2 columns, 2 rows = 4 groups max
    if (numGroups <= 6) return 'grid-3x2';
    return 'grid-3x3';
  };

  // Get color for metric value based on per-group rules
  const getMetricColor = (metricId, groupId, value) => {
    const metricRules = leaderboard.colorRules?.[metricId];
    if (!metricRules) return null;

    // Support both old (array) and new (per-group object) structure
    const rules = Array.isArray(metricRules)
      ? metricRules  // Old structure: global rules
      : metricRules[groupId] || []; // New structure: per-group rules

    if (!rules || rules.length === 0) return null;

    // Sort rules by threshold for proper evaluation
    const sortedRules = [...rules].sort((a, b) => {
      if (a.min !== undefined && b.min !== undefined) return a.min - b.min;
      if (a.max !== undefined && b.max !== undefined) return a.max - b.max;
      return 0;
    });

    for (const rule of sortedRules) {
      if (rule.min !== undefined && rule.max !== undefined) {
        if (value >= rule.min && value < rule.max) return rule.color;
      } else if (rule.min !== undefined) {
        if (value >= rule.min) return rule.color;
      } else if (rule.max !== undefined) {
        if (value < rule.max) return rule.color;
      }
    }

    return null;
  };

  // Format metric value for display
  const formatValue = (metricData, metricConfig) => {
    const { value, additionalData } = metricData;
    const { metric } = metricConfig;

    if (metric.includes('PerHour') || metric.includes('per_hour')) {
      return value.toFixed(2);
    }
    if (metric.includes('rate') || metric.includes('Rate') || metric.includes('success')) {
      // Show SMS count if available
      if (additionalData?.uniqueSMS) {
        return `${value}% (${additionalData.uniqueSMS} SMS)`;
      }
      return `${value}%`;
    }
    if (metric.includes('commission') || metric.includes('Commission')) {
      return `${Math.round(value).toLocaleString('sv-SE')} kr`;
    }
    return value.toString();
  };

  // Show error or no data message if needed, but keep it subtle
  const showNoData = groupMetrics.length === 0 && !error;

  // Build metrics list (all metrics from first group, in order)
  const metricsList = leaderboard.metrics || [];

  // Calculate column colors based on worst metric in each group
  const getGroupColumnColor = (group) => {
    const colorPriority = { red: 1, orange: 2, yellow: 3, white: 4, green: 5, blue: 6 };
    let worstColor = null;
    let lowestPriority = 999;

    Object.entries(group.metrics).forEach(([metricId, metricData]) => {
      const color = getMetricColor(metricId, group.groupId, metricData.value);
      if (color && colorPriority[color] < lowestPriority) {
        worstColor = color;
        lowestPriority = colorPriority[color];
      }
    });

    return worstColor;
  };

  return (
    <div className={`metrics-grid-slide ${displaySize}`}>
      {/* Header with leaderboard name */}
      <div className="metrics-grid-header">
        <h1>{leaderboard.name}</h1>
      </div>

      {/* Debug info - shows config */}
      {(error || showNoData) && (
        <div style={{
          background: 'rgba(0,0,0,0.5)',
          padding: '1rem',
          margin: '1rem',
          borderRadius: '0.5rem',
          fontSize: '0.9rem',
          color: '#ccc',
          textAlign: 'left'
        }}>
          <strong>🔍 Debug Info:</strong><br/>
          Leaderboard ID: {leaderboard.id}<br/>
          Type: {leaderboard.type}<br/>
          Selected Groups: {(leaderboard.selectedGroups || []).length} grupper<br/>
          Configured Metrics: {(leaderboard.metrics || []).length} metrics<br/>
          Groups in response: {groupMetrics.length}<br/>
        </div>
      )}

      {/* Show error or no data message */}
      {error && (
        <div className="metrics-error-subtle">
          <p>⚠️ FEL: {error}</p>
          <p style={{ fontSize: '1.5rem', marginTop: '1rem' }}>
            Kolla console (F12) för mer info
          </p>
        </div>
      )}

      {showNoData && !error && (
        <div className="metrics-no-data-subtle">
          <p>📊 Ingen data tillgänglig</p>
          <p style={{ fontSize: '1.5rem', marginTop: '1rem' }}>
            Kontrollera att grupper och metrics är konfigurerade
          </p>
        </div>
      )}

      {/* Modern Table Layout - Always render if we have data */}
      {groupMetrics.length > 0 && (
        <div className="metrics-table-container">
          <table className="metrics-table">
            <thead>
              <tr>
                <th className="metric-name-header">Metric</th>
                {groupMetrics.map((group) => {
                  const columnColor = getGroupColumnColor(group);
                  return (
                    <th
                      key={group.groupId}
                      className={`group-header ${columnColor ? `color-${columnColor}` : ''}`}
                      style={columnColor ? {
                        backgroundColor: `${getColorHex(columnColor)}15`,
                        borderBottom: `3px solid ${getColorHex(columnColor)}`,
                        boxShadow: `0 0 15px ${getColorHex(columnColor)}30`
                      } : {}}
                    >
                      {group.groupName}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {metricsList.map((metricConfig) => (
                <tr key={metricConfig.id} className="metric-row">
                  <td className="metric-name">{metricConfig.label}</td>
                  {groupMetrics.map((group) => {
                    const metricData = group.metrics[metricConfig.id];
                    if (!metricData) {
                      return <td key={group.groupId} className="metric-value">-</td>;
                    }

                    const color = getMetricColor(metricConfig.id, group.groupId, metricData.value);
                    const columnColor = getGroupColumnColor(group);

                    return (
                      <td
                        key={group.groupId}
                        className={`metric-value ${color ? `color-${color}` : ''}`}
                        style={color ? {
                          backgroundColor: getColorHex(color),
                          color: getTextColor(color),
                          fontWeight: 700
                        } : columnColor ? {
                          backgroundColor: `${getColorHex(columnColor)}08`
                        } : {}}
                      >
                        {formatValue(metricData, metricConfig)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Helper: Convert color name to hex
const getColorHex = (colorName) => {
  const colors = {
    red: '#ef4444',
    orange: '#f97316',
    yellow: '#fbbf24',
    white: '#ffffff',
    green: '#22c55e',
    blue: '#3b82f6',
    purple: '#a855f7',
    gray: '#6b7280'
  };
  return colors[colorName] || colors.white;
};

// Helper: Get text color based on background
const getTextColor = (bgColor) => {
  const darkBgs = ['red', 'orange', 'blue', 'purple', 'green'];
  return darkBgs.includes(bgColor) ? '#ffffff' : '#000000';
};

export default MetricsGridSlide;
