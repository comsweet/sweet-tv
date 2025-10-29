import { useState, useEffect, useRef } from 'react';
import socketService from '../services/socket';
import { getActiveLeaderboards, getLeaderboardStats2 } from '../services/api';
import DealNotification from '../components/DealNotification.jsx';
import '../components/DealNotification.css';
import './Display.css';

// 🔥 GLOBAL STATE for wipe management (persists across re-renders)
const wipeState = {};
const wipeIntervals = {};

const LeaderboardCard = ({ leaderboard, stats }) => {
  const [, forceUpdate] = useState(0);
  const leaderboardId = leaderboard.id;

  // Initialize wipe state
  if (!wipeState[leaderboardId]) {
    wipeState[leaderboardId] = {
      currentPage: 0,
      isTransitioning: false
    };
  }

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

  // 🔥 WIPE LOGIC - samma som DualLeaderboardSlide
  const frozenCount = 3; // Top 3 är alltid synliga
  const itemsPerPage = 7; // 7 items passar perfekt för 1080p TV
  
  const topStats = stats.slice(0, frozenCount);
  const scrollableStats = stats.slice(frozenCount);
  const totalPages = Math.ceil(scrollableStats.length / itemsPerPage);
  const needsWipe = scrollableStats.length > itemsPerPage;

  // Listen to wipe events
  useEffect(() => {
    const handleWipe = (event) => {
      if (event.detail.leaderboardId !== leaderboardId) return;
      
      wipeState[leaderboardId].isTransitioning = true;
      forceUpdate(n => n + 1);
      
      setTimeout(() => {
        wipeState[leaderboardId].currentPage = 
          (wipeState[leaderboardId].currentPage + 1) % totalPages;
        wipeState[leaderboardId].isTransitioning = false;
        forceUpdate(n => n + 1);
      }, 800);
    };

    window.addEventListener('leaderboard-wipe', handleWipe);
    return () => window.removeEventListener('leaderboard-wipe', handleWipe);
  }, [leaderboardId, totalPages]);

  // Create interval ONCE for auto-wipe
  useEffect(() => {
    if (!needsWipe || wipeIntervals[leaderboardId]) return;

    console.log(`✅ [${leaderboard.name}] Auto-wipe enabled: ${totalPages} pages × ${itemsPerPage} items/page`);
    console.log(`   🔄 Will rotate every 12 seconds`);
    
    wipeIntervals[leaderboardId] = setInterval(() => {
      window.dispatchEvent(new CustomEvent('leaderboard-wipe', {
        detail: { leaderboardId }
      }));
    }, 12000); // 12 seconds per page

    // NO CLEANUP - interval lives forever for TV display
  }, [needsWipe, leaderboardId, totalPages, leaderboard.name]);

  const renderAgent = (item, index, isFrozen = false) => {
    if (!item) return null;
    
    const isZeroDeals = item.dealCount === 0;
    const uniqueSMS = item.uniqueSMS || 0;
    const smsSuccessRate = item.smsSuccessRate || 0;
    
    return (
      <div 
        key={item.userId}
        className={`leaderboard-item-display ${index === 0 && !isZeroDeals ? 'first-place' : ''} ${isZeroDeals ? 'zero-deals' : ''} ${isFrozen ? 'frozen-item' : ''}`}
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
  };

  // Calculate current page items
  const startIndex = wipeState[leaderboardId].currentPage * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, scrollableStats.length);
  const currentPageItems = scrollableStats.slice(startIndex, endIndex);

  // Display range for indicator
  const displayStart = startIndex + frozenCount + 1;
  const displayEnd = endIndex + frozenCount;

  return (
    <div className="leaderboard-card-display">
      <div className="leaderboard-header">
        <h2>{leaderboard.name}</h2>
        <p className="leaderboard-period">{getTimePeriodLabel(leaderboard.timePeriod)}</p>
        <p className="leaderboard-agent-count">
          👥 {stats.length} agenter
          {needsWipe && (
            <span className="page-indicator"> • Visar {displayStart}-{displayEnd}</span>
          )}
        </p>
      </div>

      {stats.length === 0 ? (
        <div className="no-data-display">Inga affärer än</div>
      ) : (
        <div className="leaderboard-items-container">
          {/* 🔥 FROZEN SECTION - Top 3 alltid synliga */}
          {topStats.length > 0 && (
            <div className="frozen-section">
              {topStats.map((item, index) => renderAgent(item, index, true))}
            </div>
          )}

          {/* 🔥 WIPE SECTION - Resten roterar */}
          {scrollableStats.length > 0 && (
            <div className="wipe-container">
              <div 
                className={`wipe-content ${wipeState[leaderboardId].isTransitioning ? 'wipe-exiting' : 'wipe-active'}`}
              >
                {currentPageItems.map((item, pageIndex) => {
                  const globalIndex = startIndex + frozenCount + pageIndex;
                  return renderAgent(item, globalIndex, false);
                })}
              </div>
            </div>
          )}

          {/* 🔥 PAGE INDICATOR */}
          {needsWipe && totalPages > 1 && (
            <div className="page-dots">
              {Array.from({ length: totalPages }).map((_, i) => (
                <div 
                  key={i}
                  className={`page-dot ${i === wipeState[leaderboardId].currentPage ? 'active' : ''}`}
                />
              ))}
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
            stats: stats
          });
          
          const totalDeals = stats.reduce((sum, s) => sum + s.dealCount, 0);
          const totalCommission = stats.reduce((sum, s) => sum + s.totalCommission, 0);
          
          console.log(`   ✅ ${silent ? 'Updated' : 'Loaded'} "${lb.name}"`);
          console.log(`      - ${stats.length} agents (ALL VISIBLE with auto-wipe)`);
          console.log(`      - ${totalDeals} deals, ${totalCommission.toLocaleString('sv-SE')} THB`);
          
          // Show wipe info
          if (stats.length > 10) {
            const frozenCount = 3;
            const itemsPerPage = 7;
            const scrollableCount = stats.length - frozenCount;
            const totalPages = Math.ceil(scrollableCount / itemsPerPage);
            console.log(`      - 🔄 Auto-wipe: Top ${frozenCount} frozen, ${scrollableCount} rotating (${totalPages} pages)`);
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
    console.log('📺 TV MODE: Auto-wipe enabled for 10+ agents');
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
