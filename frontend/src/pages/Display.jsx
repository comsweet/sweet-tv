import { useState, useEffect, useRef } from 'react';
import socketService from '../services/socket';
import { getActiveLeaderboards, getLeaderboardStats2 } from '../services/api';
import DealNotification from '../components/DealNotification.jsx';
import '../components/DealNotification.css';
import './Display.css';

// ==============================================
// TV SIZE CONTROL COMPONENT
// ==============================================
const TVSizeControl = ({ currentSize, onSizeChange }) => {
  const [isVisible, setIsVisible] = useState(true);
  
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(false), 10000);
    return () => clearTimeout(timer);
  }, [currentSize]);

  const sizes = [
    { id: 'compact', label: 'Kompakt', icon: '📏' },
    { id: 'normal', label: 'Normal', icon: '📐' },
    { id: 'large', label: 'Stor', icon: '📊' },
    { id: 'xlarge', label: 'Extra Stor', icon: '📺' }
  ];

  if (!isVisible) {
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

  const topAgent = stats.length > 0 ? stats[0] : null;
  const scrollableStats = stats.slice(1);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || scrollableStats.length <= 6) return;

    console.log(`🔄 [${leaderboard.name}] Auto-scroll enabled`);

    let scrollDirection = 1;
    let scrollPosition = 0;

    scrollIntervalRef.current = setInterval(() => {
      const maxScroll = container.scrollHeight - container.clientHeight;
      scrollPosition += scrollDirection * 1;
      
      if (scrollPosition >= maxScroll) {
        scrollDirection = -1;
      } else if (scrollPosition <= 0) {
        scrollDirection = 1;
      }
      
      container.scrollTop = scrollPosition;
    }, 50);

    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
    };
  }, [scrollableStats.length, leaderboard.name]);

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
          {index === 1 && !isFrozen && '🥈'}
          {index === 2 && !isFrozen && '🥉'}
          {(index > 2 || (index > 0 && isFrozen)) && `#${index + 1}`}
        </div>
        
        {item.agent?.profileImage ? (
          <img 
            src={item.agent.profileImage} 
            alt={item.agent?.name || 'Agent'}
            className="agent-avatar-display"
          />
        ) : (
          <div className="agent-avatar-placeholder-display">
            {(item.agent?.name || 'A').charAt(0).toUpperCase()}
          </div>
        )}
        
        <div className="agent-info-display">
          <h3 className={`agent-name-display ${isZeroDeals ? 'zero-deals' : ''}`}>
            {item.agent?.name || 'Unknown'}
          </h3>
        </div>
        
        <div className={`deals-column-display ${isZeroDeals ? 'zero' : ''}`}>
          <span className="emoji">🎯</span>
          <span>{item.dealCount}</span>
        </div>
        
        <div className={`sms-box-display ${getSMSBoxClass(smsSuccessRate)}`}>
          <div className="sms-rate">{smsSuccessRate}%</div>
          <div className="sms-count">{uniqueSMS} SMS</div>
        </div>
        
        <div className={`commission-display ${getCommissionClass(item.totalCommission, leaderboard.timePeriod)}`}>
          {item.totalCommission.toLocaleString('sv-SE')} THB
        </div>
      </div>
    );
  };

  return (
    <div className={`leaderboard-card-display size-${displaySize}`}>
      <div className="leaderboard-header">
        <h2>{leaderboard.name}</h2>
        <p className="leaderboard-period">
          📅 {getTimePeriodLabel(leaderboard.timePeriod)}
        </p>
        <p className="leaderboard-agent-count">
          👥 {stats.length} {stats.length === 1 ? 'säljare' : 'säljare'}
        </p>
      </div>

      {stats.length === 0 ? (
        <div className="no-data-display">
          Inga agenter att visa
        </div>
      ) : (
        <div className="leaderboard-items-container">
          {topAgent && (
            <div className="frozen-section">
              {renderAgent(topAgent, 0, true)}
            </div>
          )}
          
          <div 
            ref={scrollContainerRef}
            className="scrollable-agents"
          >
            {scrollableStats.map((item, idx) => renderAgent(item, idx + 1, false))}
          </div>
        </div>
      )}
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

  const fetchLeaderboards = async (silent = false, forceRefresh = false) => {
    try {
      if (!silent) {
        setIsLoading(true);
        console.log('\n🔄 FETCHING LEADERBOARDS');
      }
      
      const activeLeaderboards = await getActiveLeaderboards();
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
          
          if (i < activeLeaderboards.length - 1 && !silent) {
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
    console.log('\n🚀 DISPLAY COMPONENT MOUNTED');
    console.log(`📏 Display size: ${displaySize}`);
    
    fetchLeaderboards();
    
    refreshIntervalRef.current = setInterval(() => {
      console.log('\n⏰ AUTO-REFRESH');
      fetchLeaderboards(true, true);
    }, 2 * 60 * 1000);

    socketService.connect();

    const handleNewDeal = (notification) => {
      console.log('\n🎉 NEW DEAL RECEIVED');
      const leadId = notification.leadId;
      
      if (notifiedDealsRef.current.has(leadId)) {
        console.log('⚠️  DUPLICATE - BLOCKING');
        return;
      }
      
      notifiedDealsRef.current.add(leadId);
      setCurrentNotification(notification);
      
      if (dealRefreshTimeoutRef.current) {
        clearTimeout(dealRefreshTimeoutRef.current);
      }
      
      dealRefreshTimeoutRef.current = setTimeout(() => {
        fetchLeaderboards(true, true);
      }, 5000);
    };

    socketService.onNewDeal(handleNewDeal);

    const cleanupInterval = setInterval(() => {
      if (notifiedDealsRef.current.size > 100) {
        notifiedDealsRef.current.clear();
      }
    }, 5 * 60 * 1000);

    return () => {
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
