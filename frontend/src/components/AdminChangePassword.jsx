import { useState } from 'react';
import { changePassword } from '../services/api';
import './AdminChangePassword.css';

const AdminChangePassword = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);

    // Validation
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Nytt lösenord måste vara minst 6 tecken' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'De nya lösenorden matchar inte' });
      return;
    }

    setIsSubmitting(true);

    try {
      await changePassword(currentPassword, newPassword);

      setMessage({
        type: 'success',
        text: '✅ Lösenord ändrat! Du förblir inloggad.'
      });

      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Change password error:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Fel vid byte av lösenord'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="admin-change-password">
      <h2>🔒 Byt Lösenord</h2>
      <p className="description">
        Av säkerhetsskäl rekommenderar vi att du byter ditt lösenord regelbundet.
      </p>

      <div className="password-form-container">
        <form onSubmit={handleSubmit} className="password-form">
          {message && (
            <div className={`message ${message.type}`}>
              {message.text}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="currentPassword">Nuvarande Lösenord</label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Ange ditt nuvarande lösenord"
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="newPassword">Nytt Lösenord</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minst 6 tecken"
              required
              disabled={isSubmitting}
            />
            {newPassword && newPassword.length < 6 && (
              <small className="validation-hint">⚠️ Minst 6 tecken krävs</small>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Bekräfta Nytt Lösenord</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Ange nytt lösenord igen"
              required
              disabled={isSubmitting}
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <small className="validation-hint error">❌ Lösenorden matchar inte</small>
            )}
            {confirmPassword && newPassword === confirmPassword && newPassword.length >= 6 && (
              <small className="validation-hint success">✅ Lösenorden matchar</small>
            )}
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={isSubmitting || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword || newPassword.length < 6}
          >
            {isSubmitting ? '⏳ Byter lösenord...' : '🔒 Byt Lösenord'}
          </button>
        </form>

        <div className="password-tips">
          <h3>💡 Tips för säkra lösenord:</h3>
          <ul>
            <li>Använd minst 8-12 tecken</li>
            <li>Blanda stora och små bokstäver</li>
            <li>Inkludera siffror och specialtecken</li>
            <li>Undvik vanliga ord eller namn</li>
            <li>Använd inte samma lösenord på flera ställen</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AdminChangePassword;
