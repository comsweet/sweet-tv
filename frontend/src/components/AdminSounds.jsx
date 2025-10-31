import { useState, useEffect, useRef } from 'react';
import {
  getSoundSettings,
  updateSoundSettings,
  getSounds,
  uploadSound,
  deleteSound,
  updateSound,
  linkAgentToSound,
  unlinkAgentFromSound,
  getAgents,
  getAdversusUsers
} from '../services/api';
import './AdminSounds.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const AdminSounds = () => {
  const [sounds, setSounds] = useState([]);
  const [settings, setSettings] = useState({
    defaultSound: null,
    milestoneSound: null,
    dailyBudget: 3400
  });
  const [agents, setAgents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [playingSound, setPlayingSound] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const audioRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [soundsRes, settingsRes, adversusRes, localAgentsRes] = await Promise.all([
        getSounds(),
        getSoundSettings(),
        getAdversusUsers(),
        getAgents()
      ]);

      const adversusUsersList = adversusRes.data.users || [];
      const localAgents = localAgentsRes.data;

      const combinedAgents = adversusUsersList.map(user => {
        const localAgent = localAgents.find(a => String(a.userId) === String(user.id));
        return {
          userId: user.id,
          name: user.name || `${user.firstname || ''} ${user.lastname || ''}`.trim() || `User ${user.id}`,
          email: user.email || '',
          profileImage: localAgent?.profileImage || null
        };
      });

      setSounds(soundsRes.data);
      setSettings(settingsRes.data);
      setAgents(combinedAgents);
    } catch (error) {
      console.error('Error fetching data:', error);
      alert('Fel vid hämtning: ' + error.message);
    }
    setIsLoading(false);
  };

  const toggleRow = (soundId) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(soundId)) {
        newSet.delete(soundId);
      } else {
        newSet.add(soundId);
      }
      return newSet;
    });
  };

  const handleUploadSound = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg'];
    if (!allowedTypes.includes(file.type)) {
      alert('Endast MP3, WAV och OGG är tillåtna!');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('Filen är för stor! Max 2MB.');
      return;
    }

    const audio = new Audio();
    const reader = new FileReader();

    reader.onload = (e) => {
      audio.src = e.target.result;
      audio.onloadedmetadata = async () => {
        if (audio.duration > 10) {
          alert('Ljudet är för långt! Max 10 sekunder.');
          return;
        }

        try {
          setIsUploading(true);
          const response = await uploadSound(file);
          console.log('✅ Sound uploaded:', response.data);

          await updateSound(response.data.id, {
            duration: audio.duration
          });

          fetchData();
          alert('Ljud uppladdat!');
          event.target.value = '';
        } catch (error) {
          console.error('Error uploading sound:', error);
          alert('Fel vid uppladdning: ' + error.message);
        }
        setIsUploading(false);
      };
    };

    reader.readAsDataURL(file);
  };

  const handleDeleteSound = async (soundId) => {
    const sound = sounds.find(s => s.id === soundId);

    const isDefaultSound = settings.defaultSound === sound.url;
    const isMilestoneSound = settings.milestoneSound === sound.url;
    const hasLinkedAgents = sound.linkedAgents && sound.linkedAgents.length > 0;

    if (isDefaultSound || isMilestoneSound) {
      alert('Kan inte radera ljud som används som standard eller dagsbudget-ljud!');
      return;
    }

    if (hasLinkedAgents) {
      if (!confirm(`Detta ljud används av ${sound.linkedAgents.length} agent(er). Ta bort ändå?`)) {
        return;
      }
    }

    if (!confirm('Är du säker på att du vill radera detta ljud?')) return;

    try {
      await deleteSound(soundId);
      setSounds(prevSounds => prevSounds.filter(s => s.id !== soundId));
    } catch (error) {
      console.error('Error deleting sound:', error);
      alert('Fel vid borttagning: ' + error.message);
    }
  };

  const handlePlaySound = (soundUrl) => {
    if (playingSound === soundUrl) {
      audioRef.current?.pause();
      setPlayingSound(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = soundUrl;
        audioRef.current.play();
        setPlayingSound(soundUrl);
      }
    }
  };

  const handleAudioEnded = () => {
    setPlayingSound(null);
  };

  const handleSetDefaultSound = async (soundUrl) => {
    try {
      await updateSoundSettings({ defaultSound: soundUrl });
      setSettings(prev => ({ ...prev, defaultSound: soundUrl }));
    } catch (error) {
      console.error('Error setting default sound:', error);
      alert('Fel: ' + error.message);
    }
  };

  const handleSetMilestoneSound = async (soundUrl) => {
    try {
      await updateSoundSettings({ milestoneSound: soundUrl });
      setSettings(prev => ({ ...prev, milestoneSound: soundUrl }));
    } catch (error) {
      console.error('Error setting milestone sound:', error);
      alert('Fel: ' + error.message);
    }
  };

  const handleUpdateBudget = async (amount) => {
    try {
      await updateSoundSettings({ dailyBudget: parseFloat(amount) });
      setSettings(prev => ({ ...prev, dailyBudget: parseFloat(amount) }));
    } catch (error) {
      console.error('Error updating budget:', error);
      alert('Fel: ' + error.message);
    }
  };

  // ⚡ INLINE UPDATE: No page reload!
  const handleLinkAgent = async (soundId, userId) => {
    try {
      await linkAgentToSound(soundId, userId);

      // Update state inline instead of fetchData()
      setSounds(prevSounds => prevSounds.map(sound => {
        if (sound.id === soundId) {
          return {
            ...sound,
            linkedAgents: [...(sound.linkedAgents || []), userId]
          };
        }
        return sound;
      }));

      console.log('✅ Agent linked without page reload');
    } catch (error) {
      console.error('Error linking agent:', error);
      alert('Fel: ' + error.message);
    }
  };

  // ⚡ INLINE UPDATE: No page reload!
  const handleUnlinkAgent = async (soundId, userId) => {
    try {
      await unlinkAgentFromSound(soundId, userId);

      // Update state inline instead of fetchData()
      setSounds(prevSounds => prevSounds.map(sound => {
        if (sound.id === soundId) {
          return {
            ...sound,
            linkedAgents: (sound.linkedAgents || []).filter(id => id !== userId)
          };
        }
        return sound;
      }));

      console.log('✅ Agent unlinked without page reload');
    } catch (error) {
      console.error('Error unlinking agent:', error);
      alert('Fel: ' + error.message);
    }
  };

  const handleForceCleanup = async () => {
    if (!confirm('⚠️ FORCE CLEANUP\n\nDetta kommer att:\n1. Rensa alla ogiltiga länkar i soundLibrary.json\n2. Rensa alla orphaned customSounds i agents.json\n\nÄr du säker?')) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/sounds/force-cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Server returned ${response.status}: ${response.statusText} - Not JSON!`);
      }

      const data = await response.json();

      if (response.ok && data.success) {
        alert(
          `✅ FORCE CLEANUP KLAR!\n\n` +
          `Ljud rensade: ${data.soundsCleaned}\n` +
          `Ogiltiga länkar borttagna: ${data.totalRemovedLinks}\n` +
          `Agenter rensade: ${data.agentsCleaned}\n\n` +
          `Totalt kontrollerade:\n` +
          `- ${data.details.soundsChecked} ljud\n` +
          `- ${data.details.agentsChecked} agenter`
        );
        fetchData();
      } else {
        throw new Error(data.error || 'Force cleanup failed');
      }
    } catch (error) {
      console.error('❌ Error during force cleanup:', error);
      alert(`FORCE CLEANUP MISSLYCKADES: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="loading">Laddar ljud...</div>;
  }

  return (
    <div className="admin-sounds-compact">
      <audio ref={audioRef} onEnded={handleAudioEnded} />

      {/* Settings Section - Compact */}
      <div className="sounds-header-section">
        <div className="header-row">
          <div className="upload-area">
            <label className="upload-button-compact">
              {isUploading ? '⏳ Laddar upp...' : '📁 Ladda upp ljud'}
              <input
                type="file"
                accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg"
                onChange={handleUploadSound}
                disabled={isUploading}
                style={{ display: 'none' }}
              />
            </label>
            <span className="upload-hint">Max 10s, MP3/WAV/OGG, max 2MB</span>
          </div>

          <div className="settings-inline">
            <div className="setting-item">
              <label>🔔 Standard:</label>
              <select
                value={settings.defaultSound || ''}
                onChange={(e) => handleSetDefaultSound(e.target.value || null)}
              >
                <option value="">Inget valt</option>
                {sounds.map(sound => (
                  <option key={sound.id} value={sound.url}>{sound.name}</option>
                ))}
              </select>
            </div>

            <div className="setting-item">
              <label>🏆 Dagsbudget:</label>
              <select
                value={settings.milestoneSound || ''}
                onChange={(e) => handleSetMilestoneSound(e.target.value || null)}
              >
                <option value="">Inget valt</option>
                {sounds.map(sound => (
                  <option key={sound.id} value={sound.url}>{sound.name}</option>
                ))}
              </select>
            </div>

            <div className="setting-item">
              <label>💰 Belopp:</label>
              <input
                type="number"
                min="0"
                step="100"
                value={settings.dailyBudget}
                onChange={(e) => setSettings({ ...settings, dailyBudget: e.target.value })}
                onBlur={(e) => handleUpdateBudget(e.target.value)}
                style={{ width: '100px' }}
              />
              <span>THB</span>
            </div>

            <button
              onClick={handleForceCleanup}
              className="btn-cleanup"
              disabled={isLoading}
              title="Rensa ogiltiga ljudkopplingar"
            >
              🧹 Cleanup
            </button>
          </div>
        </div>
      </div>

      {/* Table Section - Compact */}
      <div className="sounds-table-section">
        <h3>🎵 Ljudbibliotek ({sounds.length})</h3>

        {sounds.length === 0 ? (
          <div className="no-sounds">Inga ljud uppladdade än</div>
        ) : (
          <table className="sounds-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th>Namn</th>
                <th style={{ width: '80px' }}>Längd</th>
                <th style={{ width: '100px' }}>Typ</th>
                <th style={{ width: '100px' }}>Agenter</th>
                <th style={{ width: '120px' }}>Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              {sounds.map(sound => {
                const isDefault = settings.defaultSound === sound.url;
                const isMilestone = settings.milestoneSound === sound.url;
                const isPlaying = playingSound === sound.url;
                const isExpanded = expandedRows.has(sound.id);
                const linkedCount = sound.linkedAgents?.length || 0;

                return (
                  <>
                    <tr key={sound.id} className="sound-row">
                      <td>
                        <button
                          onClick={() => toggleRow(sound.id)}
                          className="btn-expand"
                          title={isExpanded ? 'Dölj agenter' : 'Visa agenter'}
                        >
                          {isExpanded ? '▼' : '▶'}
                        </button>
                      </td>
                      <td className="sound-name">
                        <strong>{sound.name}</strong>
                      </td>
                      <td className="sound-duration">
                        {sound.duration ? `${sound.duration.toFixed(1)}s` : '-'}
                      </td>
                      <td className="sound-badges">
                        {isDefault && <span className="badge badge-default">🔔</span>}
                        {isMilestone && <span className="badge badge-milestone">🏆</span>}
                        {!isDefault && !isMilestone && <span className="badge badge-none">-</span>}
                      </td>
                      <td className="sound-agents">
                        <span className="agent-count">{linkedCount}</span>
                      </td>
                      <td className="sound-actions">
                        <button
                          onClick={() => handlePlaySound(sound.url)}
                          className={`btn-icon-small ${isPlaying ? 'playing' : ''}`}
                          title="Spela"
                        >
                          {isPlaying ? '⏸️' : '▶️'}
                        </button>
                        <button
                          onClick={() => handleDeleteSound(sound.id)}
                          className="btn-icon-small danger"
                          title="Radera"
                          disabled={isDefault || isMilestone}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="agent-details-row">
                        <td></td>
                        <td colSpan="5">
                          <div className="agent-management">
                            <div className="linked-agents-container">
                              <strong>Kopplade agenter:</strong>
                              <div className="agent-chips">
                                {linkedCount === 0 ? (
                                  <span className="no-agents">Inga agenter kopplade</span>
                                ) : (
                                  sound.linkedAgents.map(userId => {
                                    const agent = agents.find(a => String(a.userId) === String(userId));
                                    if (!agent) return null;

                                    return (
                                      <div key={userId} className="agent-chip">
                                        <span>{agent.name}</span>
                                        <button
                                          onClick={() => handleUnlinkAgent(sound.id, userId)}
                                          className="chip-remove"
                                          title="Ta bort"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>

                            <div className="add-agent-container">
                              <select
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handleLinkAgent(sound.id, e.target.value);
                                    e.target.value = '';
                                  }
                                }}
                                className="agent-select-compact"
                              >
                                <option value="">+ Lägg till agent</option>
                                {agents
                                  .filter(agent => !sound.linkedAgents?.includes(agent.userId))
                                  .map(agent => (
                                    <option key={agent.userId} value={agent.userId}>
                                      {agent.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminSounds;
