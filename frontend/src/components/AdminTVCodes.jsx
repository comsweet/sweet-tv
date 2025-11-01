import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const AdminTVCodes = () => {
  const [activeCodes, setActiveCodes] = useState([]);
  const [allCodes, setAllCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expiresInMinutes, setExpiresInMinutes] = useState(5);
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
      <h2 style={{ color: '#005A9C', marginBottom: '20px' }}>🔑 TV Access Codes</h2>

      <div style={{
        background: '#e3f2fd',
        padding: '16px',
        borderRadius: '8px',
        marginBottom: '20px',
        fontSize: '14px',
        color: '#0d47a1'
      }}>
        <strong>ℹ️ Så fungerar det:</strong>
        <p style={{ margin: '8px 0 0 0' }}>
          Generera en 6-siffrig kod som TV-skärmar kan använda för att få tillgång till slideshows.
          Koden är giltig i 1-10 minuter och kan endast användas en gång.
        </p>
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
        background: 'white',
        padding: '24px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        marginBottom: '24px'
      }}>
        <h3 style={{ color: '#333', marginTop: 0, marginBottom: '16px' }}>Generera Ny Kod</h3>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1', minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>
              Giltighetstid (minuter)
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={expiresInMinutes}
              onChange={(e) => setExpiresInMinutes(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '4px',
                border: '2px solid #e0e0e0',
                fontSize: '15px'
              }}
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              Max 10 minuter
            </div>
          </div>

          <button
            onClick={generateCode}
            disabled={loading}
            style={{
              padding: '10px 24px',
              background: 'linear-gradient(135deg, #005A9C 0%, #00B2E3 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '15px',
              fontWeight: '600'
            }}
          >
            {loading ? 'Genererar...' : '🔑 Generera Kod'}
          </button>

          <button
            onClick={cleanup}
            style={{
              padding: '10px 24px',
              background: '#666',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '15px'
            }}
          >
            🧹 Rensa Utgångna
          </button>
        </div>

        {/* Generated Code Display */}
        {generatedCode && (
          <div style={{
            marginTop: '24px',
            padding: '24px',
            background: '#f5f5f5',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
              Din kod:
            </div>
            <div style={{
              fontSize: '48px',
              fontWeight: '700',
              color: '#005A9C',
              letterSpacing: '8px',
              fontFamily: 'monospace'
            }}>
              {generatedCode.code}
            </div>
            <div style={{ fontSize: '14px', color: '#999', marginTop: '8px' }}>
              Utgår: {formatDate(generatedCode.expiresAt)} ({generatedCode.expiresInMinutes} min)
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
