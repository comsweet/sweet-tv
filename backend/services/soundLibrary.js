const fs = require('fs').promises;
const path = require('path');

/**
 * SOUND LIBRARY SERVICE
 * 
 * Manages all uploaded sounds and their agent linkages.
 * 🔥 FIXED: När en agent kopplas bort från ett ljud, rensas automatiskt även agents.json
 */
class SoundLibraryService {
  constructor() {
    const isRender = process.env.RENDER === 'true';
    
    this.dbPath = isRender 
      ? '/var/data'
      : path.join(__dirname, '../data');
    
    this.libraryFile = path.join(this.dbPath, 'soundLibrary.json');
    
    console.log(`🎵 Sound library path: ${this.dbPath}`);
    
    this.initDatabase();
  }

  async initDatabase() {
    try {
      await fs.mkdir(this.dbPath, { recursive: true });

      try {
        await fs.access(this.libraryFile);
        console.log('✅ soundLibrary.json exists');
      } catch {
        await fs.writeFile(this.libraryFile, JSON.stringify({ sounds: [] }, null, 2));
        console.log('📝 Created soundLibrary.json');
      }
    } catch (error) {
      console.error('Error initializing sound library:', error);
    }
  }

  async getSounds() {
    try {
      const data = await fs.readFile(this.libraryFile, 'utf8');
      return JSON.parse(data).sounds;
    } catch (error) {
      console.error('Error reading sound library:', error);
      return [];
    }
  }

  async getSound(id) {
    const sounds = await this.getSounds();
    return sounds.find(s => s.id === id);
  }

  async addSound(soundData) {
    try {
      const sounds = await this.getSounds();
      
      const newSound = {
        id: Date.now().toString(),
        name: soundData.name,
        url: soundData.url,
        duration: soundData.duration || null,
        linkedAgents: [],
        uploadedAt: new Date().toISOString()
      };
      
      sounds.push(newSound);
      await fs.writeFile(this.libraryFile, JSON.stringify({ sounds }, null, 2));
      console.log(`🎵 Added sound: ${newSound.name}`);
      return newSound;
    } catch (error) {
      console.error('Error adding sound:', error);
      throw error;
    }
  }

  async deleteSound(id) {
    try {
      const sounds = await this.getSounds();
      const filtered = sounds.filter(s => s.id !== id);
      await fs.writeFile(this.libraryFile, JSON.stringify({ sounds: filtered }, null, 2));
      console.log(`🗑️ Deleted sound: ${id}`);
      return true;
    } catch (error) {
      console.error('Error deleting sound:', error);
      throw error;
    }
  }

  async linkAgent(soundId, userId) {
    try {
      const sounds = await this.getSounds();
      const sound = sounds.find(s => s.id === soundId);
      
      if (!sound) {
        throw new Error('Sound not found');
      }
      
      // Normalize userId to number
      const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
      
      if (!sound.linkedAgents.includes(userIdNum)) {
        sound.linkedAgents.push(userIdNum);
        await fs.writeFile(this.libraryFile, JSON.stringify({ sounds }, null, 2));
        console.log(`🔗 Linked agent ${userIdNum} to sound ${soundId}`);
      } else {
        console.log(`ℹ️  Agent ${userIdNum} already linked to sound ${soundId}`);
      }
      
      return sound;
    } catch (error) {
      console.error('Error linking agent:', error);
      throw error;
    }
  }

  async unlinkAgent(soundId, userId) {
    try {
      const sounds = await this.getSounds();
      const sound = sounds.find(s => s.id === soundId);
      
      if (!sound) {
        throw new Error('Sound not found');
      }
      
      // Normalize userId to number
      const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
      
      // Ta bort från ljudets linkedAgents array
      sound.linkedAgents = sound.linkedAgents.filter(id => {
        const normalizedId = typeof id === 'string' ? parseInt(id, 10) : id;
        return normalizedId !== userIdNum;
      });
      
      await fs.writeFile(this.libraryFile, JSON.stringify({ sounds }, null, 2));
      console.log(`🔓 Unlinked agent ${userIdNum} from sound ${soundId}`);
      
      // 🔥 FIX: Rensa också agents.json om agenten inte har några andra ljudkopplingar
      try {
        const database = require('./database');
        
        // Kolla om agenten har andra aktiva ljudkopplingar
        const hasOtherSoundLinks = sounds.some(s => 
          s.id !== soundId && s.linkedAgents.some(linkedId => {
            const normalizedLinkedId = typeof linkedId === 'string' ? parseInt(linkedId, 10) : linkedId;
            return normalizedLinkedId === userIdNum;
          })
        );
        
        // Om INGA andra kopplingar finns, rensa customSound från agents.json
        if (!hasOtherSoundLinks) {
          const agent = await database.getAgent(userIdNum);
          if (agent) {
            await database.updateAgent(userIdNum, {
              customSound: null,
              preferCustomSound: false
            });
            console.log(`🧹 Cleaned up agent ${userIdNum} sound preferences (no other links)`);
          }
        } else {
          console.log(`ℹ️  Agent ${userIdNum} still has other sound links`);
        }
      } catch (dbError) {
        console.warn(`⚠️  Could not clean up agent data:`, dbError.message);
        // Fortsätt ändå - ljudkopplingen är borttagen från soundLibrary.json
      }
      
      return sound;
    } catch (error) {
      console.error('Error unlinking agent:', error);
      throw error;
    }
  }

  async getSoundForAgent(userId) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    
    const sounds = await this.getSounds();
    return sounds.find(s => {
      return s.linkedAgents.some(linkedId => {
        const normalizedLinkedId = typeof linkedId === 'string' ? parseInt(linkedId, 10) : linkedId;
        return normalizedLinkedId === userIdNum;
      });
    });
  }

  async updateSound(id, updates) {
    try {
      const sounds = await this.getSounds();
      const index = sounds.findIndex(s => s.id === id);
      
      if (index !== -1) {
        sounds[index] = {
          ...sounds[index],
          ...updates
        };
        await fs.writeFile(this.libraryFile, JSON.stringify({ sounds }, null, 2));
        console.log(`💾 Updated sound: ${id}`);
        return sounds[index];
      }
      return null;
    } catch (error) {
      console.error('Error updating sound:', error);
      throw error;
    }
  }
}

module.exports = new SoundLibraryService();
