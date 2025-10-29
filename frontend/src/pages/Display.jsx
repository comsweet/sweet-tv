import { useState, useEffect, useRef } from 'react';
import socketService from '../services/socket';
import { getActiveLeaderboards, getLeaderboardStats2 } from '../services/api';
import DealNotification from '../components/DealNotification.jsx';
import '../components/DealNotification.css';
import './Display.css';

const LeaderboardCard = ({ leaderboard, stats, refreshKey }) => {
  const scrollContainerRef = useRef(null);
  const scrollContentRef = useRef(null);

  useEffect(() => {
    if (stats.length <= 1) return; // Om bara 1 agent, ingen scroll

    const container = scrollContainerRef.current;
    const content = scrollContentRef.current;
    
    if (!container || !content) return;

    // Beräkna scroll-distans
    const containerHeight = container.clientHeight;
    const contentHeight = content.scrollHeight;
    const scrollDistance = contentHeight - containerHeight;

    if (scrollDistance <= 0) {
      // Content passar i viewporten, ingen scroll behövs
      return;
    }

    // 🔥 DYNAMISK SCROLL-HASTIGHET: 50 pixels per sekund
    const SCROLL_SPEED = 35; // px/s (justera för snabbare/långsammare)
    const scrollDuration = scrollDistance / SCROLL_SPEED;
    
    // Total animation duration inkl. pauser (lägg till 20% för pauser)
    const totalDuration = scrollDuration * 1.2;

    // Sätt CSS variables för animation
    container.style.setProperty('--scroll-distance', `-${scrollDistance}px`);
    container.style.setProperty('--scroll-duration', `${totalDuration}s`);
    
    console.log(`📏 Scroll info: ${stats.length} agents, ${scrollDistance}px distance, ${totalDuration.toFixed(1)}s duration`);
    
    // Starta animation
    content.classList.add('scrolling');

    return () => {
      if (content) {
        content.classList.remove('scrolling');
      }
    };
  }, [stats, refreshKey]);  // 🔥 FIX: Lägg till refreshKey här!

  // 🔥 SEPARAT useEffect: Force reset när refreshKey ändras
  useEffect(() => {
    const content = scrollContentRef.current;
    if (!content) return;
    
    console.log(`🔄 RefreshKey changed to ${refreshKey} - resetting animation`);
    
    // Remove scrolling class
    content.classList.remove('scrolling');
    
    // Force reflow to ensure CSS reset
    void content.offsetHeight;
    
    // Re-add scrolling class if we have stats
    if (stats.length > 1) {
      // Small delay to ensure DOM update
      setTimeout(() => {
        content.classList.add('scrolling');
        console.log(`✅ Animation restarted for leaderboard`);
      }, 50);
    }
  }, [refreshKey]);

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

  // Separera #1 från resten
  const firstPlace = stats.length > 0 ? stats[0] : null;
  const scrollableStats = stats.slice(1); // Alla utom #1

  const renderAgent = (item, index, isFrozen = false) => {
    if (!item) return null;
    
    const isZeroDeals = item.dealCount === 0;
    const uniqueSMS = item.uniqueSMS || 0;
    const smsSuccessRate = item.smsSuccessRate || 0;
    
    return (
      <div 
        key={item.userId}
        className={`leaderboard-item-display ${index === 0 && !isZeroDeals && isFrozen ? 'first-place' : ''} ${isZeroDeals ? 'zero-deals' : ''} ${isFrozen ? 'frozen-item' : ''}`}
      >
        <div className="rank-display">
          {index === 0 && !isZeroDeals && isFrozen && '🥇'}
          {index === 1 && !isZeroDeals && !isFrozen && '🥈'}
          {index === 2 && !isZeroDeals && !isFrozen && '🥉'}
          {((index > 2 && !isFrozen) || (index > 0 && isFrozen) || isZeroDeals) && `#${index + 1}`}
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
  };

  return (
    <div className="leaderboard-card-display">
      <div className="leaderboard-header">
        <h2>{leaderboard.name}</h2>
        <p className="leaderboard-period">{getTimePeriodLabel(leaderboard.timePeriod)}</p>
        <p className="leaderboard-agent-count">
          👥 {stats.length} agenter
        </p>
      </div>

      {stats.length === 0 ? (
        <div className="no-data-display">Inga affärer än</div>
      ) : (
        <div className="leaderboard-items-wrapper">
          {/* 🔥 FROZEN #1 SECTION */}
          {firstPlace && (
            <div className="frozen-first-place">
              {renderAgent(firstPlace, 0, true)}
            </div>
          )}

          {/* 🔥 AUTO-SCROLL SECTION - Alla utom #1 */}
          {scrollableStats.length > 0 && (
            <div className="scroll-container" ref={scrollContainerRef}>
              <div className="scroll-content" ref={scrollContentRef}>
                {scrollableStats.map((item, idx) => renderAgent(item, idx + 1, false))}
              </div>
            </div>
          )}
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
      }
      
      const leaderboardsWithStats = [];
      
      for (let i = 0; i < activeLeaderboards.length; i++) {
        const lb = activeLeaderboards[i];
        
        if (!silent) {
          setLoadingProgress({ current: i + 1, total: activeLeaderboards.length });
          console.log(`   📈 [${i + 1}/${activeLeaderboards.length}] Loading "${lb.name}"`);
        }
        
        try {
          const statsResponse = await getLeaderboardStats2(lb.id);
          const stats = statsResponse.data.stats || [];
          
          leaderboardsWithStats.push({
            leaderboard: lb,
            stats: stats // ✅ ALLA agenter, ingen slice()
          });
          
          const totalDeals = stats.reduce((sum, s) => sum + s.dealCount, 0);
          const totalCommission = stats.reduce((sum, s) => sum + s.totalCommission, 0);
          
          console.log(`   ✅ ${silent ? 'Updated' : 'Loaded'} "${lb.name}"`);
          console.log(`      - ${stats.length} agents (ALL VISIBLE with auto-scroll)`);
          console.log(`      - ${totalDeals} deals, ${totalCommission.toLocaleString('sv-SE')} THB`);
          
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
      
      console.log(`\n✅ ${silent ? 'Silent refresh complete' : 'All leaderboards loaded'}`);
      console.log('═══════════════════════════════════════════\n');
      
      setLeaderboardsData(leaderboardsWithStats);
      if (forceRefresh) {
        setRefreshKey(prev => prev + 1);
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
    console.log('📺 TV MODE: Auto-scroll enabled (30s cycle)');
    console.log('🥇 Frozen #1 at top');
    console.log('═══════════════════════════════════════════\n');
    
    fetchLeaderboards();
    
    console.log('⏰ Setting up auto-refresh: Every 2 minutes');
    refreshIntervalRef.current = setInterval(() => {
      console.log('\n⏰ AUTO-REFRESH TRIGGERED (2 minute interval)');
      fetchLeaderboards(true, true);
    }, 2 * 60 * 1000);

    socketService.connect();

    const handleNewDeal = (notification) => {
      console.log('\n🎉 ═══════════════════════════════════════════');
      console.log('🎉 NEW DEAL RECEIVED');
      console.log(`   👤 Agent: ${notification.agent?.name || 'Unknown'}`);
      console.log(`   💰 Commission: ${notification.commission || 0} THB`);
      console.log(`   🆔 Lead ID: ${notification.leadId || 'unknown'}`);
      
      const leadId = notification.leadId;
      
      if (notifiedDealsRef.current.has(leadId)) {
        console.log('⚠️  DUPLICATE - BLOCKING');
        return;
      }
      
      notifiedDealsRef.current.add(leadId);
      lastNotificationTimeRef.current = Date.now();
      
      console.log(`✅ Notification ACCEPTED`);
      setCurrentNotification(notification);
      
      if (dealRefreshTimeoutRef.current) {
        clearTimeout(dealRefreshTimeoutRef.current);
      }
      
      console.log(`⏰ Scheduling refresh in 5 seconds...`);
      dealRefreshTimeoutRef.current = setTimeout(() => {
        console.log('🔄 DEAL-TRIGGERED REFRESH');
        fetchLeaderboards(true, true);
      }, 5000);
      
      console.log('═══════════════════════════════════════════\n');
    };

    socketService.onNewDeal(handleNewDeal);

    const cleanupInterval = setInterval(() => {
      if (notifiedDealsRef.current.size > 100) {
        console.log(`🧹 Clearing cache (${notifiedDealsRef.current.size} entries)`);
        notifiedDealsRef.current.clear();
      }
    }, 5 * 60 * 1000);

    return () => {
      console.log('\n🧹 DISPLAY UNMOUNTING');
      socketService.offNewDeal(handleNewDeal);
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      if (dealRefreshTimeoutRef.current) clearTimeout(dealRefreshTimeoutRef.current);
      clearInterval(cleanupInterval);
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
        <div className={`leaderboards-grid ${getGridClass()}`} key={refreshKey}>
          {leaderboardsData.slice(0, 4).map(({ leaderboard, stats }) => (
            <LeaderboardCard 
              key={`${leaderboard.id}-${refreshKey}`}
              leaderboard={leaderboard}
              stats={stats}
              refreshKey={refreshKey}
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
