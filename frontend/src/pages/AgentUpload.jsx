import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { uploadWithToken } from '../services/api';
import './AgentUpload.css';

const AgentUpload = () => {
  const { token } = useParams();
  const [agentName, setAgentName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    // Decode JWT to get agent name (without verification - just for display)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setAgentName(payload.agentName || 'Agent');
      setIsLoading(false);
    } catch (err) {
      setError('Ogiltig länk');
      setIsLoading(false);
    }
  }, [token]);

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Endast bildfiler tillåtna (JPG, PNG, JPEG)');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Bilden är för stor! Max 5MB.');
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(file);

    setError(null);
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    const file = event.target.image.files[0];

    if (!file) {
      setError('Välj en bild först');
      return;
    }

    try {
      setIsUploading(true);
      setError(null);

      await uploadWithToken(token, file);

      setSuccess(true);
      setPreview(null);
    } catch (err) {
      console.error('Upload error:', err);
      if (err.response?.data?.error === 'Token has expired') {
        setError('Länken har gått ut. Be din coach om en ny länk.');
      } else if (err.response?.data?.error === 'Invalid token') {
        setError('Ogiltig länk. Kontakta din coach.');
      } else {
        setError('Uppladdning misslyckades: ' + (err.response?.data?.error || err.message));
      }
    } finally {
      setIsUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="upload-page">
        <div className="upload-container">
          <div className="loading">Laddar...</div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="upload-page">
        <div className="upload-container">
          <div className="success-message">
            <h1>✅ Klart!</h1>
            <p>Din profilbild har laddats upp.</p>
            <p className="success-hint">Du kan stänga denna sida nu.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="upload-page">
      <div className="upload-container">
        <div className="upload-header">
          <h1>📸 Ladda upp profilbild</h1>
          <p className="agent-name">Hej {agentName}!</p>
          <p className="upload-hint">
            Ladda upp din profilbild här. Länken är giltig i 1 timme.
          </p>
        </div>

        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleUpload} className="upload-form">
          <div className="file-input-wrapper">
            <input
              type="file"
              name="image"
              id="image"
              accept="image/jpeg,image/jpg,image/png"
              onChange={handleFileSelect}
              disabled={isUploading}
            />
            <label htmlFor="image" className="file-input-label">
              {preview ? '📷 Ändra bild' : '📁 Välj bild'}
            </label>
            <span className="file-hint">JPG, PNG, JPEG - Max 5MB</span>
          </div>

          {preview && (
            <div className="image-preview">
              <img src={preview} alt="Preview" />
            </div>
          )}

          <button
            type="submit"
            className="upload-button"
            disabled={isUploading || !preview}
          >
            {isUploading ? '⏳ Laddar upp...' : '🚀 Ladda upp'}
          </button>
        </form>

        <div className="upload-footer">
          <p>🔒 Säker uppladdning via krypterad länk</p>
        </div>
      </div>
    </div>
  );
};

export default AgentUpload;
