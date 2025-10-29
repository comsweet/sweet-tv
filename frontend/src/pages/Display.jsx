import { useState, useEffect, useRef } from 'react';
import { getActiveLeaderboards, getLeaderboardData } from '../services/api';
import socketService from '../services/socketService';
import DealNotification from '../components/DealNotification';
import './Display.css';
import './DisplayTV.css'; // NY CSS FIL

// ==============================================
// TV SIZE CONTROL COMPONENT
// ==============================================
const TVSizeControl = ({ currentSize, onSizeChange }) => {
  const [isVisible, setIsVisible] = useState(true);
  
  useEffect(() => {
    // Visa kontroller i 10 sekunder, sedan göm dem
    const timer = setTimeout(() => setIsVisible(false), 10000);
    return () => clearTimeout(timer);
  }, [currentSize]); // Reset timer när storlek ändras

  const sizes = [
    { id: 'compact', label: 'Kompakt', icon: '📏' },
    { id: 'normal', label: 'Normal', icon: '📐' },
    { id: 'large', label: 'Stor', icon: '📊' },
    { id: 'xlarge', label: 'Extra Stor', icon: '📺' }
  ];

  if (!isVisible) {
    // Visa bara en liten knapp för att öppna menyn igen
    return (
      <div className="tv-size-toggle" onClick={() => setIsVisible(true)}>
        ⚙️
      </div>
    );
  }

  return (
    <div className="tv-size-control">
      <div className="tv-size-label">TV-storlek:</div>
      {sizes.map(size => (
        <button
          key={size.id}
          className={`tv-size-btn ${currentSize === size.id ? 'active' : ''}`}
          onClick={() => {
            onSizeChange(size.id);
            localStorage.setItem('tv-display-size', size.id);
          }}
        >
          {size.icon} {size.label}
        </button>
      ))}
      <button 
        className="tv-size-close"
        onClick={() => setIsVisible(false)}
      >
        ✕
      </button>
    </div>
  );
};

// ==============================================
// LEADERBOARD CARD WITH AUTO-SCROLL
// ==============================================
const LeaderboardCard = ({ leaderboard, stats, displaySize }) => {
  const scrollContainerRef = useRef(null);
  const scrollIntervalRef = useRef(null);
  const [isScrolling, setIsScrolling] = useState(false);
  
  const leaderboardId = leaderboard.id;
  const timePeriod = leaderboard.timePeriod;

  // Freeze #1 alltid
  const topAgent = stats.length > 0 ? stats[0] : null;
  const scrollableStats = stats.slice(1); // Alla utom #1

  // Auto-scroll logic
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || scrollableStats.length <= 6) return; // Ingen scroll om <6 agenter

    console.log(`🔄 [${leaderboard.name}] Auto-scroll enabled`);

    let scrollDirection = 1; // 1 = ner, -1 = upp
    let scrollPosition = 0;

    scrollIntervalRef.current = setInterval(() => {
      const maxScroll = container.scrollHeight - container.clientHeight;
      
      // Scrolla ner eller upp
      scrollPosition += scrollDirection * 1;
      
      // Byt riktning vid topp/botten
      if (scrollPosition >= maxScroll) {
        scrollDirection = -1; // Börja scrolla upp
      } else if (scrollPosition <= 0) {
        scrollDirection = 1; // Börja scrolla ner
      }
      
      container.scrollTop = scrollPosition;
    }, 50); // Uppdatera var 50ms för smooth scroll

    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
    };
  }, [scrollableStats.length, leaderboard.name]);

  const getCommissionClass = (commission) => {
    if (timePeriod === 'day') return commission < 1200 ? 'low' : 'high';
    if (timePeriod === 'week') return commission < 18000 ? 'low' : 'high';
    return commission < 50000 ? 'low' : 'high';
  };

  const getSMSBoxClass = (successRate) => {
    if (successRate >= 75) return 'sms-green';
    if (successRate >= 60) return 'sms-orange';
    return 'sms-red';
  };

  const renderAgent = (item, index, isFrozen = false) => {
    if (!item) return null;
    
    const isZeroDeals = item.dealCount === 0;
    const uniqueSMS = item.uniqueSMS || 0;
    const smsSuccessRate = item.smsSuccessRate || 0;
    
    return (
      <div 
        key={item.userId}
        className={`leaderboard-item-display ${index === 0 && isFrozen ? 'first-place frozen-top' : ''} ${isZeroDeals ? 'zero-deals' : ''}`}
      >
        <div className="rank-display">
          {index === 0 && isFrozen && '🥇'}
          {index > 0 && `#${index + 1}`}
        </div>
        
        {item.agent.profileImage ? (
          <img 
            src={item.agent.profileImage} 
            alt={item.agent.name}
            className="agent-image-display"
          />
        ) : (
          <div className="agent-image-placeholder">
            {item.agent.name.charAt(0).toUpperCase()}
          </div>
        )}
        
        <div className="agent-name-display">{item.agent.name}</div>
        
        <div className="stats-display">
          <div className="stat-item">
            <span className="stat-label">Deals:</span>
            <span className="stat-value">{item.dealCount}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">SMS:</span>
            <span className={`stat-value sms-box ${getSMSBoxClass(smsSuccessRate)}`}>
              {uniqueSMS}
            </span>
          </div>
          <div className={`commission-display ${getCommissionClass(item.totalCommission)}`}>
            {item.totalCommission.toLocaleString()} THB
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`leaderboard-card-display size-${displaySize}`}>
      <div className="leaderboard-header">
        <h2>{leaderboard.name}</h2>
        <p className="leaderboard-period">
          {timePeriod === 'day' && '📅 Idag'}
          {timePeriod === 'week' && '📅 Denna vecka'}
          {timePeriod === 'month' && '📅 Denna månad'}
        </p>
        <p className="leaderboard-agent-count">
          👥 {stats.length} {stats.length === 1 ? 'säljare' : 'säljare'}
        </p>
      </div>

      <div className="leaderboard-list-display">
        {/* FROZEN #1 */}
        {topAgent && renderAgent(topAgent, 0, true)}
        
        {/* SCROLLABLE REST */}
        <div 
          ref={scrollContainerRef}
          className="scrollable-agents"
        >
          {scrollableStats.map((item, idx) => renderAgent(item, idx + 1, false))}
        </div>
      </div>
    </div>
  );
};

// ==============================================
// MAIN DISPLAY COMPONENT
// ==============================================
const Display = () => {
  const [leaderboardsData, setLeaderboardsData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentNotification, setCurrentNotification] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [displaySize, setDisplaySize] = useState(() => {
    return localStorage.getItem('tv-display-size') || 'normal';
  });
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });

  const refreshIntervalRef = useRef(null);
  const dealRefreshTimeoutRef = useRef(null);
  const notifiedDealsRef = useRef(new Set());
  const lastNotificationTimeRef = useRef(0);

  const fetchLeaderboards = async (silentRefresh = false, forceRefresh = false) => {
    try {
      if (!silentRefresh) setIsLoading(true);
      
      console.log('\n🔄 ═══════════════════════════════════════════');
      console.log(`🔄 ${silentRefresh ? 'SILENT' : 'FULL'} REFRESH`);
      console.log('═══════════════════════════════════════════');
      
      const activeLeaderboards = await getActiveLeaderboards();
      console.log(`📊 Found ${activeLeaderboards.length} active leaderboards`);
      
      setLoadingProgress({ current: 0, total: activeLeaderboards.length });
      
      const leaderboardsWithStats = await Promise.all(
        activeLeaderboards.map(async (lb, index) => {
          console.log(`\n📥 [${index + 1}/${activeLeaderboards.length}] Fetching: ${lb.name}`);
          const data = await getLeaderboardData(lb.id);
          setLoadingProgress({ current: index + 1, total: activeLeaderboards.length });
          console.log(`   ✅ ${data.stats.length} agents loaded`);
          return {
            leaderboard: data.leaderboard,
            stats: data.stats
          };
        })
      );
      
      console.log('\n✅ ═══════════════════════════════════════════');
      console.log(`✅ ${silentRefresh ? 'Silent refresh complete' : 'All leaderboards loaded'}`);
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
    console.log('📺 TV MODE: Auto-scroll enabled');
    console.log(`📏 Display size: ${displaySize}`);
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
    <div className={`display-container size-${displaySize}`}>
      <header className="display-header">
        <h1>🏆 Sweet TV Leaderboards</h1>
      </header>

      {/* TV SIZE CONTROLS */}
      <TVSizeControl 
        currentSize={displaySize}
        onSizeChange={setDisplaySize}
      />

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
              displaySize={displaySize}
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
