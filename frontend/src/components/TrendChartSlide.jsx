import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getLeaderboardHistory } from '../services/api';
import './TrendChartSlide.css';

const DEFAULT_COLORS = ['#00B2E3', '#FF6B6B', '#4ECDC4', '#FFD93D', '#A8E6CF', '#FF8B94', '#C7CEEA'];

// Cache data per leaderboard to prevent re-loading on every slideshow cycle
const dataCache = new Map();

const TrendChartSlide = ({ leaderboard, isActive, config = {} }) => {
  // Initialize data from cache if available
  const cacheKey = leaderboard?.id ? `trend-${leaderboard.id}` : null;
  const cachedData = cacheKey ? dataCache.get(cacheKey) : null;

  const [data, setData] = useState(cachedData || null);
  const [loading, setLoading] = useState(!cachedData); // Only show loading if no cached data
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasRenderedOnce, setHasRenderedOnce] = useState(!!cachedData);

  const {
    hours,
    days = 30, // Default to 30 days (monthly view)
    metric = 'commission', // Single metric (backward compatible)
    metrics, // Array of metrics: [{ metric: 'commission', axis: 'left' }, { metric: 'sms_rate', axis: 'right' }]
    refreshInterval = 30000 // 30 seconds (same as MetricsGridSlide for consistency)
  } = config;

  // Determine metrics configuration
  const metricsConfig = metrics || [{ metric, axis: 'left' }];
  const hasMultipleMetrics = metricsConfig.length > 1;

  useEffect(() => {
    if (!leaderboard || !leaderboard.id) return;

    const fetchData = async (isAutoRefresh = false) => {
      try {
        // Only show loading spinner if we don't have data yet
        // This prevents showing spinner every time slideshow cycles back
        if (!isAutoRefresh && !data) {
          setLoading(true);
        } else {
          setIsRefreshing(true);
        }
        const params = {};

        // Use days if provided, otherwise fall back to hours
        if (days) {
          params.days = days;
        } else if (hours) {
          params.hours = hours;
        }

        // Send metrics array if multiple metrics
        if (hasMultipleMetrics) {
          params.metrics = JSON.stringify(metricsConfig);
        } else {
          params.metric = metricsConfig[0].metric;
        }

        const response = await getLeaderboardHistory(leaderboard.id, params);
        setData(response.data);
        setError(null);

        // Cache data to persist between unmount/remount cycles
        if (cacheKey) {
          dataCache.set(cacheKey, response.data);
        }

        // Mark as rendered after first successful load
        if (!hasRenderedOnce) {
          setHasRenderedOnce(true);
        }
      } catch (err) {
        console.error('Error fetching trend data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    };

    fetchData(false); // Initial load

    // Auto-refresh in background
    const interval = setInterval(() => fetchData(true), refreshInterval);
    return () => clearInterval(interval);

    // NOTE: isActive is NOT in dependency array to prevent re-fetching every time
    // slideshow cycles back to this slide. We cache data and show it immediately.
    // This matches the behavior of MetricsGridSlide and other components.
  }, [leaderboard?.id, hours, days, JSON.stringify(metricsConfig), refreshInterval]);

  if (loading) {
    return (
      <div className="trend-chart-slide">
        <div className="trend-loading">
          <div className="spinner"></div>
          <p>Laddar trenddata...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="trend-chart-slide">
        <div className="trend-error">
          <p>⚠️ Kunde inte ladda trenddata</p>
          <p className="error-message">{error}</p>
        </div>
      </div>
    );
  }

  if (!data || !data.timeSeries || data.timeSeries.length === 0) {
    return (
      <div className="trend-chart-slide">
        <div className="trend-no-data">
          <p>📊 Ingen data tillgänglig för vald period</p>
        </div>
      </div>
    );
  }

  const formatTime = (timeString) => {
    const date = new Date(timeString);
    const groupedBy = data?.groupedBy || 'hour';

    if (groupedBy === 'day') {
      return date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
    } else {
      const now = new Date();
      const diffHours = Math.floor((now - date) / (1000 * 60 * 60));

      if (diffHours < 24) {
        return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
      }
      return date.toLocaleDateString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit' });
    }
  };

  const formatValueForMetric = (value, metricName) => {
    switch (metricName) {
      case 'deals':
        return `${value} affärer`;
      case 'sms_rate':
        return `${value}%`;
      case 'order_per_hour':
        return `${value.toFixed(2)} affärer/h`;
      case 'commission_per_hour':
        return `${Math.round(value).toLocaleString('sv-SE')} THB/h`;
      default: // commission
        return `${Math.round(value).toLocaleString('sv-SE')} THB`;
    }
  };

  const getMetricLabel = (metricName) => {
    switch (metricName) {
      case 'deals':
        return 'Antal affärer';
      case 'sms_rate':
        return 'SMS Success Rate (%)';
      case 'order_per_hour':
        return 'Affärer per timme';
      case 'commission_per_hour':
        return 'Commission per timme (THB/h)';
      default:
        return 'Commission (THB)';
    }
  };

  const title = data?.leaderboard?.name || 'Trendanalys';

  // Get period label from response (respects timePeriod setting)
  let periodLabel;
  if (data?.timePeriod) {
    switch (data.timePeriod) {
      case 'day':
        periodLabel = 'Idag';
        break;
      case 'week':
        periodLabel = 'Innevarande vecka';
        break;
      case 'month':
        periodLabel = 'Innevarande månad';
        break;
      case 'custom':
        if (data.dateRange) {
          const start = new Date(data.dateRange.startDate).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
          const end = new Date(data.dateRange.endDate).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
          periodLabel = `${start} - ${end}`;
        } else {
          periodLabel = 'Anpassad period';
        }
        break;
      default:
        periodLabel = days ? `Senaste ${days} dagar` : `Senaste ${hours}h`;
    }
  } else {
    // Fallback for backward compatibility
    periodLabel = days ? `Senaste ${days} dagar` : `Senaste ${hours}h`;
  }

  // Get group names from topUsers
  const groupNames = data.topUsers.map(u => u.name);

  // Build subtitle based on metrics
  let subtitle;
  if (hasMultipleMetrics) {
    const metricLabels = metricsConfig.map(m => getMetricLabel(m.metric)).join(' + ');
    subtitle = `${metricLabels} per User Group - ${periodLabel}`;
  } else {
    subtitle = `${getMetricLabel(metricsConfig[0].metric)} per User Group - ${periodLabel}`;
  }

  // Get unique data keys (for lines)
  const firstDataPoint = data.timeSeries[0];
  const dataKeys = Object.keys(firstDataPoint).filter(key => key !== 'time');

  // Custom tooltip for multi-metric support
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div style={{
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        border: '1px solid #00B2E3',
        borderRadius: '8px',
        padding: '10px',
        color: '#ffffff'
      }}>
        <p style={{ marginBottom: '5px', fontWeight: 'bold' }}>{formatTime(label)}</p>
        {payload.map((entry, index) => {
          // Extract metric from dataKey if multi-metric
          let metricName = metricsConfig[0].metric;
          if (hasMultipleMetrics) {
            const parts = entry.dataKey.split('_');
            metricName = parts[parts.length - 1];
          }

          return (
            <p key={index} style={{ margin: '2px 0', color: entry.color }}>
              {entry.name}: {formatValueForMetric(entry.value, metricName)}
            </p>
          );
        })}
      </div>
    );
  };

  // Group lines by axis for dual Y-axis
  const leftAxisKeys = [];
  const rightAxisKeys = [];

  if (hasMultipleMetrics) {
    // Multi-metric mode: dataKey format is "GroupName_metric"
    dataKeys.forEach(dataKey => {
      const parts = dataKey.split('_');
      const metricName = parts[parts.length - 1];
      const metricConfig = metricsConfig.find(m => m.metric === metricName);

      if (metricConfig && metricConfig.axis === 'right') {
        rightAxisKeys.push(dataKey);
      } else {
        leftAxisKeys.push(dataKey);
      }
    });
  } else {
    // Single metric mode: dataKey is just groupName
    leftAxisKeys.push(...dataKeys);
  }

  const leftMetric = metricsConfig.find(m => m.axis === 'left' || !m.axis) || metricsConfig[0];
  const rightMetric = metricsConfig.find(m => m.axis === 'right');

  // Animation config: Only animate on first render, then disable to prevent slideshow glitches
  const shouldAnimate = !hasRenderedOnce && isActive;
  const animationDuration = shouldAnimate ? 800 : 0; // Shorter animation + disable after first render

  // Get color for a group - use custom color if defined, otherwise default
  const getColorForDataKey = (dataKey, index) => {
    // Extract group name from dataKey
    // dataKey can be "GroupName" or "GroupName_metric"
    let groupName = dataKey;
    if (hasMultipleMetrics) {
      // Remove the _metric suffix
      const parts = dataKey.split('_');
      parts.pop(); // Remove last part (metric name)
      groupName = parts.join('_');
    }

    // Try to find group by name and check if custom color exists
    if (leaderboard?.groupColors) {
      const group = data.topUsers.find(u => u.name === groupName);
      if (group && leaderboard.groupColors[group.groupId]) {
        return leaderboard.groupColors[group.groupId];
      }
    }

    // Fall back to default colors
    return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
  };

  return (
    <div className="trend-chart-slide">
      <div className="trend-header">
        <h1 style={{ fontSize: '48px', marginBottom: '10px' }}>{title}</h1>
        <p className="trend-subtitle" style={{ fontSize: '28px' }}>{subtitle}</p>
      </div>

      <div className="trend-chart-container" style={{ height: 'calc(100vh - 180px)' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data.timeSeries}
            margin={{ top: 40, right: rightMetric ? 100 : 60, left: 120, bottom: 80 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.2)" />
            <XAxis
              dataKey="time"
              tickFormatter={formatTime}
              stroke="#ffffff"
              tick={{ fill: '#ffffff', fontSize: 28, fontWeight: 600 }}
              angle={-45}
              textAnchor="end"
              height={100}
            />

            {/* Left Y-Axis */}
            <YAxis
              yAxisId="left"
              stroke="#ffffff"
              tick={{ fill: '#ffffff', fontSize: 24, fontWeight: 600 }}
              width={100}
              label={{
                value: getMetricLabel(leftMetric.metric),
                angle: -90,
                position: 'insideLeft',
                offset: 25,
                style: { fill: '#ffffff', fontSize: 24, fontWeight: 'bold', textAnchor: 'middle' }
              }}
            />

            {/* Right Y-Axis (if dual metric) */}
            {rightMetric && (
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#ffffff"
                tick={{ fill: '#ffffff', fontSize: 24, fontWeight: 600 }}
                width={90}
                label={{
                  value: getMetricLabel(rightMetric.metric),
                  angle: 90,
                  position: 'insideRight',
                  offset: 15,
                  style: { fill: '#ffffff', fontSize: 24, fontWeight: 'bold', textAnchor: 'middle' }
                }}
              />
            )}

            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '30px' }}
              iconType="line"
              iconSize={32}
              formatter={(value) => (
                <span style={{ color: '#ffffff', fontSize: '32px', fontWeight: 'bold', padding: '0 20px' }}>
                  {value}
                </span>
              )}
            />

            {/* Render lines for left axis */}
            {leftAxisKeys.map((dataKey, index) => (
              <Line
                key={dataKey}
                yAxisId="left"
                type="monotone"
                dataKey={dataKey}
                stroke={getColorForDataKey(dataKey, index)}
                strokeWidth={5}
                dot={{ r: 6, strokeWidth: 2 }}
                activeDot={{ r: 8, strokeWidth: 3 }}
                isAnimationActive={shouldAnimate}
                animationDuration={animationDuration}
              />
            ))}

            {/* Render lines for right axis */}
            {rightAxisKeys.map((dataKey, index) => (
              <Line
                key={dataKey}
                yAxisId="right"
                type="monotone"
                dataKey={dataKey}
                stroke={getColorForDataKey(dataKey, leftAxisKeys.length + index)}
                strokeWidth={5}
                dot={{ r: 6, strokeWidth: 2 }}
                activeDot={{ r: 8, strokeWidth: 3 }}
                isAnimationActive={shouldAnimate}
                animationDuration={animationDuration}
                strokeDasharray="8 4" // Dashed line to differentiate from left axis
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TrendChartSlide;
