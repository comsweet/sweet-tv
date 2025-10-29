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

  // 🔥 Helper function för commission klass
  const getCommissionClass = (commission, timePeriod) => {
    if (commission === 0) return 'zero';
    if (timePeriod === 'day') return commission < 3400 ? 'low' : 'high';
    if (timePeriod === 'week') return commission < 18000 ? 'low' : 'high';
    return commission < 50000 ? 'low' : 'high';
  };

  // 🔥 Helper function för SMS box färg
  const getSMSBoxClass = (successRate) => {
    if (successRate >= 75) return 'sms-green';
    if (successRate >= 60) return 'sms-orange';
    return 'sms-red';
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
          {stats.slice(0, 20).map((item, index) => {
            const isZeroDeals = item.dealCount === 0;
            const uniqueSMS = item.uniqueSMS || 0;
            const smsSuccessRate = item.smsSuccessRate || 0;
            
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
                  <h3 className={`agent-name-display ${isZeroDeals ? 'zero-deals' : ''}`}>
                    {item.agent.name}
                  </h3>
                </div>
                
                {/* Deals column with dart emoji */}
                <div className={`deals-column-display ${isZeroDeals ? 'zero' : ''}`}>
                  <span className="emoji">🎯</span>
                  <span>{item.dealCount} affärer</span>
                </div>
                
                {/* 🔥 SMS BOX */}
                <div className={`sms-box-display ${getSMSBoxClass(smsSuccessRate)}`}>
                  <div className="sms-rate">
                    {smsSuccessRate.toFixed(2)}%
                  </div>
                  <div className="sms-count">
                    ({uniqueSMS} SMS)
                  </div>
                </div>
                
                {/* Commission */}
                <div className={`commission-display ${getCommissionClass(item.totalCommission, leaderboard.timePeriod)}`}>
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
  
  // 🔥 FIX: Deduplication tracking
  const lastNotificationRef = useRef(null);
  const notificationTimeoutRef = useRef(null);

  // 🔥 ENHANCED: Fetch leaderboards with better silent mode logging
  const fetchLeaderboards = async (silent = false) => {
    try {
      if (!silent) {
        console.log('\n📊 === LOADING LEADERBOARDS (Initial) ===');
        setIsLoading(true);
      } else {
        console.log('\n🔄 === SILENT REFRESH STARTING ===');
        console.log(`⏰ Time: ${new Date().toLocaleTimeString()}`);
      }
      
      // Steg 1: Hämta aktiva leaderboards
      const response = await getActiveLeaderboards();
      const activeLeaderboards = response.data;
      
      if (!silent) {
        console.log(`📊 Fetching stats for ${activeLeaderboards.length} leaderboards SEQUENTIALLY...`);
        setLoadingProgress({ current: 0, total: activeLeaderboards.length });
      } else {
        console.log(`📊 Updating ${activeLeaderboards.length} leaderboards...`);
      }
      
      const leaderboardsWithStats = [];
      
      // Steg 2: Hämta stats EN leaderboard i taget
      for (let i = 0; i < activeLeaderboards.length; i++) {
        const lb = activeLeaderboards[i];
        
        if (!silent) {
          setLoadingProgress({ current: i + 1, total: activeLeaderboards.length });
          console.log(`📈 Loading leaderboard ${i + 1}/${activeLeaderboards.length}: "${lb.name}"`);
        } else {
          console.log(`   📈 Updating "${lb.name}"...`);
        }
        
        try {
          const statsResponse = await getLeaderboardStats2(lb.id);
          const stats = statsResponse.data.stats || [];
          
          leaderboardsWithStats.push({
            leaderboard: lb,
            stats: stats
          });
          
          if (!silent) {
            console.log(`✅ Loaded "${lb.name}" (${stats.length} agents)`);
          } else {
            // 🔥 ENHANCED: Show stats summary in silent mode
            const totalDeals = stats.reduce((sum, s) => sum + s.dealCount, 0);
            const totalCommission = stats.reduce((sum, s) => sum + s.totalCommission, 0);
            console.log(`   ✅ Updated "${lb.name}": ${stats.length} agents, ${totalDeals} deals, ${totalCommission.toLocaleString('sv-SE')} THB`);
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
        console.log('='.repeat(50) + '\n');
      } else {
        console.log(`✅ Silent refresh complete: Updated ${leaderboardsWithStats.length} leaderboards`);
        console.log('='.repeat(50) + '\n');
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
    console.log('🚀 Display component mounted - Starting initial load');
    fetchLeaderboards();
    
    // 🔥 AUTOMATIC REFRESH var 2:e minut (background update)
    console.log('⏰ Setting up auto-refresh: Every 2 minutes');
    refreshIntervalRef.current = setInterval(() => {
      console.log('\n⏰ === AUTO-REFRESH TRIGGERED (2 minute interval) ===');
      fetchLeaderboards(true); // silent = true (no loading screen)
    }, 2 * 60 * 1000); // 2 minuter

    socketService.connect();

    const handleNewDeal = (notification) => {
      console.log('\n🎉 === NEW DEAL RECEIVED ===');
      console.log(`   Agent: ${notification.agent.name}`);
      console.log(`   Commission: ${notification.commission} THB`);
      console.log(`   Daily Total: ${notification.dailyTotal} THB`);
      
      // 🔥 FIX: Deduplication logic
      const currentTime = Date.now();
      const notificationKey = `${notification.agent.userId}-${notification.commission}`;
      const lastKey = lastNotificationRef.current;
      const timeSinceLastNotification = currentTime - (notificationTimeoutRef.current || 0);
      
      // Block if SAME agent with SAME commission within 2 seconds
      if (lastKey === notificationKey && timeSinceLastNotification < 2000) {
        console.log('⚠️  DUPLICATE notification detected - IGNORING');
        console.log(`   Same agent (${notification.agent.name}) + same commission (${notification.commission} THB) within 2s`);
        console.log('='.repeat(50) + '\n');
        return;
      }
      
      // Update tracking for next notification
      lastNotificationRef.current = notificationKey;
      notificationTimeoutRef.current = currentTime;
      
      console.log(`✅ Notification ACCEPTED: ${notification.agent.name} - ${notification.commission} THB`);
      setCurrentNotification(notification);
      
      // 🔥 IMMEDIATE BACKGROUND UPDATE efter notification (5 sekunder)
      console.log('⏰ Scheduling silent refresh in 5 seconds...');
      setTimeout(() => {
        console.log('\n🔄 === DEAL-TRIGGERED REFRESH (5s after notification) ===');
        fetchLeaderboards(true);
      }, 5000);
      
      console.log('='.repeat(50) + '\n');
    };

    socketService.onNewDeal(handleNewDeal);

    return () => {
      console.log('🧹 Display component unmounting - Cleaning up');
      socketService.offNewDeal(handleNewDeal);
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        console.log('⏰ Auto-refresh timer cleared');
      }
    };
  }, []);

  const handleNotificationComplete = () => {
    console.log('🧹 Notification completed - Closing popup');
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
