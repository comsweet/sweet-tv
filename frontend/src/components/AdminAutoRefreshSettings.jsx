import { useState, useEffect } from 'react';
import {
  getAutoRefreshSettings,
  updateAutoRefreshSettings,
  resetAutoRefreshSettings
} from '../services/api';
import './AdminAutoRefreshSettings.css';

const AdminAutoRefreshSettings = () => {
  const [settings, setSettings] = useState({
    refreshInterval: 5000,
    showIndicator: true,
    enabled: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await getAutoRefreshSettings();
      setSettings(response.data.settings);
    } catch (error) {
      console.error('Error fetching auto-refresh settings:', error);
      alert('Error loading settings: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await updateAutoRefreshSettings(settings);
      setSettings(response.data.settings);
      alert('✅ Auto-refresh settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('❌ Error saving settings: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Are you sure you want to reset to default settings?')) {
      return;
    }

    setSaving(true);
    try {
      const response = await resetAutoRefreshSettings();
      setSettings(response.data.settings);
      alert('✅ Settings reset to defaults!');
    } catch (error) {
      console.error('Error resetting settings:', error);
      alert('❌ Error resetting settings: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleIntervalChange = (e) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value >= 0 && value <= 60000) {
      setSettings({ ...settings, refreshInterval: value });
    }
  };

  if (loading) {
    return <div className="settings-loading">Loading settings...</div>;
  }

  return (
    <div className="auto-refresh-settings">
      <div className="settings-header">
        <h1>⚡ Auto-Refresh Settings</h1>
        <p className="settings-subtitle">
          Configure how leaderboards update after new deals
        </p>
      </div>

      <div className="settings-content">
        <div className="settings-section">
          <div className="section-header">
            <h2>🔄 Refresh Behavior</h2>
            <p className="section-desc">
              Control when and how leaderboards refresh after a new deal notification
            </p>
          </div>

          <div className="setting-item">
            <div className="setting-label-group">
              <label htmlFor="enabled" className="setting-label">
                Enable Auto-Refresh
              </label>
              <p className="setting-description">
                Automatically update leaderboard stats after new deal notifications
              </p>
            </div>
            <div className="setting-control">
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={settings.enabled}
                  onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>

          <div className={`setting-item ${!settings.enabled ? 'disabled' : ''}`}>
            <div className="setting-label-group">
              <label htmlFor="refreshInterval" className="setting-label">
                Refresh Delay
              </label>
              <p className="setting-description">
                Time to wait after deal popup before refreshing (milliseconds)
              </p>
            </div>
            <div className="setting-control">
              <input
                type="number"
                id="refreshInterval"
                className="setting-input"
                value={settings.refreshInterval}
                onChange={handleIntervalChange}
                min="0"
                max="60000"
                step="1000"
                disabled={!settings.enabled}
              />
              <span className="setting-unit">ms</span>
              <span className="setting-hint">
                ({(settings.refreshInterval / 1000).toFixed(1)} seconds)
              </span>
            </div>
          </div>

          <div className={`setting-item ${!settings.enabled ? 'disabled' : ''}`}>
            <div className="setting-label-group">
              <label htmlFor="showIndicator" className="setting-label">
                Show Update Indicator
              </label>
              <p className="setting-description">
                Display a visual indicator when leaderboard is updating
              </p>
            </div>
            <div className="setting-control">
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  id="showIndicator"
                  checked={settings.showIndicator}
                  onChange={(e) => setSettings({ ...settings, showIndicator: e.target.checked })}
                  disabled={!settings.enabled}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>

        <div className="settings-actions">
          <button
            onClick={handleSave}
            className="btn-save"
            disabled={saving}
          >
            {saving ? '💾 Saving...' : '💾 Save Settings'}
          </button>

          <button
            onClick={handleReset}
            className="btn-reset"
            disabled={saving}
          >
            🔄 Reset to Defaults
          </button>
        </div>

        <div className="settings-info">
          <h3>💡 How It Works</h3>
          <div className="info-grid">
            <div className="info-item">
              <div className="info-icon">📡</div>
              <div className="info-content">
                <div className="info-title">Real-time Detection</div>
                <div className="info-desc">
                  When a new deal is closed, the system detects it immediately via WebSocket
                </div>
              </div>
            </div>

            <div className="info-item">
              <div className="info-icon">⏱️</div>
              <div className="info-content">
                <div className="info-title">Delayed Refresh</div>
                <div className="info-desc">
                  After the configured delay, leaderboard stats refresh silently in the background
                </div>
              </div>
            </div>

            <div className="info-item">
              <div className="info-icon">🎯</div>
              <div className="info-content">
                <div className="info-title">No Page Reload</div>
                <div className="info-desc">
                  The page doesn't reload - only the stats update seamlessly
                </div>
              </div>
            </div>

            <div className="info-item">
              <div className="info-icon">👁️</div>
              <div className="info-content">
                <div className="info-title">Optional Indicator</div>
                <div className="info-desc">
                  Choose whether to show a visual indicator during the update
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="settings-presets">
          <h3>⚡ Quick Presets</h3>
          <div className="presets-grid">
            <button
              className="preset-btn"
              onClick={() => setSettings({ ...settings, refreshInterval: 3000, showIndicator: true, enabled: true })}
            >
              <div className="preset-name">Fast</div>
              <div className="preset-desc">3 seconds delay</div>
            </button>

            <button
              className="preset-btn"
              onClick={() => setSettings({ ...settings, refreshInterval: 5000, showIndicator: true, enabled: true })}
            >
              <div className="preset-name">Recommended</div>
              <div className="preset-desc">5 seconds delay</div>
            </button>

            <button
              className="preset-btn"
              onClick={() => setSettings({ ...settings, refreshInterval: 10000, showIndicator: true, enabled: true })}
            >
              <div className="preset-name">Slow</div>
              <div className="preset-desc">10 seconds delay</div>
            </button>

            <button
              className="preset-btn"
              onClick={() => setSettings({ ...settings, enabled: false })}
            >
              <div className="preset-name">Disabled</div>
              <div className="preset-desc">No auto-refresh</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminAutoRefreshSettings;
