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
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const getPasswordStrength = (password) => {
    if (password.length === 0) return { strength: 0, label: '', color: '#e0e0e0' };
    if (password.length < 6) return { strength: 1, label: 'Svagt', color: '#f44336' };

    let strength = 1;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    if (strength <= 2) return { strength: 2, label: 'Svagt', color: '#ff9800' };
    if (strength === 3) return { strength: 3, label: 'Bra', color: '#ffc107' };
    if (strength === 4) return { strength: 4, label: 'Starkt', color: '#8bc34a' };
    return { strength: 5, label: 'Mycket starkt', color: '#4caf50' };
  };

  const passwordStrength = getPasswordStrength(newPassword);

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

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        {/* Main Form */}
        <div style={{
          flex: '1',
          minWidth: '400px',
          maxWidth: '550px',
          background: 'white',
          padding: '32px',
          borderRadius: '12px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          border: '1px solid #e8e8e8'
        }}>
          {error && (
            <div style={{
              background: '#ffebee',
              color: '#c62828',
              padding: '14px 16px',
              borderRadius: '8px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              border: '1px solid #ef9a9a'
            }}>
              <span style={{ fontSize: '18px' }}>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div style={{
              background: '#e8f5e9',
              color: '#2e7d32',
              padding: '14px 16px',
              borderRadius: '8px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              border: '1px solid #a5d6a7'
            }}>
              <span style={{ fontSize: '18px' }}>✅</span>
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Current Password */}
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
              <div style={{ position: 'relative' }}>
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '12px 40px 12px 12px',
                    borderRadius: '8px',
                    border: '2px solid #e0e0e0',
                    fontSize: '15px',
                    transition: 'all 0.3s',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#00B2E3'}
                  onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '18px',
                    padding: '4px'
                  }}
                >
                  {showCurrentPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* New Password */}
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
              <div style={{ position: 'relative' }}>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '12px 40px 12px 12px',
                    borderRadius: '8px',
                    border: '2px solid #e0e0e0',
                    fontSize: '15px',
                    transition: 'all 0.3s',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#00B2E3'}
                  onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '18px',
                    padding: '4px'
                  }}
                >
                  {showNewPassword ? '🙈' : '👁️'}
                </button>
              </div>

              {/* Password Strength Indicator */}
              {newPassword && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{
                    display: 'flex',
                    gap: '4px',
                    marginBottom: '6px'
                  }}>
                    {[1, 2, 3, 4, 5].map((level) => (
                      <div
                        key={level}
                        style={{
                          flex: 1,
                          height: '4px',
                          borderRadius: '2px',
                          background: passwordStrength.strength >= level ? passwordStrength.color : '#e0e0e0',
                          transition: 'all 0.3s'
                        }}
                      />
                    ))}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: passwordStrength.color,
                    fontWeight: '600'
                  }}>
                    {passwordStrength.label}
                  </div>
                </div>
              )}

              <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                Minst 6 tecken. Rekommenderat: 8+ tecken med stora/små bokstäver, siffror och specialtecken.
              </div>
            </div>

            {/* Confirm Password */}
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
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '12px 40px 12px 12px',
                    borderRadius: '8px',
                    border: confirmPassword && confirmPassword !== newPassword ? '2px solid #f44336' : '2px solid #e0e0e0',
                    fontSize: '15px',
                    transition: 'all 0.3s',
                    outline: 'none'
                  }}
                  onFocus={(e) => {
                    if (confirmPassword && confirmPassword !== newPassword) {
                      e.target.style.borderColor = '#f44336';
                    } else {
                      e.target.style.borderColor = '#00B2E3';
                    }
                  }}
                  onBlur={(e) => {
                    if (confirmPassword && confirmPassword !== newPassword) {
                      e.target.style.borderColor = '#f44336';
                    } else {
                      e.target.style.borderColor = '#e0e0e0';
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '18px',
                    padding: '4px'
                  }}
                >
                  {showConfirmPassword ? '🙈' : '👁️'}
                </button>
              </div>
              {confirmPassword && confirmPassword !== newPassword && (
                <div style={{ fontSize: '12px', color: '#f44336', marginTop: '6px' }}>
                  ❌ Lösenorden matchar inte
                </div>
              )}
              {confirmPassword && confirmPassword === newPassword && (
                <div style={{ fontSize: '12px', color: '#4caf50', marginTop: '6px' }}>
                  ✅ Lösenorden matchar
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '14px 24px',
                background: loading ? '#ccc' : 'linear-gradient(135deg, #005A9C 0%, #00B2E3 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '16px',
                fontWeight: '600',
                marginTop: '8px',
                transition: 'all 0.3s'
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 4px 12px rgba(0, 178, 227, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = 'none';
              }}
            >
              {loading ? '🔄 Ändrar...' : '🔒 Byt Lösenord'}
            </button>
          </form>
        </div>

        {/* Security Tips Sidebar */}
        <div style={{
          flex: '0 0 280px',
          background: 'linear-gradient(135deg, #e3f2fd 0%, #f5f5f5 100%)',
          padding: '24px',
          borderRadius: '12px',
          border: '1px solid #e0e0e0',
          height: 'fit-content'
        }}>
          <h3 style={{
            margin: '0 0 16px 0',
            fontSize: '16px',
            color: '#005A9C',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            🛡️ Säkerhetstips
          </h3>
          <ul style={{
            margin: 0,
            padding: '0 0 0 20px',
            fontSize: '13px',
            color: '#555',
            lineHeight: '1.8'
          }}>
            <li>Använd minst 8 tecken</li>
            <li>Blanda stora och små bokstäver</li>
            <li>Inkludera siffror och specialtecken</li>
            <li>Undvik personlig information</li>
            <li>Använd inte samma lösenord på flera platser</li>
            <li>Byt lösenord regelbundet</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AdminChangePassword;
