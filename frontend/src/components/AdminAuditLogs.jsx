import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const AdminAuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({ total: 0, limit: 50, offset: 0 });

  // Filters
  const [filters, setFilters] = useState({
    resourceType: '',
    userId: '',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    fetchAuditLogs();
  }, [pagination.offset, filters]);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      setError('');

      const params = new URLSearchParams({
        limit: pagination.limit,
        offset: pagination.offset,
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== ''))
      });

      const response = await axios.get(`${API_BASE_URL}/monitoring/audit-logs?${params}`);
      setLogs(response.data.logs);
      setPagination(prev => ({ ...prev, total: response.data.pagination.total }));
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
      setError('Kunde inte hämta audit logs');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, offset: 0 })); // Reset to first page
  };

  const clearFilters = () => {
    setFilters({ resourceType: '', userId: '', startDate: '', endDate: '' });
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  const nextPage = () => {
    if (pagination.offset + pagination.limit < pagination.total) {
      setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }));
    }
  };

  const prevPage = () => {
    if (pagination.offset > 0) {
      setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }));
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('sv-SE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getActionBadgeColor = (action) => {
    switch (action) {
      case 'LOGIN': return '#4caf50';
      case 'LOGOUT': return '#9e9e9e';
      case 'CREATE_USER':
      case 'GENERATE_TV_CODE': return '#2196f3';
      case 'UPDATE_USER': return '#ff9800';
      case 'DELETE_USER':
      case 'DELETE_TV_CODE': return '#f44336';
      case 'CHANGE_PASSWORD': return '#9c27b0';
      default: return '#607d8b';
    }
  };

  return (
    <div className="admin-section">
      <h2 style={{ color: '#005A9C', marginBottom: '20px' }}>📋 Audit Logs</h2>

      {/* Filters */}
      <div style={{
        background: '#f5f5f5',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px'
      }}>
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>
            Resource Type
          </label>
          <select
            value={filters.resourceType}
            onChange={(e) => handleFilterChange('resourceType', e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ddd'
            }}
          >
            <option value="">Alla</option>
            <option value="auth">Auth</option>
            <option value="user">User</option>
            <option value="tv_code">TV Code</option>
            <option value="agent">Agent</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>
            Start Datum
          </label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ddd'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>
            Slut Datum
          </label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ddd'
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button
            onClick={clearFilters}
            style={{
              padding: '8px 16px',
              background: '#666',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Rensa Filter
          </button>
        </div>
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

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          Laddar audit logs...
        </div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          Inga audit logs hittades
        </div>
      ) : (
        <>
          {/* Audit Logs Table */}
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
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Tid</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Användare</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Action</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Resource</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Detaljer</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '12px', fontSize: '13px' }}>
                      {formatDate(log.created_at)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '13px' }}>
                      <div>{log.user_email}</div>
                      <div style={{ fontSize: '11px', color: '#999' }}>ID: {log.user_id}</div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        background: getActionBadgeColor(log.action),
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: '12px', fontSize: '13px' }}>
                      <div>{log.resource_type}</div>
                      {log.resource_id && (
                        <div style={{ fontSize: '11px', color: '#999' }}>#{log.resource_id}</div>
                      )}
                    </td>
                    <td style={{ padding: '12px', fontSize: '12px', maxWidth: '300px' }}>
                      <pre style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontFamily: 'monospace',
                        fontSize: '11px'
                      }}>
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </td>
                    <td style={{ padding: '12px', fontSize: '12px', color: '#666' }}>
                      {log.ip_address || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '20px',
            padding: '16px',
            background: '#f5f5f5',
            borderRadius: '8px'
          }}>
            <div style={{ fontSize: '14px', color: '#666' }}>
              Visar {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.total)} av {pagination.total}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={prevPage}
                disabled={pagination.offset === 0}
                style={{
                  padding: '8px 16px',
                  background: pagination.offset === 0 ? '#ccc' : '#005A9C',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: pagination.offset === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '14px'
                }}
              >
                ← Föregående
              </button>
              <button
                onClick={nextPage}
                disabled={pagination.offset + pagination.limit >= pagination.total}
                style={{
                  padding: '8px 16px',
                  background: pagination.offset + pagination.limit >= pagination.total ? '#ccc' : '#005A9C',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: pagination.offset + pagination.limit >= pagination.total ? 'not-allowed' : 'pointer',
                  fontSize: '14px'
                }}
              >
                Nästa →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminAuditLogs;
