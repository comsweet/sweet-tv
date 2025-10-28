// frontend/src/components/LeaderboardContainer.jsx
// Komplett komponent som använder DualLeaderboardSlide med nya backend-API:et

import { useState, useEffect } from 'react';
import DualLeaderboardSlide from './DualLeaderboardSlide';
import { syncDeals, syncSMS, getLeaderboard, formatLeaderboardForSlide } from '../services/leaderboardService';

const LeaderboardContainer = () => {
  const [todayData, setTodayData] = useState(null);
  const [monthData, setMonthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [agentsMap, setAgentsMap] = useState({});
  const [isInitialized, setIsInitialized] = useState(false);

  // ====================================
  // 1. HÄMTA AGENTS-INFO VID START
  // ====================================
  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      // 🔥 ANPASSA DENNA URL till din befintliga agents-endpoint
      const response = await fetch('http://localhost:5000/api/agents');
      
      if (!response.ok) {
        throw new Error('Kunde inte hämta agents');
      }

      const agents = await response.json();
      console.log('📥 Agents från API:', agents);
      
      // Skapa en map: userId -> agent info
      const map = {};
      
      // 🔥 ANPASSA DETTA beroende på hur din agents-API returnerar data
      // Om det är en array:
      if (Array.isArray(agents)) {
        agents.forEach(agent => {
          map[agent.userId || agent.id] = {
            id: agent.userId || agent.id,
            name: agent.name || agent.fullName || `Agent ${agent.userId || agent.id}`,
            profileImage: agent.profileImage 
              ? `http://localhost:5000${agent.profileImage}` 
              : null
          };
        });
      } 
      // Om det är ett objekt med agents property:
      else if (agents.agents && Array.isArray(agents.agents)) {
        agents.agents.forEach(agent => {
          map[agent.userId || agent.id] = {
            id: agent.userId || agent.id,
            name: agent.name || agent.fullName || `Agent ${agent.userId || agent.id}`,
            profileImage: agent.profileImage 
              ? `http://localhost:5000${agent.profileImage}` 
              : null
          };
        });
      }
      
      console.log('✅ Agents map skapad:', map);
      setAgentsMap(map);
      
    } catch (error) {
      console.error('❌ Kunde inte hämta agents:', error);
      // Fortsätt ändå med tom agents-map
      setAgentsMap({});
    }
  };

  // ====================================
  // 2. INITIAL SYNKNING OCH DATAHÄMTNING
  // ====================================
  useEffect(() => {
    // Vänta tills agents är laddade (eller försöket misslyckades)
    if (Object.keys(agentsMap).length === 0 && !isInitialized) {
      // Vänta lite till för agents att ladda
      const timeout = setTimeout(() => {
        if (Object.keys(agentsMap).length === 0) {
          console.log('⚠️ Fortsätter utan agents-info');
          initializeLeaderboards();
        }
      }, 2000);
      return () => clearTimeout(timeout);
    }

    if (Object.keys(agentsMap).length > 0 && !isInitialized) {
      initializeLeaderboards();
    }
  }, [agentsMap, isInitialized]);

  const initializeLeaderboards = async () => {
    try {
      setLoading(true);
      setError(null);
      setIsInitialized(true);

      console.log('🔄 Synkar data från Adversus...');
      
      // Synka deals och SMS från Adversus
      await syncDeals();
      await syncSMS();
      
      console.log('📊 Hämtar leaderboards...');
      
      // Hämta både dagens och månadens leaderboards
      const [todayResponse, monthResponse] = await Promise.all([
        getLeaderboard('today'),
        getLeaderboard('month')
      ]);

      console.log('📈 Today response:', todayResponse);
      console.log('📈 Month response:', monthResponse);

      // Formatera för DualLeaderboardSlide
      const todayFormatted = formatLeaderboardForSlide(
        todayResponse,
        agentsMap,
        'Dagens Topplista',
        'day'
      );

      const monthFormatted = formatLeaderboardForSlide(
        monthResponse,
        agentsMap,
        'Månadens Topplista',
        'month'
      );

      console.log('✅ Formaterad today data:', todayFormatted);
      console.log('✅ Formaterad month data:', monthFormatted);

      setTodayData(todayFormatted);
      setMonthData(monthFormatted);
      
      console.log('🎉 Data redo för visning!');
      
    } catch (err) {
      console.error('❌ Fel vid initialisering:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ====================================
  // 3. AUTO-REFRESH VARJE 5 MINUTER
  // ====================================
  useEffect(() => {
    if (!isInitialized) return;

    const refreshInterval = setInterval(async () => {
      console.log('🔄 Auto-refresh av data...');
      
      try {
        // Synka om data
        await syncDeals();
        await syncSMS();
        
        // Hämta nya leaderboards
        const [todayResponse, monthResponse] = await Promise.all([
          getLeaderboard('today'),
          getLeaderboard('month')
        ]);

        // Formatera för DualLeaderboardSlide
        const todayFormatted = formatLeaderboardForSlide(
          todayResponse,
          agentsMap,
          'Dagens Topplista',
          'day'
        );

        const monthFormatted = formatLeaderboardForSlide(
          monthResponse,
          agentsMap,
          'Månadens Topplista',
          'month'
        );

        setTodayData(todayFormatted);
        setMonthData(monthFormatted);
        
        console.log('✅ Data auto-uppdaterad!');
      } catch (error) {
        console.error('❌ Auto-refresh misslyckades:', error);
      }
    }, 5 * 60 * 1000); // 5 minuter

    return () => clearInterval(refreshInterval);
  }, [agentsMap, isInitialized]);

  // ====================================
  // 4. MANUELL REFRESH-FUNKTION
  // ====================================
  const handleManualRefresh = async () => {
    console.log('🔄 Manuell refresh...');
    setLoading(true);
    setError(null);
    
    try {
      await initializeLeaderboards();
      console.log('✅ Manuell refresh klar!');
    } catch (err) {
      console.error('❌ Manuell refresh misslyckades:', err);
      setError(err.message);
    }
  };

  // ====================================
  // 5. RENDER
  // ====================================

  // Loading state
  if (loading && !todayData && !monthData) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
        <div style={{ fontSize: '1.5rem' }}>Laddar leaderboards...</div>
        <div style={{ fontSize: '1rem', marginTop: '0.5rem', opacity: 0.8 }}>
          Synkar data från Adversus
        </div>
      </div>
    );
  }

  // Error state
  if (error && !todayData && !monthData) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
        <div style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Fel vid laddning</div>
        <div style={{ fontSize: '1rem', marginBottom: '2rem', opacity: 0.8 }}>
          {error}
        </div>
        <button
          onClick={handleManualRefresh}
          style={{
            padding: '1rem 2rem',
            fontSize: '1rem',
            background: 'white',
            color: '#667eea',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          🔄 Försök igen
        </button>
      </div>
    );
  }

  // No data state
  if (!todayData || !monthData) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
        <div style={{ fontSize: '1.5rem' }}>Ingen data tillgänglig</div>
        <button
          onClick={handleManualRefresh}
          style={{
            padding: '1rem 2rem',
            fontSize: '1rem',
            background: 'white',
            color: '#667eea',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            marginTop: '2rem'
          }}
        >
          🔄 Ladda data
        </button>
      </div>
    );
  }

  // Success - visa DualLeaderboardSlide
  return (
    <div style={{ 
      position: 'relative', 
      width: '100%', 
      height: '100vh', 
      overflow: 'hidden',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      {/* Refresh-knapp i hörnet (valfritt) */}
      <button
        onClick={handleManualRefresh}
        disabled={loading}
        style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          zIndex: 1000,
          padding: '0.5rem 1rem',
          background: 'rgba(255, 255, 255, 0.9)',
          border: 'none',
          borderRadius: '8px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '0.9rem',
          fontWeight: 'bold',
          color: '#667eea',
          opacity: loading ? 0.5 : 1,
          transition: 'all 0.3s'
        }}
      >
        {loading ? '⏳ Uppdaterar...' : '🔄 Uppdatera'}
      </button>

      {/* Visa DualLeaderboardSlide */}
      <DualLeaderboardSlide
        leftLeaderboard={todayData.leaderboard}
        rightLeaderboard={monthData.leaderboard}
        leftStats={todayData.stats}
        rightStats={monthData.stats}
        isActive={true}
      />
    </div>
  );
};

export default LeaderboardContainer;
