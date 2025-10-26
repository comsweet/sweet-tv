import { useState, useEffect, useRef } from 'react';
import socketService from '../services/socket';
import { getActiveLeaderboards, getLeaderboardStats2 } from '../services/api';
import DealNotification from '../components/DealNotification.jsx';
import '../components/DealNotification.css';
import './Display.css';

const LeaderboardCard = ({ leaderboard, stats }) => {
  const getTimePeriodLabel = (period) => {
    const labels = {
      day: 'Idag',
      week: 'Denna vecka',
      month: 'Denna månad',
      custom: 'Anpassat'
    };
    return labels[period] || period;
  };

  return (
    <div className="leaderboard-card-display">
      <div className="leaderboard-header">
        <h2>{leaderboard.name}</h2>
        <p className="leaderboard-period">{getTimePeriodLabel(leaderboard.timePeriod)}</p>
      </div>

      {stats.length === 0 ? (
        <div className="no-data-display">Inga affärer än</div>
      ) : (
        <div className="leaderboard-items">
          {stats.slice(0, 10).map((item, index) => {
            const isZeroDeals = item.dealCount === 0;
            
            return (
              <div 
                key={item.userId} 
                className={`leaderboard-item-display ${index === 0 && !isZeroDeals ? 'first-place' : ''} ${isZeroDeals ? 'zero-deals' : ''}`}
              >
                {/* Rank */}
                <div className="rank-display">
                  {index === 0 && !isZeroDeals && '🥇'}
                  {index === 1 && !isZeroDeals && '🥈'}
                  {index === 2 && !isZeroDeals && '🥉'}
                  {(index > 2 || isZeroDeals) && `#${index + 1}`}
                </div>
                
                {/* Avatar */}
                {item.agent.profileImage ? (
                  <img 
                    src={item.agent.profileImage} 
                    alt={item.agent.name}
                    className="agent-avatar-display"
                  />
                ) : (
                  <div className="agent-avatar-placeholder-display">
                    {item.agent.name?.charAt(0) || '?'}
                  </div>
                )}
                
                {/* Name */}
                <div className="agent-info-display">
                  <h3 className="agent-name-display">{item.agent.name}</h3>
                </div>
                
                {/* 🔥 NEW: Deals column with dart emoji */}
                <div className={`deals-column-display ${isZeroDeals ? 'zero' : ''}`}>
                  <span className="emoji">🎯</span>
                  <span>{item.dealCount} affärer</span>
                </div>
                
                {/* 🔥 UPDATED: Commission with red color for zero */}
                <div className={`commission-display ${isZeroDeals ? 'zero' : ''}`}>
                  {item.totalCommission.toLocaleString('sv-SE')} THB
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const Display = () => {
  const [leaderboardsData, setLeaderboardsData] = useState([]);
  const [currentNotification, setCurrentNotification] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });
  const refreshIntervalRef = useRef(null);

  // Fetch leaderboards med silent mode
  const fetchLeaderboards = async (silent = false) => {
    try {
      if (!silent) {
        setIsLoading(true);
      }
      
      // Steg 1: Hämta aktiva leaderboards
      const response = await getActiveLeaderboards();
      const activeLeaderboards = response.data;
      
      if (!silent) {
        console.log(`📊 Fetching stats for ${activeLeaderboards.length} leaderboards SEQUENTIALLY...`);
        setLoadingProgress({ current: 0, total: activeLeaderboards.length });
      } else {
        console.log(`🔄 Silent refresh: Updating ${activeLeaderboards.length} leaderboards...`);
      }
      
      const leaderboardsWithStats = [];
      
      // Steg 2: Hämta stats EN leaderboard i taget
      for (let i = 0; i < activeLeaderboards.length; i++) {
        const lb = activeLeaderboards[i];
        
        if (!silent) {
          setLoadingProgress({ current: i + 1, total: activeLeaderboards.length });
          console.log(`📈 Loading leaderboard ${i + 1}/${activeLeaderboards.length}: "${lb.name}"`);
        }
        
        try {
          const statsResponse = await getLeaderboardStats2(lb.id);
          leaderboardsWithStats.push({
            leaderboard: lb,
            stats: statsResponse.data.stats || []
          });
          
          if (!silent) {
            console.log(`✅ Loaded "${lb.name}" (${statsResponse.data.stats?.length || 0} agents)`);
          }
          
          // Delay mellan varje leaderboard
          if (i < activeLeaderboards.length - 1) {
            if (!silent) {
              console.log('⏳ Waiting 2s before next leaderboard...');
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
        } catch (error) {
          console.error(`❌ Error loading "${lb.name}":`, error);
          leaderboardsWithStats.push({
            leaderboard: lb,
            stats: []
          });
        }
      }
      
      if (!silent) {
        console.log(`✅ All ${leaderboardsWithStats.length} leaderboards loaded!`);
      } else {
        console.log(`🔄 Silent refresh: Updated ${leaderboardsWithStats.length} leaderboards`);
      }
      
      setLeaderboardsData(leaderboardsWithStats);
      setIsLoading(false);
      
    } catch (error) {
      console.error('❌ Error fetching leaderboards:', error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchLeaderboards();
    
    // AUTOMATIC REFRESH var 2:e minut (background update)
    refreshIntervalRef.current = setInterval(() => {
      console.log('🔄 Auto-refresh: Updating leaderboard data...');
      fetchLeaderboards(true); // silent = true (no loading screen)
    }, 2 * 60 * 1000); // 2 minuter

    socketService.connect();

    const handleNewDeal = (notification) => {
      console.log('🎉 New deal received:', notification);
      setCurrentNotification(notification);
      
      // IMMEDIATE BACKGROUND UPDATE efter notification
      setTimeout(() => {
        console.log('🔄 Deal received: Refreshing leaderboard data...');
        fetchLeaderboards(true);
      }, 5000);
    };

    socketService.onNewDeal(handleNewDeal);

    return () => {
      socketService.offNewDeal(handleNewDeal);
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  const handleNotificationComplete = () => {
    setCurrentNotification(null);
  };

  const getGridClass = () => {
    const count = leaderboardsData.length;
    if (count === 1) return 'grid-1';
    if (count === 2) return 'grid-2';
    if (count <= 4) return 'grid-4';
    return 'grid-4';
  };

  return (
    <div className="display-container">
      <header className="display-header">
        <h1>🏆 Sweet TV Leaderboards</h1>
      </header>

      {isLoading ? (
        <div className="loading-display">
          <p>Laddar leaderboards...</p>
          {loadingProgress.total > 0 && (
            <p style={{ fontSize: '1.2rem', marginTop: '1rem', color: 'rgba(255,255,255,0.8)' }}>
              {loadingProgress.current} / {loadingProgress.total}
            </p>
          )}
        </div>
      ) : leaderboardsData.length === 0 ? (
        <div className="no-leaderboards">
          <p>Inga aktiva leaderboards</p>
          <p className="hint">Skapa en leaderboard i Admin-panelen</p>
        </div>
      ) : (
        <div className={`leaderboards-grid ${getGridClass()}`}>
          {leaderboardsData.slice(0, 4).map(({ leaderboard, stats }) => (
            <LeaderboardCard 
              key={leaderboard.id}
              leaderboard={leaderboard}
              stats={stats}
            />
          ))}
        </div>
      )}

      {currentNotification && (
        <DealNotification 
          notification={currentNotification}
          onComplete={handleNotificationComplete}
        />
      )}
    </div>
  );
};

export default Display;
