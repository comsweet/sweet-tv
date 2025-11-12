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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isActive) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await getGroupMetrics(leaderboard.id);
        setGroupMetrics(response.data.groupMetrics || []);
        setError(null);
      } catch (err) {
        console.error('Error fetching metrics grid data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [isActive, leaderboard.id, refreshKey]);

  // Determine grid layout based on number of groups
  const getGridLayout = (numGroups) => {
    if (numGroups <= 2) return 'grid-2x1';
    if (numGroups <= 4) return 'grid-2x2';
    if (numGroups <= 6) return 'grid-3x2';
    return 'grid-3x3';
  };

  // Get color for metric value based on rules
  const getMetricColor = (metricId, value) => {
    const rules = leaderboard.colorRules?.[metricId];
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
  const formatValue = (metricConfig, value) => {
    const { metric } = metricConfig;

    if (metric.includes('PerHour') || metric.includes('per_hour')) {
      return value.toFixed(2);
    }
    if (metric.includes('rate') || metric.includes('Rate') || metric.includes('%')) {
      return `${value}%`;
    }
    if (metric.includes('commission') || metric.includes('Commission')) {
      return `${Math.round(value).toLocaleString('sv-SE')} kr`;
    }
    return value.toString();
  };

  if (loading) {
    return (
      <div className={`metrics-grid-slide ${displaySize}`}>
        <div className="metrics-loading">
          <div className="spinner"></div>
          <p>Laddar metrics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`metrics-grid-slide ${displaySize}`}>
        <div className="metrics-error">
          <p>⚠️ Kunde inte ladda data</p>
          <p className="error-message">{error}</p>
        </div>
      </div>
    );
  }

  if (groupMetrics.length === 0) {
    return (
      <div className={`metrics-grid-slide ${displaySize}`}>
        <div className="metrics-no-data">
          <p>📊 Ingen data tillgänglig</p>
        </div>
      </div>
    );
  }

  const gridLayout = getGridLayout(groupMetrics.length);

  return (
    <div className={`metrics-grid-slide ${displaySize}`}>
      {/* Header with leaderboard name */}
      <div className="metrics-grid-header">
        <h1>{leaderboard.name}</h1>
      </div>

      {/* Widget Grid */}
      <div className={`metrics-grid ${gridLayout}`}>
        {groupMetrics.map((group) => (
          <div key={group.groupId} className="metric-card">
            {/* Card Header - Group Name */}
            <div className="card-header">
              <h2>{group.groupName}</h2>
            </div>

            {/* Card Body - Metrics */}
            <div className="card-body">
              {Object.entries(group.metrics).map(([metricId, metricData]) => {
                const color = getMetricColor(metricId, metricData.value);
                const metricConfig = leaderboard.metrics.find(m => m.id === metricId);

                return (
                  <div key={metricId} className="metric-row">
                    <div className="metric-label">{metricData.label}</div>
                    <div
                      className={`metric-value ${color ? `color-${color}` : ''}`}
                      style={color ? {
                        backgroundColor: getColorHex(color),
                        color: getTextColor(color)
                      } : {}}
                    >
                      {formatValue(metricConfig, metricData.value)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
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
