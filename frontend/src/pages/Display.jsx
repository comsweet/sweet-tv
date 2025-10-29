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

  const getCommissionClass = (commission, timePeriod) => {
    if (commission === 0) return 'zero';
    if (timePeriod === 'day') return commission < 3400 ? 'low' : 'high';
    if (timePeriod === 'week') return commission < 18000 ? 'low' : 'high';
    return commission < 50000 ? 'low' : 'high';
  };

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
        <p className="leaderboard-agent-count">👥 {stats.length} agenter</p>
      </div>

      {stats.length === 0 ? (
        <div className="no-data-display">Inga affärer än</div>
      ) : (
        <div className="leaderboard-items">
          {/* 🔥 REMOVED .slice(0, 20) - VISA ALLA AGENTER! */}
          {stats.map((item, index) => {
            const isZeroDeals = item.dealCount === 0;
            const uniqueSMS = item.uniqueSMS || 0;
            const smsSuccessRate = item.smsSuccessRate || 0;
            
            return (
              <div 
                key={item.userId} 
                className={`leaderboard-item-display ${index === 0 && !isZeroDeals ? 'first-place' : ''} ${isZeroDeals ? 'zero-deals' : ''}`}
              >
                <div className="rank-display">
                  {index === 0 && !isZeroDeals && '🥇'}
                  {index === 1 && !isZeroDeals && '🥈'}
                  {index === 2 && !isZeroDeals && '🥉'}
                  {(index > 2 || isZeroDeals) && `#${index + 1}`}
                </div>
                
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
                
                <div className="agent-info-display">
                  <h3 className={`agent-name-display ${isZeroDeals ? 'zero-deals' : ''}`}>
                    {item.agent.name}
                  </h3>
                </div>
                
                <div className={`deals-column-display ${isZeroDeals ? 'zero' : ''}`}>
                  <span className="emoji">🎯</span>
                  <span>{item.dealCount} affärer</span>
                </div>
                
                <div className={`sms-box-display ${getSMSBoxClass(smsSuccessRate)}`}>
                  <div className="sms-rate">
                    {smsSuccessRate.toFixed(2)}%
                  </div>
                  <div className="sms-count">
                    ({uniqueSMS} SMS)
                  </div>
                </div>
                
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
  const [refreshKey, setRefreshKey] = useState(0);
  
  const refreshIntervalRef = useRef(null);
  const dealRefreshTimeoutRef = useRef(null);
  const notifiedDealsRef = useRef(new Set());
  const lastNotificationTimeRef = useRef(0);

  const fetchLeaderboards = async (silent = false, forceRefresh = false) => {
    try {
      const timestamp = new Date().toLocaleTimeString();
      
      if (!silent) {
        console.log('\n📊 ═══════════════════════════════════════════');
        console.log('📊 LOADING LEADERBOARDS (Initial)');
        console.log(`⏰ Time: ${timestamp}`);
        console.log('═══════════════════════════════════════════');
        setIsLoading(true);
      } else {
        console.log('\n🔄 ═══════════════════════════════════════════');
        console.log('🔄 SILENT REFRESH');
        console.log(`⏰ Time: ${timestamp}`);
        console.log(`🔑 Force Refresh: ${forceRefresh ? 'YES' : 'NO'}`);
        console.log('═══════════════════════════════════════════');
      }
      
      const response = await getActiveLeaderboards();
      const activeLeaderboards = response.data;
      
      if (!silent) {
        console.log(`📊 Fetching stats for ${activeLeaderboards.length} leaderboards...`);
        setLoadingProgress({ current: 0, total: activeLeaderboards.length });
      } else {
        console.log(`📊 Updating ${activeLeaderboards.length} leaderboards...`);
      }
      
      const leaderboardsWithStats = [];
      
      for (let i = 0; i < activeLeaderboards.length; i++) {
        const lb = activeLeaderboards[i];
        
        if (!silent) {
          setLoadingProgress({ current: i + 1, total: activeLeaderboards.length });
          console.log(`   📈 [${i + 1}/${activeLeaderboards.length}] Loading "${lb.name}"`);
        } else {
          console.log(`   📈 [${i + 1}/${activeLeaderboards.length}] Updating "${lb.name}"`);
        }
        
        try {
          const statsResponse = await getLeaderboardStats2(lb.id);
          const stats = statsResponse.data.stats || [];
          
          leaderboardsWithStats.push({
            leaderboard: lb,
            stats: stats
          });
          
          const totalDeals = stats.reduce((sum, s) => sum + s.dealCount, 0);
          const totalCommission = stats.reduce((sum, s) => sum + s.totalCommission, 0);
          const topAgent = stats[0];
          
          // 🔥 SHOW ALL AGENT COUNT
          console.log(`   ✅ ${silent ? 'Updated' : 'Loaded'} "${lb.name}"`);
          console.log(`      - ${stats.length} agents (SHOWING ALL)`);
          console.log(`      - ${totalDeals} deals total`);
          console.log(`      - ${totalCommission.toLocaleString('sv-SE')} THB total`);
          if (topAgent) {
            console.log(`      - Top: ${topAgent.agent.name} (${topAgent.dealCount} deals, ${topAgent.totalCommission.toLocaleString('sv-SE')} THB)`);
          }
          
          // Show bottom agent too (so we can see the range)
          const bottomAgent = stats[stats.length - 1];
          if (bottomAgent && stats.length > 1) {
            console.log(`      - Bottom: ${bottomAgent.agent.name} (${bottomAgent.dealCount} deals, ${bottomAgent.totalCommission.toLocaleString('sv-SE')} THB)`);
          }
          
          if (i < activeLeaderboards.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
        } catch (error) {
          console.error(`   ❌ Error loading "${lb.name}":`, error);
          leaderboardsWithStats.push({
            leaderboard: lb,
            stats: []
          });
        }
      }
      
      if (!silent) {
        console.log(`\n✅ All ${leaderboardsWithStats.length} leaderboards loaded!`);
        console.log('═══════════════════════════════════════════\n');
      } else {
        console.log(`\n✅ Silent refresh complete: ${leaderboardsWithStats.length} leaderboards updated`);
        console.log('═══════════════════════════════════════════\n');
      }
      
      setLeaderboardsData(leaderboardsWithStats);
      if (forceRefresh) {
        setRefreshKey(prev => {
          const newKey = prev + 1;
          console.log(`🔑 Refresh key updated: ${prev} → ${newKey}`);
          return newKey;
        });
      }
      setIsLoading(false);
      
    } catch (error) {
      console.error('❌ Error fetching leaderboards:', error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    console.log('\n🚀 ═══════════════════════════════════════════');
    console.log('🚀 DISPLAY COMPONENT MOUNTED');
    console.log('═══════════════════════════════════════════\n');
    
    fetchLeaderboards();
    
    console.log('⏰ Setting up auto-refresh: Every 2 minutes');
    refreshIntervalRef.current = setInterval(() => {
      console.log('\n⏰ ═══════════════════════════════════════════');
      console.log('⏰ AUTO-REFRESH TRIGGERED (2 minute interval)');
      console.log('═══════════════════════════════════════════');
      fetchLeaderboards(true, true);
    }, 2 * 60 * 1000);

    socketService.connect();

    const handleNewDeal = (notification) => {
      console.log('\n🎉 ═══════════════════════════════════════════');
      console.log('🎉 NEW DEAL RECEIVED');
      console.log('═══════════════════════════════════════════');
      console.log(`   👤 Agent: ${notification.agent?.name || 'Unknown'}`);
      console.log(`   💰 Commission: ${notification.commission || 0} THB`);
      console.log(`   📈 Daily Total: ${notification.dailyTotal || 0} THB`);
      console.log(`   🎯 Daily Budget: ${notification.dailyBudget || 0} THB`);
      console.log(`   🔊 Sound: ${notification.soundType || 'unknown'}`);
      console.log(`   🏆 Reached Budget: ${notification.reachedBudget ? 'YES' : 'NO'}`);
      console.log(`   🆔 Lead ID: ${notification.leadId || 'unknown'}`);
      
      const currentTime = Date.now();
      const leadId = notification.leadId;
      
      if (notifiedDealsRef.current.has(leadId)) {
        console.log('\n⚠️  DUPLICATE NOTIFICATION DETECTED!');
        console.log(`   🆔 Lead ID ${leadId} already processed`);
        console.log(`   ❌ BLOCKING notification`);
        console.log('═══════════════════════════════════════════\n');
        return;
      }
      
      const notificationKey = `${notification.agent?.userId}-${notification.commission}`;
      const timeSinceLastNotification = currentTime - lastNotificationTimeRef.current;
      
      if (timeSinceLastNotification < 3000) {
        console.log('\n⚠️  POSSIBLE DUPLICATE (time-based check)');
        console.log(`   ⏱️  Only ${timeSinceLastNotification}ms since last notification`);
        console.log(`   🔑 Key: ${notificationKey}`);
        console.log(`   ⚠️  WARNING: This might be a duplicate!`);
      }
      
      notifiedDealsRef.current.add(leadId);
      lastNotificationTimeRef.current = currentTime;
      
      console.log(`\n✅ Notification ACCEPTED`);
      console.log(`   🆔 Tracking Lead ID: ${leadId}`);
      console.log(`   📝 Total tracked: ${notifiedDealsRef.current.size} deals`);
      
      setCurrentNotification(notification);
      
      if (dealRefreshTimeoutRef.current) {
        clearTimeout(dealRefreshTimeoutRef.current);
        console.log(`   🧹 Cleared previous refresh timeout`);
      }
      
      console.log(`\n⏰ Scheduling silent refresh in 5 seconds...`);
      dealRefreshTimeoutRef.current = setTimeout(() => {
        console.log('\n🔄 ═══════════════════════════════════════════');
        console.log('🔄 DEAL-TRIGGERED REFRESH (5s after notification)');
        console.log(`   🆔 Triggered by Lead ID: ${leadId}`);
        console.log('═══════════════════════════════════════════');
        fetchLeaderboards(true, true);
      }, 5000);
      
      console.log('═══════════════════════════════════════════\n');
    };

    socketService.onNewDeal(handleNewDeal);

    const cleanupInterval = setInterval(() => {
      const size = notifiedDealsRef.current.size;
      if (size > 100) {
        console.log(`\n🧹 Cleaning up notified deals cache (${size} entries)`);
        notifiedDealsRef.current.clear();
        console.log(`✅ Cache cleared\n`);
      }
    }, 5 * 60 * 1000);

    return () => {
      console.log('\n🧹 ═══════════════════════════════════════════');
      console.log('🧹 DISPLAY COMPONENT UNMOUNTING');
      console.log('═══════════════════════════════════════════\n');
      
      socketService.offNewDeal(handleNewDeal);
      
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        console.log('   ⏰ Auto-refresh timer cleared');
      }
      
      if (dealRefreshTimeoutRef.current) {
        clearTimeout(dealRefreshTimeoutRef.current);
        console.log('   ⏰ Deal refresh timeout cleared');
      }
      
      clearInterval(cleanupInterval);
      console.log('   🧹 Cleanup interval cleared\n');
    };
  }, []);

  const handleNotificationComplete = () => {
    console.log('🧹 Notification completed - Closing popup\n');
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
        <div className={`leaderboards-grid ${getGridClass()}`} key={refreshKey}>
          {leaderboardsData.slice(0, 4).map(({ leaderboard, stats }) => (
            <LeaderboardCard 
              key={`${leaderboard.id}-${refreshKey}`}
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
