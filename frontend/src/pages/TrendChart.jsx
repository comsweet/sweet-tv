import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getStandaloneHistory, getUserGroups } from '../services/api';
import './TrendChart.css';

const COLORS = ['#00B2E3', '#FF6B6B', '#4ECDC4', '#FFD93D', '#A8E6CF', '#FF8B94', '#C7CEEA'];

const TrendChart = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userGroups, setUserGroups] = useState([]);

  // Configuration state
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [metric, setMetric] = useState('commission');
  const [days, setDays] = useState(30);
  const [topN, setTopN] = useState(5);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Load user groups on mount
  useEffect(() => {
    const loadUserGroups = async () => {
      try {
        const response = await getUserGroups();
        setUserGroups(response.data || []);
      } catch (err) {
        console.error('Error loading user groups:', err);
      }
    };
    loadUserGroups();
  }, []);

  // Fetch data
  const fetchData = async () => {
    try {
      setLoading(true);
      const params = {
        days,
        topN,
        metric
      };

      // Add user groups if selected
      if (selectedGroups.length > 0) {
        params.userGroups = selectedGroups.join(',');
      }

      const response = await getStandaloneHistory(params);
      setData(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching trend data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, []);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchData, 300000); // 5 minutes
    return () => clearInterval(interval);
  }, [autoRefresh, days, topN, metric, selectedGroups]);

  const handleGroupToggle = (groupId) => {
    setSelectedGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const handleSelectAllGroups = () => {
    setSelectedGroups(userGroups.map(g => g.id));
  };

  const handleDeselectAllGroups = () => {
    setSelectedGroups([]);
  };

  const formatTime = (timeString) => {
    const date = new Date(timeString);
    return date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
  };

  const formatValue = (value) => {
    switch (metric) {
      case 'deals':
        return `${value} affärer`;
      case 'sms_rate':
        return `${value}%`;
      case 'order_per_hour':
        return `${value.toFixed(2)} affärer/h`;
      case 'commission_per_hour':
        return `${value.toLocaleString('sv-SE')} THB/h`;
      default: // commission
        return `${value.toLocaleString('sv-SE')} THB`;
    }
  };

  const getMetricLabel = () => {
    switch (metric) {
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

  const metricLabel = getMetricLabel();
  const userNames = data?.topUsers?.map(u => u.name) || [];

  return (
    <div className="trend-chart-page">
      {/* Header */}
      <div className="trend-page-header">
        <h1>📈 Trend Chart</h1>
        <p className="trend-page-subtitle">Analysera utveckling över tid</p>
      </div>

      {/* Control Panel */}
      <div className="trend-controls">
        <div className="control-section">
          <h3>👥 User Groups</h3>
          <div className="group-actions">
            <button onClick={handleSelectAllGroups} className="btn-link">
              Välj alla
            </button>
            <button onClick={handleDeselectAllGroups} className="btn-link">
              Avmarkera alla
            </button>
          </div>
          <div className="group-list">
            {userGroups.length === 0 ? (
              <p className="no-groups">Inga grupper tillgängliga</p>
            ) : (
              userGroups.map(group => (
                <label key={group.id} className="group-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(group.id)}
                    onChange={() => handleGroupToggle(group.id)}
                  />
                  <span>{group.name}</span>
                </label>
              ))
            )}
          </div>
          {selectedGroups.length === 0 && userGroups.length > 0 && (
            <p className="hint">Alla grupper visas när ingen är vald</p>
          )}
        </div>

        <div className="control-section">
          <h3>📊 Metric</h3>
          <select value={metric} onChange={(e) => setMetric(e.target.value)} className="control-select">
            <option value="commission">💰 Commission (THB)</option>
            <option value="commission_per_hour">💸 Commission per timme</option>
            <option value="deals">🎯 Antal affärer</option>
            <option value="order_per_hour">⚡ Affärer per timme</option>
            <option value="sms_rate">📱 SMS Success Rate (%)</option>
          </select>
        </div>

        <div className="control-section">
          <h3>📅 Period (dagar)</h3>
          <input
            type="number"
            min="1"
            max="90"
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="control-input"
          />
        </div>

        <div className="control-section">
          <h3>🏆 Top N</h3>
          <input
            type="number"
            min="1"
            max="15"
            value={topN}
            onChange={(e) => setTopN(parseInt(e.target.value))}
            className="control-input"
          />
        </div>

        <div className="control-section">
          <button onClick={fetchData} className="btn-fetch" disabled={loading}>
            {loading ? '⏳ Laddar...' : '🔄 Uppdatera'}
          </button>
          <label className="auto-refresh-label">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>Auto-refresh (5 min)</span>
          </label>
        </div>
      </div>

      {/* Chart */}
      <div className="trend-chart-area">
        {loading && !data && (
          <div className="trend-loading">
            <div className="spinner"></div>
            <p>Laddar trenddata...</p>
          </div>
        )}

        {error && (
          <div className="trend-error">
            <p>⚠️ Kunde inte ladda trenddata</p>
            <p className="error-message">{error}</p>
          </div>
        )}

        {!loading && !error && (!data || !data.timeSeries || data.timeSeries.length === 0) && (
          <div className="trend-no-data">
            <p>📊 Ingen data tillgänglig för vald konfiguration</p>
            <p className="hint">Prova att ändra period, grupper eller metrik</p>
          </div>
        )}

        {!loading && data && data.timeSeries && data.timeSeries.length > 0 && (
          <>
            <div className="trend-chart-header">
              <h2>{metricLabel}</h2>
              <p className="chart-subtitle">
                Top {topN} - Senaste {days} dagar
                {selectedGroups.length > 0 && ` - ${selectedGroups.length} grupp${selectedGroups.length > 1 ? 'er' : ''} vald${selectedGroups.length > 1 ? 'a' : ''}`}
              </p>
            </div>

            <div className="trend-chart-container">
              <ResponsiveContainer width="100%" height={500}>
                <LineChart
                  data={data.timeSeries}
                  margin={{ top: 20, right: 50, left: 70, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 100, 100, 0.2)" />
                  <XAxis
                    dataKey="time"
                    tickFormatter={formatTime}
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis
                    tick={{ fontSize: 14 }}
                    label={{
                      value: metricLabel,
                      angle: -90,
                      position: 'insideLeft',
                      style: { fontSize: 14, fontWeight: 'bold' }
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      border: '1px solid #00B2E3',
                      borderRadius: '8px'
                    }}
                    labelFormatter={formatTime}
                    formatter={(value) => formatValue(value)}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: '20px' }}
                    iconType="line"
                  />
                  {userNames.map((name, index) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={COLORS[index % COLORS.length]}
                      strokeWidth={3}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                      animationDuration={1000}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Leaders */}
            <div className="trend-leaders">
              {data.topUsers.map((user, index) => (
                <div key={user.userId} className="trend-leader-badge" style={{ borderLeft: `4px solid ${COLORS[index % COLORS.length]}` }}>
                  <span className="trend-rank">#{index + 1}</span>
                  <span className="trend-name">{user.name}</span>
                  <span className="trend-total">{formatValue(user.total)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TrendChart;
