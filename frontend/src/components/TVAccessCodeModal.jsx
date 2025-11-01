import { useState, useEffect } from 'react';
import axios from 'axios';
import './TVAccessCodeModal.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const TVAccessCodeModal = ({ onAccessGranted }) => {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const inputRefs = [
    ...Array(6).fill(0).map(() => null)
  ];

  // Check if already validated (stored in sessionStorage)
  useEffect(() => {
    const hasAccess = sessionStorage.getItem('tvAccessGranted');
    if (hasAccess === 'true') {
      onAccessGranted();
    }
  }, [onAccessGranted]);

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
      const response = await axios.post(`${API_BASE_URL}/tv-codes/validate`, {
        code: codeString
      });

      if (response.data.valid) {
        // Store in sessionStorage (clears on tab/window close)
        sessionStorage.setItem('tvAccessGranted', 'true');
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
