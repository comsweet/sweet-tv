import { useState, useEffect, useRef } from 'react';
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
 * - Auto-scales to fit content without scrolling
 */
const MetricsGridSlide = ({ leaderboard, isActive, displaySize = 'normal', refreshKey }) => {
  const [groupMetrics, setGroupMetrics] = useState([]);
  const [error, setError] = useState(null);
  const [scaleFactor, setScaleFactor] = useState(1);
  const containerRef = useRef(null);
  const tableRef = useRef(null);

  useEffect(() => {
    if (!isActive) return;

    const fetchData = async () => {
      try {
        console.log('🔄 [MetricsGrid] Fetching data for leaderboard:', leaderboard.id);
        const response = await getGroupMetrics(leaderboard.id);
        console.log('✅ [MetricsGrid] Response:', response.data);

        // Validate response data
        if (!response.data || !response.data.groupMetrics) {
          console.warn('⚠️ [MetricsGrid] Invalid response structure:', response.data);
          setError('Invalid response from server');
          return;
        }

        setGroupMetrics(response.data.groupMetrics || []);
        setError(null);

        if (response.data.groupMetrics.length === 0) {
          console.warn('⚠️ [MetricsGrid] No group metrics returned');
        }
      } catch (err) {
        console.error('❌ [MetricsGrid] Error fetching data:', err);
        console.error('Error details:', err.response?.data || err.message);
        setError(err.response?.data?.error || err.message || 'Kunde inte ladda data');
        // Keep showing old data on error instead of clearing it
      }
    };

    fetchData();

    // Auto-refresh every 30 seconds (silent, no loading spinner)
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [isActive, leaderboard.id, refreshKey]);

  // Auto-scale to fit content without scrolling
  useEffect(() => {
    if (!isActive || !containerRef.current || !tableRef.current || groupMetrics.length === 0) {
      return;
    }

    const calculateScale = () => {
      const container = containerRef.current;
      const table = tableRef.current;

      if (!container || !table) return;

      // Get available height (container height minus header and padding)
      const containerHeight = container.clientHeight;
      const tableHeight = table.scrollHeight;

      // Calculate scale factor to fit content (with 5% margin for safety)
      const newScale = Math.min(1, (containerHeight * 0.95) / tableHeight);

      // Only scale down if content doesn't fit
      if (newScale < 1) {
        console.log(`📏 [MetricsGrid] Auto-scaling: ${(newScale * 100).toFixed(1)}% (${tableHeight}px → ${containerHeight}px)`);
        setScaleFactor(newScale);
      } else {
        setScaleFactor(1);
      }
    };

    // Calculate after content loads and on resize
    const timer = setTimeout(calculateScale, 100);
    window.addEventListener('resize', calculateScale);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', calculateScale);
    };
  }, [isActive, groupMetrics, displaySize]);

  // Determine grid layout based on number of groups
  const getGridLayout = (numGroups) => {
    if (numGroups <= 2) return 'grid-2x1';
    if (numGroups <= 4) return 'grid-2x2'; // 2 columns, 2 rows = 4 groups max
    if (numGroups <= 6) return 'grid-3x2';
    return 'grid-3x3';
  };

  // Get color for metric value based on per-group rules
  const getMetricColor = (metricId, groupId, value) => {
    // Handle null/undefined values
    if (value === null || value === undefined) return null;

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

    // Handle null/undefined values
    if (value === null || value === undefined) {
      return '-';
    }

    if (metric.includes('PerHour') || metric.includes('per_hour')) {
      return Number(value).toFixed(2);
    }
    if (metric.includes('rate') || metric.includes('Rate') || metric.includes('success')) {
      // Show SMS count if available
      if (additionalData?.uniqueSMS) {
        return `${Number(value).toFixed(1)}% (${additionalData.uniqueSMS} SMS)`;
      }
      return `${Number(value).toFixed(1)}%`;
    }
    if (metric.includes('commission') || metric.includes('Commission')) {
      return `${Math.round(Number(value)).toLocaleString('sv-SE')} kr`;
    }
    return String(value);
  };

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
      {/* Show error message if needed */}
      {error && (
        <div className="metrics-error-subtle">
          <p>⚠️ {error}</p>
        </div>
      )}

      {/* Modern Table Layout - Always render if we have data */}
      {groupMetrics.length > 0 && (
        <div className="metrics-table-container" ref={containerRef}>
          <table
            className="metrics-table"
            ref={tableRef}
            style={{
              transform: `scale(${scaleFactor})`,
              transformOrigin: 'top center',
              transition: 'transform 0.3s ease'
            }}
          >
            <thead>
              {/* Title row spanning all columns */}
              <tr className="title-row">
                <th colSpan={groupMetrics.length + 1} className="table-title">
                  {leaderboard.name}
                </th>
              </tr>
              {/* Column headers */}
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
