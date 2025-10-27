import { useState, useEffect } from 'react';
import './NotificationSettingsAdmin.css';

/**
 * ADMIN PANEL - NOTIFICATION SETTINGS
 * 
 * Låter admin välja vilka user groups som ska trigga pling.
 * Groups hämtas från Adversus user.group.id (EJ user.memberOf!)
 * 
 * Två modes:
 * - Blacklist (default): Alla groups UTOM blockerade
 * - Whitelist: Endast valda groups
 */
const NotificationSettingsAdmin = () => {
  const [settings, setSettings] = useState(null);
  const [availableGroups, setAvailableGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // Ladda settings och tillgängliga groups
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/notification-settings');
      const data = await response.json();
      
      if (data.success) {
        setSettings(data.settings);
        setAvailableGroups(data.availableGroups);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      showMessage('Fel vid laddning av inställningar', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  // Byt mode (whitelist <-> blacklist)
  const handleModeChange = async (newMode) => {
    try {
      setSaving(true);
      const response = await fetch('/api/notification-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          mode: newMode
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setSettings(data.settings);
        showMessage(`Mode bytt till ${newMode}`);
      }
    } catch (error) {
      console.error('Error changing mode:', error);
      showMessage('Fel vid byte av mode', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Toggle group (lägg till/ta bort från lista)
  const handleToggleGroup = async (groupId) => {
    try {
      setSaving(true);
      let newSettings = { ...settings };
      
      if (settings.mode === 'whitelist') {
        // Whitelist: Toggle i enabledGroups
        if (settings.enabledGroups.includes(groupId)) {
          newSettings.enabledGroups = settings.enabledGroups.filter(
            id => id !== groupId
          );
        } else {
          newSettings.enabledGroups = [...settings.enabledGroups, groupId];
        }
      } else {
        // Blacklist: Toggle i disabledGroups
        if (settings.disabledGroups.includes(groupId)) {
          newSettings.disabledGroups = settings.disabledGroups.filter(
            id => id !== groupId
          );
        } else {
          newSettings.disabledGroups = [...settings.disabledGroups, groupId];
        }
      }
      
      const response = await fetch('/api/notification-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      
      const data = await response.json();
      if (data.success) {
        setSettings(data.settings);
        showMessage('Inställningar uppdaterade');
      }
    } catch (error) {
      console.error('Error toggling group:', error);
      showMessage('Fel vid uppdatering', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Kolla om en group är aktiv
  const isGroupActive = (groupId) => {
    if (!settings) return false;
    
    if (settings.mode === 'whitelist') {
      return settings.enabledGroups.includes(groupId);
    } else {
      return !settings.disabledGroups.includes(groupId);
    }
  };

  if (loading) {
    return (
      <div className="notification-settings-admin">
        <div className="loading">Laddar inställningar...</div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="notification-settings-admin">
        <div className="error">Kunde inte ladda inställningar</div>
      </div>
    );
  }

  return (
    <div className="notification-settings-admin">
      <div className="settings-header">
        <h2>🔔 Notifikationsinställningar</h2>
        <p>Välj vilka user groups som ska trigga pling och popups</p>
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Mode Selector */}
      <div className="mode-selector">
        <h3>Filtreringsläge</h3>
        <div className="mode-options">
          <label className={`mode-option ${settings.mode === 'blacklist' ? 'active' : ''}`}>
            <input
              type="radio"
              name="mode"
              value="blacklist"
              checked={settings.mode === 'blacklist'}
              onChange={() => handleModeChange('blacklist')}
              disabled={saving}
            />
            <div className="mode-info">
              <strong>Blacklist (Rekommenderas)</strong>
              <span>Visa alla UTOM blockerade groups</span>
            </div>
          </label>

          <label className={`mode-option ${settings.mode === 'whitelist' ? 'active' : ''}`}>
            <input
              type="radio"
              name="mode"
              value="whitelist"
              checked={settings.mode === 'whitelist'}
              onChange={() => handleModeChange('whitelist')}
              disabled={saving}
            />
            <div className="mode-info">
              <strong>Whitelist</strong>
              <span>Visa ENDAST valda groups</span>
            </div>
          </label>
        </div>
      </div>

      {/* Groups List */}
      <div className="campaigns-list">
        <h3>
          {settings.mode === 'whitelist' 
            ? 'Välj groups att VISA' 
            : 'Välj groups att BLOCKERA'}
        </h3>
        
        {availableGroups.length === 0 && (
          <p className="no-campaigns">Inga groups hittade</p>
        )}

        <div className="campaigns-grid">
          {availableGroups.map(group => {
            const isActive = isGroupActive(group.id);
            
            return (
              <label 
                key={group.id}
                className={`campaign-item ${isActive ? 'active' : 'inactive'}`}
              >
                <input
                  type="checkbox"
                  checked={
                    settings.mode === 'whitelist'
                      ? settings.enabledGroups.includes(group.id)
                      : !settings.disabledGroups.includes(group.id)
                  }
                  onChange={() => handleToggleGroup(group.id)}
                  disabled={saving}
                />
                <div className="campaign-info">
                  <div className="campaign-header">
                    <strong>{group.name}</strong>
                    <span className={`status-badge ${isActive ? 'active' : 'blocked'}`}>
                      {isActive ? '✓ Aktiv' : '✕ Blockerad'}
                    </span>
                  </div>
                  <span className="campaign-stats">
                    {group.agentCount} agenter
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      <div className="settings-summary">
        <h3>Sammanfattning</h3>
        <div className="summary-stats">
          <div className="stat">
            <span className="label">Mode:</span>
            <span className="value">{settings.mode}</span>
          </div>
          <div className="stat">
            <span className="label">Totalt groups:</span>
            <span className="value">{availableGroups.length}</span>
          </div>
          <div className="stat">
            <span className="label">
              {settings.mode === 'whitelist' ? 'Aktiva:' : 'Blockerade:'}
            </span>
            <span className="value">
              {settings.mode === 'whitelist' 
                ? settings.enabledGroups.length
                : settings.disabledGroups.length}
            </span>
          </div>
        </div>
        
        <p className="last-updated">
          Senast uppdaterad: {settings.lastUpdated 
            ? new Date(settings.lastUpdated).toLocaleString('sv-SE')
            : 'Aldrig'}
        </p>
      </div>
    </div>
  );
};

export default NotificationSettingsAdmin;
