import { useState, useEffect } from 'react';
import axios from 'axios';
import './TVAccessCodeModal.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Generate UUID v4
const generateSessionId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const TVAccessCodeModal = ({ onAccessGranted, sessionError = null }) => {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const inputRefs = [
    ...Array(6).fill(0).map(() => null)
  ];

  // Check if already validated (check for session ID)
  useEffect(() => {
    const sessionId = sessionStorage.getItem('tvSessionId');
    if (sessionId) {
      // Validate session with backend
      validateSession(sessionId);
    }
  }, [onAccessGranted]);

  const validateSession = async (sessionId) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/tv-codes/sessions/validate`, {
        sessionId
      });

      if (response.data.valid) {
        onAccessGranted();
      } else {
        // Session invalid, clear storage
        sessionStorage.removeItem('tvSessionId');
        sessionStorage.removeItem('tvAccessGranted');
      }
    } catch (error) {
      console.error('Session validation error:', error);
      sessionStorage.removeItem('tvSessionId');
      sessionStorage.removeItem('tvAccessGranted');
    }
  };

  const handleInputChange = (index, value) => {
    // Only allow numbers
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setError('');

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`code-input-${index + 1}`);
      if (nextInput) nextInput.focus();
    }

    // Auto-validate when all 6 digits are entered
    if (newCode.every(digit => digit !== '')) {
      validateCode(newCode.join(''));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      const prevInput = document.getElementById(`code-input-${index - 1}`);
      if (prevInput) prevInput.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();

    // Only accept 6-digit numbers
    if (/^\d{6}$/.test(pastedData)) {
      const newCode = pastedData.split('');
      setCode(newCode);
      validateCode(pastedData);
    }
  };

  const validateCode = async (codeString) => {
    setIsValidating(true);
    setError('');

    try {
      // Generate new session ID
      const sessionId = generateSessionId();

      const response = await axios.post(`${API_BASE_URL}/tv-codes/validate`, {
        code: codeString,
        sessionId: sessionId
      });

      if (response.data.valid) {
        // Store session ID in sessionStorage
        sessionStorage.setItem('tvSessionId', sessionId);
        sessionStorage.setItem('tvAccessGranted', 'true');
        sessionStorage.setItem('tvSessionExpires', response.data.expiresAt);
        console.log(`✅ Session created: ${sessionId}, expires: ${response.data.expiresAt}`);
        onAccessGranted();
      } else {
        setError(response.data.reason === 'Code not found' ? 'Ogiltig kod' :
                 response.data.reason === 'Code already used' ? 'Koden har redan använts' :
                 response.data.reason === 'Code expired' ? 'Koden har utgått' :
                 'Ogiltig kod');
        setCode(['', '', '', '', '', '']);
        const firstInput = document.getElementById('code-input-0');
        if (firstInput) firstInput.focus();
      }
    } catch (err) {
      console.error('Validation error:', err);
      setError('Kunde inte validera kod. Försök igen.');
      setCode(['', '', '', '', '', '']);
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const codeString = code.join('');
    if (codeString.length === 6) {
      validateCode(codeString);
    }
  };

  return (
    <div className="tv-access-modal-overlay">
      <div className="tv-access-modal">
        <div className="tv-access-header">
          <h1>Sweet TV</h1>
          <p>Ange tillgångskod för att fortsätta</p>
          {sessionError && (
            <div className="tv-session-error">
              <strong>Din session har avslutats:</strong>
              <br />
              {sessionError}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="tv-access-form">
          <div className="code-inputs" onPaste={handlePaste}>
            {code.map((digit, index) => (
              <input
                key={index}
                id={`code-input-${index}`}
                type="text"
                maxLength="1"
                value={digit}
                onChange={(e) => handleInputChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                disabled={isValidating}
                autoFocus={index === 0}
                className={error ? 'error' : ''}
              />
            ))}
          </div>

          {error && (
            <div className="tv-access-error">
              {error}
            </div>
          )}

          {isValidating && (
            <div className="tv-access-validating">
              Validerar kod...
            </div>
          )}

          <div className="tv-access-help">
            <p>Kontakta en administratör för att få en tillgångskod</p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TVAccessCodeModal;
