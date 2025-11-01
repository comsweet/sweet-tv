import { useState } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const AdminChangePassword = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (newPassword.length < 6) {
      setError('Nytt lösenord måste vara minst 6 tecken');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Lösenorden matchar inte');
      return;
    }

    try {
      setLoading(true);

      await axios.post(`${API_BASE_URL}/auth/change-password`, {
        currentPassword,
        newPassword
      });

      setSuccess('Lösenordet har ändrats!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error('Change password error:', err);
      setError(err.response?.data?.error || 'Kunde inte ändra lösenord');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-section">
      <h2 style={{ color: '#005A9C', marginBottom: '20px' }}>🔒 Byt Lösenord</h2>

      <div style={{
        maxWidth: '500px',
        background: 'white',
        padding: '32px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        {error && (
          <div style={{
            background: '#fee',
            color: '#c33',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '20px'
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
            marginBottom: '20px'
          }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '600',
              fontSize: '14px',
              color: '#333'
            }}>
              Nuvarande Lösenord
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '4px',
                border: '2px solid #e0e0e0',
                fontSize: '15px'
              }}
            />
          </div>

          <div>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '600',
              fontSize: '14px',
              color: '#333'
            }}>
              Nytt Lösenord
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '4px',
                border: '2px solid #e0e0e0',
                fontSize: '15px'
              }}
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              Minst 6 tecken
            </div>
          </div>

          <div>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '600',
              fontSize: '14px',
              color: '#333'
            }}>
              Bekräfta Nytt Lösenord
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '4px',
                border: '2px solid #e0e0e0',
                fontSize: '15px'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #005A9C 0%, #00B2E3 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: '600',
              marginTop: '8px'
            }}
          >
            {loading ? 'Ändrar...' : 'Byt Lösenord'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminChangePassword;
