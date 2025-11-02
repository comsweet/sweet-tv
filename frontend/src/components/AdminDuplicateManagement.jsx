import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getPendingDuplicates,
  resolveDuplicate,
  getDuplicateHistory
} from '../services/api';
import './AdminDuplicateManagement.css';

const AdminDuplicateManagement = () => {
  const { user } = useAuth();
  const [pendingDuplicates, setPendingDuplicates] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedDuplicate, setSelectedDuplicate] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [note, setNote] = useState('');
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    fetchPendingDuplicates();
  }, []);

  const fetchPendingDuplicates = async () => {
    setLoading(true);
    try {
      const response = await getPendingDuplicates();
      setPendingDuplicates(response.data.pending || []);
    } catch (error) {
      console.error('Error fetching pending duplicates:', error);
      if (error.response?.status !== 500) {
        alert('Error loading pending duplicates: ' + error.message);
      } else {
        // Table might not exist yet
        setPendingDuplicates([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await getDuplicateHistory(50);
      setHistory(response.data.history || []);
    } catch (error) {
      console.error('Error fetching duplicate history:', error);
    }
  };

  const handleResolve = async (action) => {
    if (!selectedDuplicate) return;

    setResolving(true);
    try {
      await resolveDuplicate(
        selectedDuplicate.id,
        action,
        note,
        user?.email || 'admin'
      );

      alert(`✅ Duplicate ${action === 'approve' ? 'approved' : action === 'replace' ? 'replaced' : action === 'merge' ? 'merged' : 'rejected'} successfully!`);

      setShowModal(false);
      setNote('');
      setSelectedDuplicate(null);

      await fetchPendingDuplicates();
      if (showHistory) {
        await fetchHistory();
      }
    } catch (error) {
      console.error('Error resolving duplicate:', error);
      alert('❌ Error: ' + error.message);
    } finally {
      setResolving(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('sv-SE');
  };

  const formatCurrency = (amount) => {
    return parseFloat(amount || 0).toLocaleString('sv-SE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + ' THB';
  };

  const toggleHistory = async () => {
    setShowHistory(!showHistory);
    if (!showHistory) {
      await fetchHistory();
    }
  };

  if (loading) {
    return <div className="duplicate-loading">Loading duplicate management...</div>;
  }

  return (
    <div className="duplicate-management">
      <div className="duplicate-header">
        <h1>⚠️ Duplicate Management</h1>
        <p className="duplicate-subtitle">
          Granska och besluta om duplicerade deals (samma lead_id)
        </p>
      </div>

      {/* Info Box */}
      <div style={{
        background: 'linear-gradient(135deg, #e3f2fd 0%, #f0f8ff 100%)',
        padding: '20px 24px',
        borderRadius: '12px',
        marginBottom: '24px',
        border: '2px solid #90caf9'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>ℹ️</span>
          <div>
            <strong style={{ color: '#0d47a1', fontSize: '15px', display: 'block', marginBottom: '8px' }}>
              Så fungerar det:
            </strong>
            <p style={{ margin: 0, color: '#1565c0', fontSize: '14px', lineHeight: '1.6' }}>
              När samma lead_id försöker registreras igen hamnar den i pending-kön och väntar på ditt beslut.
              Detta förhindrar fusk där säljare raderar och re-registrerar orders för att få dubbel provision.
            </p>
          </div>
        </div>
      </div>

      {/* Pending Duplicates */}
      <div className="pending-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0 }}>
            🚨 Pending Duplicates ({pendingDuplicates.length})
          </h2>
          <button
            onClick={fetchPendingDuplicates}
            className="btn-refresh"
            style={{
              padding: '8px 16px',
              background: '#00B2E3',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            🔄 Refresh
          </button>
        </div>

        {pendingDuplicates.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            background: '#f8f9fa',
            borderRadius: '8px',
            color: '#666'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <h3 style={{ margin: '0 0 8px 0', color: '#333' }}>Inga pending duplicates</h3>
            <p style={{ margin: 0 }}>Alla deals är unika!</p>
          </div>
        ) : (
          <div className="duplicates-table-container">
            <table className="duplicates-table">
              <thead>
                <tr>
                  <th>Detected</th>
                  <th>Lead ID</th>
                  <th>Befintlig Deal</th>
                  <th>Ny Deal (Pending)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingDuplicates.map((dup) => (
                  <tr key={dup.id}>
                    <td style={{ fontSize: '13px' }}>
                      {formatDate(dup.detected_at)}
                    </td>
                    <td>
                      <strong style={{ fontFamily: 'monospace', color: '#005A9C' }}>
                        {dup.lead_id}
                      </strong>
                    </td>
                    <td>
                      <div className="deal-info">
                        <div><strong>Agent:</strong> {dup.existing_agent_name || 'Unknown'}</div>
                        <div><strong>Commission:</strong> {formatCurrency(dup.existing_commission)}</div>
                        <div><strong>Date:</strong> {formatDate(dup.existing_order_date)}</div>
                      </div>
                    </td>
                    <td>
                      <div className="deal-info new-deal">
                        <div><strong>Agent:</strong> {dup.new_agent_name || 'Unknown'}</div>
                        <div><strong>Commission:</strong> {formatCurrency(dup.new_commission)}</div>
                        <div><strong>Date:</strong> {formatDate(dup.new_order_date)}</div>
                      </div>
                    </td>
                    <td>
                      <button
                        onClick={() => {
                          setSelectedDuplicate(dup);
                          setShowModal(true);
                        }}
                        className="btn-review"
                        style={{
                          padding: '8px 16px',
                          background: '#4caf50',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: '600'
                        }}
                      >
                        📋 Review
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
      <div style={{ marginTop: '32px' }}>
        <button
          onClick={toggleHistory}
          style={{
            padding: '12px 24px',
            background: '#666',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600'
          }}
        >
          {showHistory ? '👁️ Hide History' : '📜 Show History'}
        </button>
      </div>

      {/* History */}
      {showHistory && (
        <div className="history-section" style={{ marginTop: '24px' }}>
          <h2>📜 Resolution History</h2>
          {history.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              background: '#f8f9fa',
              borderRadius: '8px',
              color: '#666'
            }}>
              No resolution history yet
            </div>
          ) : (
            <div className="history-table-container">
              <table className="duplicates-table">
                <thead>
                  <tr>
                    <th>Resolved</th>
                    <th>Lead ID</th>
                    <th>Resolution</th>
                    <th>Resolved By</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id}>
                      <td style={{ fontSize: '13px' }}>
                        {formatDate(item.resolved_at)}
                      </td>
                      <td>
                        <strong style={{ fontFamily: 'monospace' }}>
                          {item.lead_id}
                        </strong>
                      </td>
                      <td>
                        <span className={`resolution-badge ${item.resolution}`}>
                          {item.resolution === 'approve' && '✅ Approved'}
                          {item.resolution === 'replace' && '🔄 Replaced'}
                          {item.resolution === 'merge' && '🔀 Merged'}
                          {item.resolution === 'reject' && '❌ Rejected'}
                        </span>
                      </td>
                      <td style={{ fontSize: '13px' }}>
                        {item.resolved_by || 'Unknown'}
                      </td>
                      <td style={{ fontSize: '13px', fontStyle: 'italic' }}>
                        {item.resolution_note || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Resolution Modal */}
      {showModal && selectedDuplicate && (
        <div className="modal-overlay" onClick={() => !resolving && setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, color: '#005A9C' }}>
              Resolve Duplicate: {selectedDuplicate.lead_id}
            </h2>

            <div className="duplicate-comparison">
              <div className="deal-card existing">
                <h3>📦 Befintlig Deal</h3>
                <div className="deal-details">
                  <div><strong>Agent:</strong> {selectedDuplicate.existing_agent_name || 'Unknown'}</div>
                  <div><strong>Commission:</strong> {formatCurrency(selectedDuplicate.existing_commission)}</div>
                  <div><strong>Order Date:</strong> {formatDate(selectedDuplicate.existing_order_date)}</div>
                  <div><strong>Campaign:</strong> {selectedDuplicate.existing_campaign_id || 'N/A'}</div>
                </div>
              </div>

              <div className="deal-card new">
                <h3>✨ Ny Deal (Pending)</h3>
                <div className="deal-details">
                  <div><strong>Agent:</strong> {selectedDuplicate.new_agent_name || 'Unknown'}</div>
                  <div><strong>Commission:</strong> {formatCurrency(selectedDuplicate.new_commission)}</div>
                  <div><strong>Order Date:</strong> {formatDate(selectedDuplicate.new_order_date)}</div>
                  <div><strong>Campaign:</strong> {selectedDuplicate.new_campaign_id || 'N/A'}</div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                Optional Note:
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Varför valde du detta beslut? (valfritt)"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  minHeight: '80px',
                  resize: 'vertical'
                }}
                disabled={resolving}
              />
            </div>

            <div className="modal-actions" style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button
                onClick={() => handleResolve('approve')}
                disabled={resolving}
                style={{
                  padding: '14px',
                  background: '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: resolving ? 'not-allowed' : 'pointer',
                  fontSize: '15px',
                  fontWeight: '600',
                  opacity: resolving ? 0.6 : 1
                }}
              >
                ✅ Approve (Tillåt båda)
              </button>

              <button
                onClick={() => handleResolve('replace')}
                disabled={resolving}
                style={{
                  padding: '14px',
                  background: '#ff9800',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: resolving ? 'not-allowed' : 'pointer',
                  fontSize: '15px',
                  fontWeight: '600',
                  opacity: resolving ? 0.6 : 1
                }}
              >
                🔄 Replace (Ersätt gammal)
              </button>

              <button
                onClick={() => handleResolve('merge')}
                disabled={resolving}
                style={{
                  padding: '14px',
                  background: '#2196f3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: resolving ? 'not-allowed' : 'pointer',
                  fontSize: '15px',
                  fontWeight: '600',
                  opacity: resolving ? 0.6 : 1
                }}
              >
                🔀 Merge (Uppdatera befintlig)
              </button>

              <button
                onClick={() => handleResolve('reject')}
                disabled={resolving}
                style={{
                  padding: '14px',
                  background: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: resolving ? 'not-allowed' : 'pointer',
                  fontSize: '15px',
                  fontWeight: '600',
                  opacity: resolving ? 0.6 : 1
                }}
              >
                ❌ Reject (Behåll gammal)
              </button>
            </div>

            <button
              onClick={() => setShowModal(false)}
              disabled={resolving}
              style={{
                marginTop: '16px',
                width: '100%',
                padding: '12px',
                background: '#666',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: resolving ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                opacity: resolving ? 0.6 : 1
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDuplicateManagement;
