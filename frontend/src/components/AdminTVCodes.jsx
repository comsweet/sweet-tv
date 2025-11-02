import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const AdminTVCodes = () => {
  const { isSuperAdmin } = useAuth();
  const [activeCodes, setActiveCodes] = useState([]);
  const [allCodes, setAllCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const expiresInMinutes = 5; // Fixed at 5 minutes
  const [generatedCode, setGeneratedCode] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    fetchActiveCodes();
  }, []);

  const fetchActiveCodes = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/tv-codes/active`);
      setActiveCodes(response.data.codes);
    } catch (err) {
      console.error('Failed to fetch active codes:', err);
    }
  };

  const fetchAllCodes = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/tv-codes/all`);
      setAllCodes(response.data.codes);
    } catch (err) {
      console.error('Failed to fetch all codes:', err);
      setError('Kunde inte hämta historik');
    } finally {
      setLoading(false);
    }
  };

  const generateCode = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const response = await axios.post(`${API_BASE_URL}/tv-codes/generate`, {
        expiresInMinutes: parseInt(expiresInMinutes)
      });

      setGeneratedCode(response.data);
      setSuccess(`Kod genererad: ${response.data.code}`);
      fetchActiveCodes();
    } catch (err) {
      console.error('Failed to generate code:', err);
      setError(err.response?.data?.error || 'Kunde inte generera kod');
    } finally {
      setLoading(false);
    }
  };

  const deleteCode = async (code) => {
    if (!confirm(`Är du säker på att du vill ta bort koden ${code}?`)) {
      return;
    }

    try {
      await axios.delete(`${API_BASE_URL}/tv-codes/${code}`);
      setSuccess(`Kod ${code} borttagen`);
      fetchActiveCodes();
      if (showHistory) {
        fetchAllCodes();
      }
    } catch (err) {
      console.error('Failed to delete code:', err);
      setError(err.response?.data?.error || 'Kunde inte ta bort kod');
    }
  };

  const cleanup = async () => {
    try {
      const response = await axios.post(`${API_BASE_URL}/tv-codes/cleanup`);
      setSuccess(`${response.data.deletedCount} utgångna koder borttagna`);
      fetchActiveCodes();
      if (showHistory) {
        fetchAllCodes();
      }
    } catch (err) {
      console.error('Failed to cleanup codes:', err);
      setError('Kunde inte rensa utgångna koder');
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('sv-SE', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getRemainingTime = (expiresAt) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires - now;

    if (diff <= 0) return '0s';

    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  const toggleHistory = () => {
    setShowHistory(!showHistory);
    if (!showHistory) {
      fetchAllCodes();
    }
  };

  return (
    <div className="admin-section">
      <h2 style={{ color: '#005A9C', marginBottom: '20px' }}>🔑 TV Kod</h2>

      <div style={{
        background: 'linear-gradient(135deg, #e3f2fd 0%, #f0f8ff 100%)',
        padding: '20px 24px',
        borderRadius: '12px',
        marginBottom: '24px',
        border: '2px solid #90caf9',
        boxShadow: '0 2px 8px rgba(0, 90, 156, 0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>ℹ️</span>
          <div>
            <strong style={{ color: '#0d47a1', fontSize: '15px', display: 'block', marginBottom: '8px' }}>
              Så fungerar det:
            </strong>
            <p style={{ margin: 0, color: '#1565c0', fontSize: '14px', lineHeight: '1.6' }}>
              Generera en 6-siffrig kod som TV-skärmar kan använda för att få tillgång till slideshows.
              Koden är giltig i <strong>5 minuter</strong> och kan endast användas en gång.
            </p>
          </div>
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

      {success && (
        <div style={{
          background: '#e8f5e9',
          color: '#2e7d32',
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          {success}
        </div>
      )}

      {/* Generate Code */}
      <div style={{
        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafb 100%)',
        padding: '32px',
        borderRadius: '16px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
        marginBottom: '32px',
        border: '1px solid #e0e0e0'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h3 style={{
            color: '#005A9C',
            marginTop: 0,
            marginBottom: '8px',
            fontSize: '24px',
            fontWeight: '700'
          }}>
            Generera Ny Kod
          </h3>
          <p style={{
            margin: 0,
            color: '#666',
            fontSize: '14px'
          }}>
            Koden är giltig i 5 minuter och kan endast användas en gång
          </p>
        </div>

        <div style={{
          display: 'flex',
          gap: '16px',
          justifyContent: 'center',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={generateCode}
            disabled={loading}
            style={{
              padding: '14px 32px',
              background: loading ? '#ccc' : 'linear-gradient(135deg, #005A9C 0%, #00B2E3 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: '600',
              transition: 'all 0.3s',
              boxShadow: '0 4px 12px rgba(0, 90, 156, 0.2)'
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 6px 16px rgba(0, 90, 156, 0.3)';
              }
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 4px 12px rgba(0, 90, 156, 0.2)';
            }}
          >
            {loading ? '🔄 Genererar...' : '🔑 Generera Kod'}
          </button>

          {isSuperAdmin && (
            <button
              onClick={cleanup}
              style={{
                padding: '14px 24px',
                background: '#666',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: '600',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#555';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = '#666';
              }}
            >
              🧹 Rensa Utgångna
            </button>
          )}
        </div>

        {/* Generated Code Display */}
        {generatedCode && (
          <div style={{
            marginTop: '32px',
            padding: '32px',
            background: 'linear-gradient(135deg, #005A9C 0%, #00B2E3 100%)',
            borderRadius: '16px',
            textAlign: 'center',
            boxShadow: '0 8px 24px rgba(0, 90, 156, 0.3)',
            border: '3px solid rgba(255, 255, 255, 0.3)',
            animation: 'slideIn 0.3s ease-out'
          }}>
            <div style={{
              fontSize: '14px',
              color: 'rgba(255, 255, 255, 0.9)',
              marginBottom: '12px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              ✨ Din nya kod
            </div>
            <div style={{
              fontSize: '56px',
              fontWeight: '700',
              color: 'white',
              letterSpacing: '12px',
              fontFamily: 'monospace',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
              padding: '16px 0'
            }}>
              {generatedCode.code}
            </div>
            <div style={{
              fontSize: '13px',
              color: 'rgba(255, 255, 255, 0.8)',
              marginTop: '12px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>⏱️</span>
              <span>
                Utgår: {formatDate(generatedCode.expiresAt)} <strong>({generatedCode.expiresInMinutes} min)</strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Active Codes */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ color: '#333', margin: 0 }}>Aktiva Koder</h3>
          <button
            onClick={fetchActiveCodes}
            style={{
              padding: '6px 12px',
              background: '#00B2E3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            🔄 Uppdatera
          </button>
        </div>

        {activeCodes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            Inga aktiva koder
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse'
            }}>
              <thead>
                <tr style={{ background: '#f5f5f5' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Kod</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Skapad av</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Skapad</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Utgår</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Återstår</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeCodes.map((code) => (
                  <tr key={code.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{
                      padding: '12px',
                      fontSize: '18px',
                      fontWeight: '700',
                      fontFamily: 'monospace',
                      color: '#005A9C',
                      letterSpacing: '2px'
                    }}>
                      {code.code}
                    </td>
                    <td style={{ padding: '12px', fontSize: '13px' }}>
                      {code.created_by_email}
                    </td>
                    <td style={{ padding: '12px', fontSize: '13px' }}>
                      {formatDate(code.created_at)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '13px' }}>
                      {formatDate(code.expires_at)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '13px', fontWeight: '600', color: '#ff9800' }}>
                      {getRemainingTime(code.expires_at)}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <button
                        onClick={() => deleteCode(code.code)}
                        style={{
                          padding: '6px 12px',
                          background: '#f44336',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '13px'
                        }}
                      >
                        🗑️ Ta bort
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* History Toggle */}
      <button
        onClick={toggleHistory}
        style={{
          padding: '10px 20px',
          background: '#666',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          marginBottom: '16px'
        }}
      >
        {showHistory ? '👁️ Dölj Historik' : '📜 Visa Historik'}
      </button>

      {/* History */}
      {showHistory && (
        <div style={{
          background: 'white',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ color: '#333', marginTop: 0, marginBottom: '16px' }}>Historik (senaste 100)</h3>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              Laddar historik...
            </div>
          ) : allCodes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              Ingen historik
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse'
              }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Kod</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Status</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Skapad av</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Skapad</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Utgick</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Använd</th>
                  </tr>
                </thead>
                <tbody>
                  {allCodes.map((code) => (
                    <tr key={code.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{
                        padding: '12px',
                        fontSize: '14px',
                        fontFamily: 'monospace',
                        letterSpacing: '2px'
                      }}>
                        {code.code}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          background: code.used ? '#4caf50' :
                                     new Date(code.expires_at) < new Date() ? '#f44336' : '#ff9800',
                          color: 'white',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '600'
                        }}>
                          {code.used ? 'ANVÄND' :
                           new Date(code.expires_at) < new Date() ? 'UTGÅNGEN' : 'AKTIV'}
                        </span>
                      </td>
                      <td style={{ padding: '12px', fontSize: '13px' }}>
                        {code.created_by_email}
                      </td>
                      <td style={{ padding: '12px', fontSize: '13px' }}>
                        {formatDate(code.created_at)}
                      </td>
                      <td style={{ padding: '12px', fontSize: '13px' }}>
                        {formatDate(code.expires_at)}
                      </td>
                      <td style={{ padding: '12px', fontSize: '13px' }}>
                        {code.used ? formatDate(code.used_at) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminTVCodes;
