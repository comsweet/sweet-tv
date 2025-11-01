import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const AdminAPIMonitoring = () => {
  const [summary, setSummary] = useState(null);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeRange, setTimeRange] = useState('24h');

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [timeRange]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch summary
      const summaryResponse = await axios.get(`${API_BASE_URL}/monitoring/api-stats/summary`);
      setSummary(summaryResponse.data);

      // Fetch detailed stats
      const now = new Date();
      const startDate = new Date(
        timeRange === '1h' ? now.getTime() - 60 * 60 * 1000 :
        timeRange === '24h' ? now.getTime() - 24 * 60 * 60 * 1000 :
        now.getTime() - 7 * 24 * 60 * 60 * 1000
      );

      const statsResponse = await axios.get(`${API_BASE_URL}/monitoring/api-stats`, {
        params: {
          startDate: startDate.toISOString(),
          endDate: now.toISOString()
        }
      });
      setStats(statsResponse.data.stats);
    } catch (err) {
      console.error('Failed to fetch API stats:', err);
      setError('Kunde inte hämta API statistik');
    } finally {
      setLoading(false);
    }
  };

  const getRateLimitColor = (percent) => {
    if (percent >= 80) return '#f44336';
    if (percent >= 60) return '#ff9800';
    return '#4caf50';
  };

  const getStatusColor = (errorRate) => {
    if (errorRate >= 10) return '#f44336';
    if (errorRate >= 5) return '#ff9800';
    return '#4caf50';
  };

  if (loading && !summary) {
    return (
      <div className="admin-section">
        <h2 style={{ color: '#005A9C' }}>📊 API Monitoring</h2>
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          Laddar API statistik...
        </div>
      </div>
    );
  }

  return (
    <div className="admin-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: '#005A9C', margin: 0 }}>📊 API Monitoring</h2>
        <button
          onClick={fetchData}
          style={{
            padding: '8px 16px',
            background: '#00B2E3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          🔄 Uppdatera
        </button>
      </div>

      {error && (
        <div style={{
          background: '#fee',
          color: '#c33',
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          {error}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <>
          <h3 style={{ color: '#333', marginBottom: '16px', marginTop: '24px' }}>⏰ Senaste timmen</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '32px'
          }}>
            <div style={{
              background: 'white',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Total Requests</div>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#005A9C' }}>
                {summary.lastHour.totalRequests}
              </div>
              <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                Limit: 60/min
              </div>
            </div>

            <div style={{
              background: 'white',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Error Rate</div>
              <div style={{
                fontSize: '32px',
                fontWeight: '700',
                color: getStatusColor(summary.lastHour.errorRate)
              }}>
                {summary.lastHour.errorRate.toFixed(1)}%
              </div>
              <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                {summary.lastHour.totalErrors} errors
              </div>
            </div>

            <div style={{
              background: 'white',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Avg Response Time</div>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#00B2E3' }}>
                {summary.lastHour.avgResponseTime.toFixed(0)}ms
              </div>
            </div>

            <div style={{
              background: 'white',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Rate Limit Usage</div>
              <div style={{
                fontSize: '32px',
                fontWeight: '700',
                color: getRateLimitColor(summary.lastHour.utilizationPercent)
              }}>
                {summary.lastHour.utilizationPercent.toFixed(1)}%
              </div>
              <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                60 req/min max
              </div>
            </div>
          </div>

          <h3 style={{ color: '#333', marginBottom: '16px' }}>📅 Senaste 24 timmarna</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '32px'
          }}>
            <div style={{
              background: 'white',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Total Requests</div>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#005A9C' }}>
                {summary.last24Hours.totalRequests}
              </div>
              <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                Limit: 1000/hour
              </div>
            </div>

            <div style={{
              background: 'white',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Error Rate</div>
              <div style={{
                fontSize: '32px',
                fontWeight: '700',
                color: getStatusColor(summary.last24Hours.errorRate)
              }}>
                {summary.last24Hours.errorRate.toFixed(1)}%
              </div>
              <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                {summary.last24Hours.totalErrors} errors
              </div>
            </div>

            <div style={{
              background: 'white',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Avg Response Time</div>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#00B2E3' }}>
                {summary.last24Hours.avgResponseTime.toFixed(0)}ms
              </div>
            </div>

            <div style={{
              background: 'white',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Rate Limit Usage</div>
              <div style={{
                fontSize: '32px',
                fontWeight: '700',
                color: getRateLimitColor(summary.last24Hours.utilizationPercent)
              }}>
                {summary.last24Hours.utilizationPercent.toFixed(1)}%
              </div>
              <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                1000 req/hour max
              </div>
            </div>
          </div>
        </>
      )}

      {/* Detailed Stats */}
      <h3 style={{ color: '#333', marginBottom: '16px' }}>📈 Endpoint Statistics</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          background: 'white',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          <thead>
            <tr style={{ background: '#005A9C', color: 'white' }}>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Endpoint</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Method</th>
              <th style={{ padding: '12px', textAlign: 'right', fontSize: '14px' }}>Requests</th>
              <th style={{ padding: '12px', textAlign: 'right', fontSize: '14px' }}>Errors</th>
              <th style={{ padding: '12px', textAlign: 'right', fontSize: '14px' }}>Avg Time</th>
              <th style={{ padding: '12px', textAlign: 'right', fontSize: '14px' }}>Max Time</th>
            </tr>
          </thead>
          <tbody>
            {stats.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                  Ingen data tillgänglig
                </td>
              </tr>
            ) : (
              stats.map((stat, index) => (
                <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '12px', fontSize: '13px', fontFamily: 'monospace' }}>
                    {stat.endpoint}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      background: stat.method === 'GET' ? '#4caf50' :
                                 stat.method === 'POST' ? '#2196f3' :
                                 stat.method === 'PUT' ? '#ff9800' :
                                 stat.method === 'DELETE' ? '#f44336' : '#9e9e9e',
                      color: 'white',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}>
                      {stat.method}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', fontSize: '13px', fontWeight: '600' }}>
                    {stat.request_count}
                  </td>
                  <td style={{
                    padding: '12px',
                    textAlign: 'right',
                    fontSize: '13px',
                    color: parseInt(stat.error_count) > 0 ? '#f44336' : '#666'
                  }}>
                    {stat.error_count}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', fontSize: '13px' }}>
                    {parseFloat(stat.avg_response_time).toFixed(0)}ms
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', fontSize: '13px' }}>
                    {parseInt(stat.max_response_time)}ms
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{
        marginTop: '20px',
        padding: '16px',
        background: '#fff3cd',
        borderRadius: '8px',
        fontSize: '14px',
        color: '#856404'
      }}>
        <strong>⚠️ Adversus API Rate Limits:</strong>
        <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
          <li>1000 requests per hour</li>
          <li>60 requests per minute (burst)</li>
          <li>Max 2 concurrent requests</li>
          <li>HTTP 429 vid överskridning</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminAPIMonitoring;
