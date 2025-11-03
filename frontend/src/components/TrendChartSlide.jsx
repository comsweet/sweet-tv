import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getLeaderboardHistory } from '../services/api';
import './TrendChartSlide.css';

const COLORS = ['#00B2E3', '#FF6B6B', '#4ECDC4', '#FFD93D', '#A8E6CF', '#FF8B94', '#C7CEEA'];

const TrendChartSlide = ({ leaderboard, isActive, config = {} }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const {
    hours = 24,
    topN = 5,
    metric = 'commission', // 'commission' or 'deals'
    refreshInterval = 300000 // 5 minutes
  } = config;

  useEffect(() => {
    if (!isActive || !leaderboard) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await getLeaderboardHistory(leaderboard._id, {
          hours,
          topN,
          metric
        });
        setData(response.data);
        setError(null);
      } catch (err) {
        console.error('Error fetching trend data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Auto-refresh
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [leaderboard, isActive, hours, topN, metric, refreshInterval]);

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
    const now = new Date();
    const diffHours = Math.floor((now - date) / (1000 * 60 * 60));

    if (diffHours < 24) {
      return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit' });
  };

  const formatValue = (value) => {
    if (metric === 'deals') {
      return value;
    }
    return `${value.toLocaleString('sv-SE')} THB`;
  };

  const metricLabel = metric === 'deals' ? 'Antal affärer' : 'Commission (THB)';
  const title = data.leaderboard?.name || 'Trendanalys';

  // Get user names for the lines (excluding 'time')
  const userNames = data.topUsers.map(u => u.name);

  return (
    <div className="trend-chart-slide">
      <div className="trend-header">
        <h1>{title}</h1>
        <p className="trend-subtitle">
          Top {topN} - {metricLabel} - Senaste {hours}h
        </p>
      </div>

      <div className="trend-chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data.timeSeries}
            margin={{ top: 20, right: 50, left: 50, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
            <XAxis
              dataKey="time"
              tickFormatter={formatTime}
              stroke="#ffffff"
              tick={{ fill: '#ffffff', fontSize: 14 }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              stroke="#ffffff"
              tick={{ fill: '#ffffff', fontSize: 16 }}
              label={{
                value: metricLabel,
                angle: -90,
                position: 'insideLeft',
                style: { fill: '#ffffff', fontSize: 18, fontWeight: 'bold' }
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                border: '1px solid #00B2E3',
                borderRadius: '8px',
                color: '#ffffff'
              }}
              labelFormatter={formatTime}
              formatter={(value) => formatValue(value)}
            />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="line"
              formatter={(value) => (
                <span style={{ color: '#ffffff', fontSize: '16px', fontWeight: 'bold' }}>
                  {value}
                </span>
              )}
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

      <div className="trend-footer">
        <div className="trend-leaders">
          {data.topUsers.map((user, index) => (
            <div key={user.userId} className="trend-leader-badge" style={{ borderColor: COLORS[index % COLORS.length] }}>
              <span className="trend-rank">#{index + 1}</span>
              <span className="trend-name">{user.name}</span>
              <span className="trend-total">{formatValue(user.total)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TrendChartSlide;
