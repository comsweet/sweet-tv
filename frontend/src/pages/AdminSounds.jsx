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

// 🔥 FIX: Använd samma API base URL som resten av appen
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
      fetchData();
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

  // 🧪 TEST FUNKTION
  const handleTestRouting = async () => {
    if (!confirm('DETTA ÄR EN TEST - Klicka OK för att testa routing')) {
      return;
    }
    
    setIsLoading(true);
    try {
      console.log('🧪 Calling TEST API...');
      console.log('🔗 API Base URL:', API_BASE_URL);
      
      const testUrl = `${API_BASE_URL}/sounds/test-simple`;
      console.log('🎯 Test URL:', testUrl);
      
      const response = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('📡 Response status:', response.status);
      
      const contentType = response.headers.get('content-type');
      console.log('📡 Content-Type:', contentType);
      
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Server returned ${response.status}: ${response.statusText} - Not JSON!`);
      }
      
      const data = await response.json();
      console.log('📦 Response data:', data);
      
      if (response.ok && data.success) {
        alert(`✅ TEST LYCKADES!\n\n${data.message}\n\nRouting fungerar!\n\nNu kan du använda cleanup-funktionen.`);
      } else {
        throw new Error(data.error || 'Test failed');
      }
    } catch (error) {
      console.error('❌ Error during test:', error);
      alert(`TEST MISSLYCKADES: ${error.message}\n\nKolla browser console och server logs.`);
    } finally {
      setIsLoading(false);
    }
  };

  // 🧹 CLEANUP FUNKTION (gammal version - rensar bara agents.json)
  const handleCleanupOrphanedReferences = async () => {
    if (!confirm('Detta kommer att rensa gamla ljudkopplingar i agents.json som inte längre är aktiva. Fortsätt?')) {
      return;
    }
    
    setIsLoading(true);
    try {
      console.log('🧹 Starting cleanup...');
      
      const cleanupUrl = `${API_BASE_URL}/sounds/cleanup`;
      console.log('🎯 Cleanup URL:', cleanupUrl);
      
      const response = await fetch(cleanupUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const contentType = response.headers.get('content-type');
      
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Server returned ${response.status}: ${response.statusText} - Not JSON!`);
      }
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        alert(`✅ CLEANUP KLAR!\n\n${data.message}\n\nKontrollerade: ${data.checkedCount} agenter\nRensade: ${data.cleanedCount} gamla kopplingar`);
        fetchData();
      } else {
        throw new Error(data.error || 'Cleanup failed');
      }
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
      alert(`CLEANUP MISSLYCKADES: ${error.message}\n\nKolla browser console och server logs.`);
    } finally {
      setIsLoading(false);
    }
  };

  // 🔥 NYA: FORCE CLEANUP - Synkroniserar soundLibrary.json och agents.json
  const handleForceCleanup = async () => {
    if (!confirm('⚠️ FORCE CLEANUP\n\nDetta kommer att:\n1. Rensa alla ogiltiga länkar i soundLibrary.json\n2. Rensa alla orphaned customSounds i agents.json\n\nÄr du säker?')) {
      return;
    }
    
    setIsLoading(true);
    try {
      console.log('🧹 Starting FORCE cleanup...');
      
      const cleanupUrl = `${API_BASE_URL}/sounds/force-cleanup`;
      console.log('🎯 Force Cleanup URL:', cleanupUrl);
      
      const response = await fetch(cleanupUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
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
      alert(`FORCE CLEANUP MISSLYCKADES: ${error.message}\n\nKolla browser console och server logs.`);
    } finally {
      setIsLoading(false);
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

      {/* 🔥 UPPDATERAD: CLEANUP SEKTION MED FORCE CLEANUP */}
      <div className="sounds-cleanup-section">
        <h3>🧹 RENSA LJUDKOPPLINGAR</h3>
        
        {/* FORCE CLEANUP - NY! */}
        <div className="cleanup-box force-cleanup">
          <h4>🔥 FORCE CLEANUP (Rekommenderad)</h4>
          <p className="cleanup-hint">
            <strong>Synkroniserar soundLibrary.json och agents.json</strong><br/>
            • Tar bort ogiltiga länkar från ljudfiler<br/>
            • Rensar orphaned customSounds från agenter<br/>
            • Fixar alla inkonsistenser mellan filerna
          </p>
          <button 
            onClick={handleForceCleanup}
            className="btn-danger"
            disabled={isLoading}
            style={{ fontWeight: 'bold' }}
          >
            {isLoading ? 'Rensar...' : '🔥 Kör FORCE CLEANUP'}
          </button>
        </div>
        
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #ddd' }}>
          {/* VANLIG CLEANUP - GAMMAL */}
          <div className="cleanup-box">
            <h4>🧹 Vanlig Cleanup</h4>
            <p className="cleanup-hint">
              Rensar endast agents.json (gamla funktionen)
            </p>
            <button 
              onClick={handleCleanupOrphanedReferences}
              className="btn-warning"
              disabled={isLoading}
            >
              {isLoading ? 'Rensar...' : '🧹 Kör vanlig cleanup'}
            </button>
          </div>
        </div>
        
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #ddd' }}>
          {/* TEST ROUTING */}
          <div className="cleanup-box">
            <h4>🧪 Test Routing</h4>
            <p className="cleanup-hint">
              Testa om routing fungerar (gör ingen cleanup)
            </p>
            <button 
              onClick={handleTestRouting}
              className="btn-secondary"
              disabled={isLoading}
            >
              {isLoading ? 'Testar...' : '🧪 Testa routing'}
            </button>
          </div>
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
