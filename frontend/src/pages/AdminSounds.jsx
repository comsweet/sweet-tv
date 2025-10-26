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
  getAgents
} from '../services/api';
import './AdminSounds.css';

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
  const audioRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [soundsRes, settingsRes, agentsRes] = await Promise.all([
        getSounds(),
        getSoundSettings(),
        getAgents()
      ]);
      
      setSounds(soundsRes.data);
      setSettings(settingsRes.data);
      setAgents(agentsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      alert('Fel vid hämtning: ' + error.message);
    }
    setIsLoading(false);
  };

  const handleUploadSound = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validera filtyp
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg'];
    if (!allowedTypes.includes(file.type)) {
      alert('Endast MP3, WAV och OGG är tillåtna!');
      return;
    }

    // Validera storlek (2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('Filen är för stor! Max 2MB.');
      return;
    }

    // 🔥 UPDATED: Validera duration (10 sekunder) - använd HTML5 Audio API
    const audio = new Audio();
    const reader = new FileReader();

    reader.onload = (e) => {
      audio.src = e.target.result;
      audio.onloadedmetadata = async () => {
        if (audio.duration > 10) {
          alert('Ljudet är för långt! Max 10 sekunder.');
          return;
        }

        // Upload till backend
        try {
          setIsUploading(true);
          const response = await uploadSound(file);
          console.log('✅ Sound uploaded:', response.data);
          
          // Uppdatera duration i backend
          await updateSound(response.data.id, {
            duration: audio.duration
          });
          
          fetchData();
          alert('Ljud uppladdat!');
          event.target.value = ''; // Reset input
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
    
    // Check if sound is in use
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
      fetchData();
    } catch (error) {
      console.error('Error deleting sound:', error);
      alert('Fel vid borttagning: ' + error.message);
    }
  };

  const handlePlaySound = (soundUrl) => {
    if (playingSound === soundUrl) {
      // Stop
      audioRef.current?.pause();
      setPlayingSound(null);
    } else {
      // Play
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
      fetchData();
    } catch (error) {
      console.error('Error setting default sound:', error);
      alert('Fel: ' + error.message);
    }
  };

  const handleSetMilestoneSound = async (soundUrl) => {
    try {
      await updateSoundSettings({ milestoneSound: soundUrl });
      fetchData();
    } catch (error) {
      console.error('Error setting milestone sound:', error);
      alert('Fel: ' + error.message);
    }
  };

  const handleUpdateBudget = async (amount) => {
    try {
      await updateSoundSettings({ dailyBudget: parseFloat(amount) });
      fetchData();
    } catch (error) {
      console.error('Error updating budget:', error);
      alert('Fel: ' + error.message);
    }
  };

  const handleLinkAgent = async (soundId, userId) => {
    try {
      await linkAgentToSound(soundId, userId);
      fetchData();
    } catch (error) {
      console.error('Error linking agent:', error);
      alert('Fel: ' + error.message);
    }
  };

  const handleUnlinkAgent = async (soundId, userId) => {
    try {
      await unlinkAgentFromSound(soundId, userId);
      fetchData();
    } catch (error) {
      console.error('Error unlinking agent:', error);
      alert('Fel: ' + error.message);
    }
  };

  const getSoundName = (url) => {
    if (!url) return 'Inget valt';
    const sound = sounds.find(s => s.url === url);
    return sound ? sound.name : 'Okänt ljud';
  };

  if (isLoading) {
    return <div className="loading">Laddar ljud...</div>;
  }

  return (
    <div className="admin-sounds">
      <audio ref={audioRef} onEnded={handleAudioEnded} />

      {/* Upload Section */}
      <div className="sounds-upload-section">
        <h3>📤 Ladda upp nytt ljud</h3>
        {/* 🔥 UPDATED: Text ändrad till 10 sekunder */}
        <p className="upload-hint">Max 10 sekunder, MP3/WAV/OGG, max 2MB</p>
        <label className="upload-button">
          {isUploading ? '⏳ Laddar upp...' : '📁 Välj ljudfil'}
          <input
            type="file"
            accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg"
            onChange={handleUploadSound}
            disabled={isUploading}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {/* Settings Section */}
      <div className="sounds-settings-section">
        <h3>⚙️ Inställningar</h3>
        
        <div className="setting-row">
          <label>Standard pling ljud:</label>
          <select
            value={settings.defaultSound || ''}
            onChange={(e) => handleSetDefaultSound(e.target.value || null)}
          >
            <option value="">Inget valt</option>
            {sounds.map(sound => (
              <option key={sound.id} value={sound.url}>
                {sound.name}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-row">
          <label>Dagsbudget ljud 🏆:</label>
          <select
            value={settings.milestoneSound || ''}
            onChange={(e) => handleSetMilestoneSound(e.target.value || null)}
          >
            <option value="">Inget valt</option>
            {sounds.map(sound => (
              <option key={sound.id} value={sound.url}>
                {sound.name}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-row">
          <label>Dagsbudget belopp (THB):</label>
          <input
            type="number"
            min="0"
            step="100"
            value={settings.dailyBudget}
            onChange={(e) => setSettings({ ...settings, dailyBudget: e.target.value })}
            onBlur={(e) => handleUpdateBudget(e.target.value)}
          />
        </div>
      </div>

      {/* Library Section */}
      <div className="sounds-library-section">
        <h3>🎵 Ljudbibliotek ({sounds.length})</h3>
        
        {sounds.length === 0 ? (
          <div className="no-sounds">Inga ljud uppladdade än</div>
        ) : (
          <div className="sounds-list">
            {sounds.map(sound => {
              const isDefault = settings.defaultSound === sound.url;
              const isMilestone = settings.milestoneSound === sound.url;
              const isPlaying = playingSound === sound.url;
              
              return (
                <div key={sound.id} className="sound-card">
                  <div className="sound-card-header">
                    <div className="sound-info">
                      <h4>{sound.name}</h4>
                      <p className="sound-meta">
                        {sound.duration ? `${sound.duration.toFixed(1)}s` : 'Okänd längd'}
                        {isDefault && <span className="sound-badge">Standard 🔔</span>}
                        {isMilestone && <span className="sound-badge milestone">Dagsbudget 🏆</span>}
                      </p>
                    </div>
                    
                    <div className="sound-actions">
                      <button
                        onClick={() => handlePlaySound(sound.url)}
                        className={`btn-icon ${isPlaying ? 'playing' : ''}`}
                        title="Spela"
                      >
                        {isPlaying ? '⏸️' : '▶️'}
                      </button>
                      <button
                        onClick={() => handleDeleteSound(sound.id)}
                        className="btn-icon danger"
                        title="Radera"
                        disabled={isDefault || isMilestone}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  <div className="sound-card-body">
                    <p className="linked-agents-label">
                      Kopplade agenter ({sound.linkedAgents?.length || 0}):
                    </p>
                    
                    <div className="linked-agents-list">
                      {sound.linkedAgents && sound.linkedAgents.map(userId => {
                        const agent = agents.find(a => String(a.userId) === String(userId));
                        if (!agent) return null;
                        
                        return (
                          <div key={userId} className="linked-agent-chip">
                            <span>{agent.name}</span>
                            <button
                              onClick={() => handleUnlinkAgent(sound.id, userId)}
                              className="unlink-btn"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="add-agent-section">
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleLinkAgent(sound.id, e.target.value);
                            e.target.value = '';
                          }
                        }}
                        className="add-agent-select"
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSounds;
