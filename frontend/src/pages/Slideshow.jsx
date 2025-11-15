// frontend/src/pages/Slideshow.jsx
// 🔥 AUTO-SCROLL VERSION - Visar ALLA agenter med smooth scroll
// ⭐ UPDATED: Stöd för individuell duration per slide
console.log('🔥🔥🔥 SLIDESHOW.JSX LOADED - VERSION: INDIVIDUAL-DURATION');

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import socketService from '../services/socket';
import { getSlideshow, getLeaderboardStats2, getAutoRefreshSettings, getThresholdsForPeriod, sendSessionHeartbeat } from '../services/api';
import DealNotification from '../components/DealNotification';
import TVAccessCodeModal from '../components/TVAccessCodeModal';
import LeaderboardVisualizer from '../components/LeaderboardVisualizer';
import QuotesSlide from '../components/QuotesSlide';
import TrendChartSlide from '../components/TrendChartSlide';
import GroupComparisonSlide from '../components/GroupComparisonSlide';
import MetricsGridSlide from '../components/MetricsGridSlide';
import TeamBattleSlide from '../components/TeamBattleSlide';
import '../components/DealNotification.css';
import './Slideshow.css';

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
            localStorage.setItem('tv-slideshow-size', size.id);
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

// ⭐ LeaderboardSlide komponent med AUTO-SCROLL och FROZEN #1
const LeaderboardSlide = ({ leaderboard, stats, miniStats, isActive, displaySize, refreshKey }) => {
  const scrollContainerRef = useRef(null);
  const scrollContentRef = useRef(null);
  const [thresholds, setThresholds] = useState(null);

  // Fetch thresholds when leaderboard changes
  useEffect(() => {
    const fetchThresholds = async () => {
      try {
        const response = await getThresholdsForPeriod(leaderboard.timePeriod || 'day');
        setThresholds(response.data);
      } catch (error) {
        console.error('Error fetching thresholds:', error);
        // Use defaults if fetch fails
        setThresholds({
          total: { green: leaderboard.timePeriod === 'day' ? 3000 : leaderboard.timePeriod === 'week' ? 15000 : 50000 },
          sms: { green: 75, orange: 60 }
        });
      }
    };
    fetchThresholds();
  }, [leaderboard.timePeriod]);

  useEffect(() => {
    if (!isActive || stats.length <= 1) return;

    const container = scrollContainerRef.current;
    const content = scrollContentRef.current;
    
    if (!container || !content) return;

    // Beräkna scrollbar höjd
    const containerHeight = container.clientHeight;
    const contentHeight = content.scrollHeight;
    const scrollDistance = contentHeight - containerHeight;

    if (scrollDistance <= 0) {
      // Inget att scrolla
      return;
    }

    // 🔥 DYNAMISK SCROLL-HASTIGHET: 50 pixels per sekund
    const SCROLL_SPEED = 25; // px/s (justera för snabbare/långsammare)
    const scrollDuration = scrollDistance / SCROLL_SPEED;
    
    // Total animation duration inkl. pauser (lägg till 20% för pauser)
    const totalDuration = scrollDuration * 1.1;

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
  }, [isActive, stats.length, refreshKey]);

  const getTimePeriodLabel = (period) => {
    const labels = {
      day: 'Idag',
      week: 'Denna vecka',
      month: 'Denna månad',
      custom: 'Anpassat'
    };
    return labels[period] || period;
  };

  // Color functions using dynamic thresholds
  const getCommissionClass = (commission) => {
    if (!thresholds) return 'zero';
    if (!commission || commission === 0) return 'zero';
    if (commission >= thresholds.total.green) return 'high';
    return 'low';
  };

  const getSMSBoxClass = (successRate) => {
    if (!thresholds) return 'sms-red';
    if (successRate >= thresholds.sms.green) return 'sms-green';
    if (successRate >= thresholds.sms.orange) return 'sms-orange';
    return 'sms-red';
  };

  const getTotalClass = (total) => {
    if (!thresholds) return 'total-red';
    if (total === 0) return 'total-red';
    if (total >= thresholds.total.green) return 'total-green';
    return 'total-orange';
  };

  const getCampaignBonusClass = (bonus) => {
    if (!bonus || bonus === 0) return 'bonus-red';
    return 'bonus-black';
  };

  const totalDeals = stats.reduce((sum, stat) => sum + (stat.dealCount || 0), 0);

  // Separera #1 från resten
  const firstPlace = stats.length > 0 ? stats[0] : null;
  const scrollableStats = stats.slice(1); // Alla utom #1

  const renderAgent = (item, index, isFrozen = false) => {
    if (!item) return null;

    const isZeroDeals = !item.dealCount || item.dealCount === 0;
    const uniqueSMS = item.uniqueSMS || 0;
    const smsSuccessRate = item.smsSuccessRate || 0;
    
    return (
      <div 
        key={`${item.userId}-${index}`}
        className={`slideshow-item ${index === 0 && !isZeroDeals && isFrozen ? 'first-place' : ''} ${isZeroDeals ? 'zero-deals' : ''} ${isFrozen ? 'frozen-item' : ''}`}
        style={{ 
          animationDelay: isActive && !isFrozen ? `${index * 0.1}s` : '0s'
        }}
      >
        <div className="slideshow-rank">
          {index === 0 && !isZeroDeals && isFrozen && '🥇'}
          {index === 1 && !isZeroDeals && !isFrozen && '🥈'}
          {index === 2 && !isZeroDeals && !isFrozen && '🥉'}
          {((index > 2 && !isFrozen) || (index > 0 && isFrozen) || isZeroDeals) && `#${index + 1}`}
        </div>

        {item.agent && item.agent.profileImage ? (
          <img
            src={item.agent.profileImage}
            alt={item.agent.name || 'Agent'}
            className="slideshow-avatar"
          />
        ) : (
          <div className="slideshow-avatar-placeholder">
            {item.agent && item.agent.name ? item.agent.name.charAt(0) : '?'}
          </div>
        )}

        <div className="slideshow-info">
          <h3 className={`slideshow-name ${isZeroDeals ? 'zero-deals' : ''}`}>
            {item.agent ? item.agent.name : 'Unknown'}
            {item.agent && item.agent.groupName && (
              <span className="user-group-badge">[{item.agent.groupName}]</span>
            )}
          </h3>
        </div>

        {/* Right columns wrapper - pushed to right edge */}
        <div className="slideshow-right-columns">
          {renderColumnsInOrder(item, leaderboard, isZeroDeals, uniqueSMS, smsSuccessRate)}
        </div>
      </div>
    );
  };

  // Function to render a specific column
  const renderColumn = (columnName, item, leaderboard, isZeroDeals, uniqueSMS, smsSuccessRate) => {
    // Check if column is visible
    if (leaderboard.visibleColumns?.[columnName] === false) {
      return null;
    }

    switch (columnName) {
      case 'dealsPerHour':
        return (
          <div key="dealsPerHour" className="slideshow-deals-per-hour">
            <span className="emoji">🕒</span>
            <span>{item.dealsPerHour?.toFixed(2) || '0.00'}</span>
          </div>
        );

      case 'deals':
        return (
          <div key="deals" className={`slideshow-deals-column ${isZeroDeals ? 'zero' : ''}`}>
            <span className="emoji">🎯</span>
            <span>{item.dealCount || 0}</span>
          </div>
        );

      case 'sms':
        return (
          <div key="sms" className={`slideshow-sms-box ${getSMSBoxClass(smsSuccessRate)}`}>
            <div className="sms-rate">
              {smsSuccessRate.toFixed(2)}%
            </div>
            <div className="sms-count">
              ({uniqueSMS} SMS)
            </div>
          </div>
        );

      case 'commission':
        return (
          <div key="commission" className={`slideshow-commission ${getCommissionClass(item.totalCommission || 0)}`}>
            {(item.totalCommission || 0).toLocaleString('sv-SE')} THB
          </div>
        );

      case 'campaignBonus':
        return (
          <div key="campaignBonus" className={`slideshow-campaign-bonus ${getCampaignBonusClass(item.campaignBonus || 0)}`}>
            <span className="emoji">💰</span>
            <span>{(item.campaignBonus || 0).toLocaleString('sv-SE')} THB</span>
          </div>
        );

      case 'total':
        return (
          <div key="total" className={`slideshow-total ${getTotalClass((item.totalCommission || 0) + (item.campaignBonus || 0))}`}>
            <span className="emoji">💎</span>
            <span>{((item.totalCommission || 0) + (item.campaignBonus || 0)).toLocaleString('sv-SE')} THB</span>
          </div>
        );

      default:
        return null;
    }
  };

  // Function to render columns in configured order
  const renderColumnsInOrder = (item, leaderboard, isZeroDeals, uniqueSMS, smsSuccessRate) => {
    const columnOrder = leaderboard.columnOrder || ['dealsPerHour', 'deals', 'sms', 'commission', 'campaignBonus', 'total'];
    return columnOrder.map(columnName =>
      renderColumn(columnName, item, leaderboard, isZeroDeals, uniqueSMS, smsSuccessRate)
    );
  };

  // Render default table layout (for visualizationMode === 'table')
  const renderDefaultTable = () => (
    <>
      {stats.length === 0 ? (
        <div className="slideshow-no-data">Inga affärer än</div>
      ) : (
        <div className="slideshow-items-wrapper">
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
    </>
  );

  const visualizationMode = leaderboard.visualizationMode || 'table';

  // Determine if we should use new logo system (two separate logos) or legacy fallback
  // Only use legacy fallback if BOTH new logo fields are empty
  const useNewLogoSystem = leaderboard.brandLogo || leaderboard.companyLogo;

  return (
    <div className={`slideshow-slide ${isActive ? 'active' : ''}`}>
      <div className="slideshow-content">
        {/* Hide header for RocketRace - maximize full screen */}
        {visualizationMode !== 'rocket' && (
          <div className="slideshow-header">
            {/* Brand Logo - Left (varumärke) */}
            {(useNewLogoSystem ? leaderboard.brandLogo : leaderboard.logo) ? (
              <div className="slideshow-logo-left">
                <img src={useNewLogoSystem ? leaderboard.brandLogo : leaderboard.logo} alt="Brand Logo" />
              </div>
            ) : (
              <div className="slideshow-logo-left" style={{ visibility: 'hidden' }}></div>
            )}

            {/* Title & Info - Center */}
            <div className="slideshow-header-content">
              <h1>{leaderboard.name}</h1>
              <p className="slideshow-period">{getTimePeriodLabel(leaderboard.timePeriod)}</p>
              <p className="slideshow-stats">
                📊 {totalDeals} affärer totalt • {stats.length} {leaderboard.displayMode === 'groups' ? 'grupper' : 'agenter'}
              </p>
            </div>

            {/* Company Logo - Right (företag) */}
            {leaderboard.companyLogo ? (
              <div className="slideshow-logo-right">
                <img src={leaderboard.companyLogo} alt="Company Logo" />
              </div>
            ) : (
              <div className="slideshow-logo-right" style={{ visibility: 'hidden' }}></div>
            )}
          </div>
        )}

        {/* Use LeaderboardVisualizer for non-table modes */}
        {visualizationMode !== 'table' ? (
          <LeaderboardVisualizer
            leaderboard={leaderboard}
            stats={stats}
            miniStats={miniStats}
            isActive={isActive}
            displaySize={displaySize}
            renderDefaultTable={renderDefaultTable}
          />
        ) : (
          renderDefaultTable()
        )}
      </div>
    </div>
  );
};

const Slideshow = () => {
  const { id } = useParams();
  const [slideshow, setSlideshow] = useState(null);
  const [leaderboardsData, setLeaderboardsData] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentNotification, setCurrentNotification] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  // 🔑 TV ACCESS CODE STATE
  const [hasAccess, setHasAccess] = useState(() => {
    return sessionStorage.getItem('tvSessionId') !== null;
  });
  const [sessionError, setSessionError] = useState(null);

  // 🔥 TV SIZE STATE
  const [displaySize, setDisplaySize] = useState(() => {
    return localStorage.getItem('tv-slideshow-size') || 'normal';
  });

  // ⚡ AUTO-REFRESH SETTINGS
  const [autoRefreshSettings, setAutoRefreshSettings] = useState({
    refreshInterval: 5000,
    showIndicator: true,
    enabled: true
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const intervalRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const refreshIntervalRef = useRef(null);
  const lastOptimisticUpdateRef = useRef(0); // Track last optimistic update
  const ongoingRefreshRef = useRef(null); // Lock to prevent concurrent refreshes
  const lastSuccessfulDataRef = useRef([]); // Keep last successful data as backup

  // 🔄 NEW: Silent stats refresh without affecting scroll
  const refreshStatsOnly = async () => {
    // 🔒 LOCK: If refresh is already ongoing, skip this call
    if (ongoingRefreshRef.current) {
      console.log(`⏳ Refresh already in progress - skipping duplicate call`);
      return;
    }

    // 🛡️ SAFETY: Skip refresh if optimistic update happened recently (< 10 seconds ago)
    // This prevents race condition where server cache overwrites local optimistic updates
    const timeSinceLastOptimistic = Date.now() - lastOptimisticUpdateRef.current;
    if (timeSinceLastOptimistic < 10000) {
      console.log(`⏸️  Skipping refresh - optimistic update ${Math.round(timeSinceLastOptimistic / 1000)}s ago`);
      return;
    }
    console.log('\n🔄 ═══════════════════════════════════════════');
    console.log('🔄 refreshStatsOnly CALLED - Silent stats update');
    console.log(`⏰ Time: ${new Date().toLocaleTimeString()}`);
    console.log('═══════════════════════════════════════════');

    // 🔒 Set lock
    ongoingRefreshRef.current = true;

    try {
      // Get slideshow config
      const slideshowResponse = await getSlideshow(id);
      const slideshowData = slideshowResponse.data;

      const leaderboardsWithStats = [];

      const slidesConfig = slideshowData.slides ||
        (slideshowData.leaderboards || []).map(lbId => ({
          leaderboardId: lbId,
          duration: slideshowData.duration || 30
        }));

      for (let i = 0; i < slidesConfig.length; i++) {
        const slideConfig = slidesConfig[i];
        const slideDuration = slideConfig.duration || slideshowData.duration || 30;

        // Check if this is a quotes slide
        if (slideConfig.type === 'quotes') {
          console.log(`   💬 Refreshing quotes slide ${i + 1}/${slidesConfig.length}`);

          leaderboardsWithStats.push({
            type: 'quotes',
            duration: slideDuration
          });
        }
        // Check if this is a trend chart slide
        else if (slideConfig.type === 'trend') {
          console.log(`   📈 Refreshing trend chart slide ${i + 1}/${slidesConfig.length}`);

          const lbId = slideConfig.leaderboardId;
          try {
            const statsResponse = await getLeaderboardStats2(lbId);
            leaderboardsWithStats.push({
              type: 'trend',
              leaderboard: statsResponse.data.leaderboard,
              config: slideConfig.config || {},
              duration: slideDuration
            });
          } catch (error) {
            console.error(`   ❌ Error refreshing trend ${lbId}:`, error.message);
          }
        }
        // Check if this is a group comparison slide
        else if (slideConfig.type === 'groupComparison') {
          console.log(`   📊 Refreshing group comparison slide ${i + 1}/${slidesConfig.length}`);

          leaderboardsWithStats.push({
            type: 'groupComparison',
            config: slideConfig.config || {},
            duration: slideDuration
          });
        }
        // Otherwise it's a leaderboard slide
        else {
          const lbId = slideConfig.leaderboardId || slideConfig;

          try {
            const statsResponse = await getLeaderboardStats2(lbId);
            const stats = statsResponse.data.stats || [];
            const miniStats = statsResponse.data.miniStats || null;

            leaderboardsWithStats.push({
              type: 'leaderboard',
              leaderboard: statsResponse.data.leaderboard,
              stats: stats,
              miniStats: miniStats,
              duration: slideDuration
            });

            const totalDeals = stats.reduce((sum, s) => sum + (s.dealCount || 0), 0);
            console.log(`   🔄 Refreshed "${statsResponse.data.leaderboard.name}": ${stats.length} agents, ${totalDeals} deals`);

            if (i < slidesConfig.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch (error) {
            console.error(`   ❌ Error refreshing leaderboard ${lbId}:`, error.message);
            // On error, use last successful data for this slide (don't push empty data)
            const existingSlide = lastSuccessfulDataRef.current.find(s =>
              s.type === 'leaderboard' && s.leaderboard?.id === lbId
            );
            if (existingSlide) {
              console.log(`   📦 Using backup data for ${lbId} due to error`);
              leaderboardsWithStats.push(existingSlide);
            }
          }
        }
      }

      // 🛡️ SAFETY: Only update if we got valid data for all slides
      if (leaderboardsWithStats.length === slidesConfig.length) {
        // Save as last successful data before updating state
        lastSuccessfulDataRef.current = leaderboardsWithStats;

        // Update ONLY the leaderboardsData state - do NOT touch refreshKey!
        setLeaderboardsData(leaderboardsWithStats);
        console.log('✅ Stats refreshed silently - scroll position preserved');
      } else {
        console.warn(`⚠️ Incomplete refresh: got ${leaderboardsWithStats.length}/${slidesConfig.length} slides - keeping old data`);
      }
      console.log('═══════════════════════════════════════════\n');

    } catch (error) {
      console.error('❌ Error refreshing stats:', error);
    } finally {
      // 🔓 Release lock
      ongoingRefreshRef.current = null;
    }
  };

  // ⚡ NEW: Optimistic update from Socket.io event (instant!)
  const applyOptimisticUpdate = (notification) => {
    console.log('\n⚡ ═══════════════════════════════════════════');
    console.log('⚡ applyOptimisticUpdate - Instant leaderboard update');
    console.log(`⏰ Time: ${new Date().toLocaleTimeString()}`);

    if (!notification || !notification.agent) {
      console.log('❌ No notification data');
      return;
    }

    // 🛡️ SAFETY: Track timestamp of optimistic update
    // This prevents refreshStatsOnly from overwriting our changes too soon
    lastOptimisticUpdateRef.current = Date.now();

    const userId = notification.agent.userId || notification.agent.id;
    const newCommission = parseFloat(notification.commission || 0);
    const multiDeals = parseInt(notification.multiDeals || '1');

    console.log(`💰 Agent ${userId} (${notification.agent.name}): +${newCommission} THB, +${multiDeals} deals`);

    // Update all leaderboards in slideshow
    setLeaderboardsData(prevData => {
      return prevData.map(leaderboardSlide => {
        // Skip quotes and trend slides
        if (leaderboardSlide.type === 'quotes' || leaderboardSlide.type === 'trend') {
          return leaderboardSlide;
        }

        const stats = [...leaderboardSlide.stats];

        // Find agent in this leaderboard
        let agentIndex = stats.findIndex(s => String(s.userId) === String(userId));

        if (agentIndex === -1) {
          console.log(`  ➕ Agent ${userId} not in stats yet - adding them`);

          // Agent not in leaderboard yet - add them with this first deal
          const newAgent = {
            userId: userId,
            dealCount: multiDeals,
            totalCommission: newCommission,
            uniqueSMS: 0,
            smsSuccessRate: 0,
            campaignBonus: 0,
            campaignBonusDetails: [],
            loginSeconds: 0,
            loginHours: 0,
            dealsPerHour: 0,
            agent: {
              id: userId,
              userId: userId,
              name: notification.agent.name || `Agent ${userId}`,
              email: notification.agent.email || '',
              profileImage: notification.agent.profileImage || null,
              groupName: notification.agent.groupName || null
            }
          };

          stats.push(newAgent);
          agentIndex = stats.length - 1;
        } else {
          // Update existing agent's stats optimistically
          stats[agentIndex] = {
            ...stats[agentIndex],
            totalCommission: (stats[agentIndex].totalCommission || 0) + newCommission,
            dealCount: (stats[agentIndex].dealCount || 0) + multiDeals
          };
        }

        console.log(`  ✅ Updated ${notification.agent.name}: ${stats[agentIndex].totalCommission} THB, ${stats[agentIndex].dealCount} deals`);

        // Re-sort by commission (this makes agents jump up/down in ranking instantly!)
        stats.sort((a, b) => b.totalCommission - a.totalCommission);

        // 🔥 CRITICAL: Create completely new objects to force React re-render
        // This ensures that even if agents switch positions (like #2 becoming #1),
        // React will detect the change and re-render the frozen #1 section
        const refreshedStats = stats.map(stat => ({...stat}));

        // Log the new #1 to verify ranking changed
        if (refreshedStats.length > 0) {
          console.log(`  🥇 New #1: ${refreshedStats[0].agent?.name} with ${refreshedStats[0].totalCommission} THB`);
        }

        return {
          ...leaderboardSlide,
          stats: refreshedStats
        };
      });
    });

    console.log('⚡ Optimistic update complete - stats updated INSTANTLY!');
    console.log('═══════════════════════════════════════════\n');
  };

  const fetchSlideshowData = async (silent = false) => {
    console.log('\n🔥 ═══════════════════════════════════════════');
    console.log(`🔥 fetchSlideshowData CALLED! silent=${silent}`);
    console.log(`⏰ Time: ${new Date().toLocaleTimeString()}`);
    console.log('═══════════════════════════════════════════');
    
    try {
      if (!silent) {
        console.log('📊 Setting loading state...');
        setIsLoading(true);
      }
      
      console.log(`📡 Fetching slideshow ${id}...`);
      const slideshowResponse = await getSlideshow(id);
      const slideshowData = slideshowResponse.data;
      
      console.log('✅ Slideshow data received:', {
        type: slideshowData.type,
        leaderboards: slideshowData.leaderboards?.length || 0,
        slides: slideshowData.slides?.length || 0,
        dualSlides: slideshowData.dualSlides?.length || 0
      });
      
      if (!silent) {
        setSlideshow(slideshowData);
      }
      
      console.log('📊 Processing slides...');
        const leaderboardsWithStats = [];
        
        // ⭐ NYTT: Stöd för både slides (nya formatet) och leaderboards (gamla formatet)
        const slidesConfig = slideshowData.slides || 
          (slideshowData.leaderboards || []).map(lbId => ({
            leaderboardId: lbId,
            duration: slideshowData.duration || 30
          }));
        
        for (let i = 0; i < slidesConfig.length; i++) {
          const slideConfig = slidesConfig[i];
          const slideDuration = slideConfig.duration || slideshowData.duration || 30;

          // Check if this is a quotes slide
          if (slideConfig.type === 'quotes') {
            console.log(`   💬 Adding quotes slide ${i + 1}/${slidesConfig.length} (Duration: ${slideDuration}s)`);

            leaderboardsWithStats.push({
              type: 'quotes',
              duration: slideDuration
            });

            console.log(`   ✅ Quotes slide added`);
          }
          // Check if this is a trend chart slide
          else if (slideConfig.type === 'trend') {
            console.log(`   📈 Adding trend chart slide ${i + 1}/${slidesConfig.length} (Duration: ${slideDuration}s)`);

            // Get leaderboard config for trend
            const lbId = slideConfig.leaderboardId;
            try {
              const statsResponse = await getLeaderboardStats2(lbId);
              leaderboardsWithStats.push({
                type: 'trend',
                leaderboard: statsResponse.data.leaderboard,
                config: slideConfig.config || {},
                duration: slideDuration
              });
              console.log(`   ✅ Trend slide added for "${statsResponse.data.leaderboard.name}"`);
            } catch (error) {
              console.error(`   ❌ Error loading leaderboard for trend ${lbId}:`, error.message);
            }
          }
          // Otherwise it's a leaderboard slide
          else {
            const lbId = slideConfig.leaderboardId || slideConfig;

            console.log(`   📈 Loading leaderboard ${i + 1}/${slidesConfig.length} (ID: ${lbId}, Duration: ${slideDuration}s)`);

            try {
              const statsResponse = await getLeaderboardStats2(lbId);
              const stats = statsResponse.data.stats || [];
              const miniStats = statsResponse.data.miniStats || null;

              leaderboardsWithStats.push({
                type: 'leaderboard',
                leaderboard: statsResponse.data.leaderboard,
                stats: stats,
                miniStats: miniStats,
                duration: slideDuration // ⭐ VIKTIGT: Lägg till duration här!
              });

              const totalDeals = stats.reduce((sum, s) => sum + (s.dealCount || 0), 0);
              console.log(`   ✅ Loaded "${statsResponse.data.leaderboard.name}": ${stats.length} agents, ${totalDeals} deals, ${slideDuration}s`);

              if (i < slidesConfig.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            } catch (error) {
              console.error(`   ❌ Error loading leaderboard ${lbId}:`, error.message);
            }
          }
        }

        console.log(`✅ Setting ${leaderboardsWithStats.length} slides to state...`);
        lastSuccessfulDataRef.current = leaderboardsWithStats; // Save as backup
        setLeaderboardsData(leaderboardsWithStats);

      console.log(`🔑 Updating refreshKey from ${refreshKey} to ${refreshKey + 1}`);
      setRefreshKey(prev => prev + 1);
      
      console.log('✅ Setting loading to false');
      setIsLoading(false);
      
      console.log('🎉 fetchSlideshowData COMPLETE!');
      console.log('═══════════════════════════════════════════\n');
      
    } catch (error) {
      console.error('\n❌ ═══════════════════════════════════════════');
      console.error('❌ Error fetching slideshow:', error);
      console.error('═══════════════════════════════════════════\n');
      setIsLoading(false);
    }
  };

  // ⚡ Load auto-refresh settings on mount
  useEffect(() => {
    const loadAutoRefreshSettings = async () => {
      try {
        const response = await getAutoRefreshSettings();
        setAutoRefreshSettings(response.data.settings);
        console.log('⚡ Auto-refresh settings loaded:', response.data.settings);
      } catch (error) {
        console.error('❌ Error loading auto-refresh settings:', error);
        // Use defaults if loading fails
      }
    };
    loadAutoRefreshSettings();
  }, []);

  // 💓 Session heartbeat - keep session alive (every 30 seconds)
  useEffect(() => {
    if (!hasAccess) return;

    const sessionId = sessionStorage.getItem('tvSessionId');
    if (!sessionId) {
      setHasAccess(false);
      return;
    }

    // Send initial heartbeat
    const sendHeartbeat = async () => {
      try {
        const response = await sendSessionHeartbeat(sessionId);
        console.log('💓 Heartbeat sent successfully');
      } catch (error) {
        console.error('❌ Heartbeat failed:', error);

        // Check if session was terminated
        if (error.response?.status === 401) {
          const reason = error.response.data?.reason;
          const terminatedReason = error.response.data?.terminatedReason;

          console.log(`🔒 Session invalid: ${reason}`);
          if (terminatedReason) {
            console.log(`   Reason: ${terminatedReason}`);
            setSessionError(terminatedReason);
          }

          // Clear session and force re-authentication
          sessionStorage.removeItem('tvSessionId');
          sessionStorage.removeItem('tvAccessGranted');
          sessionStorage.removeItem('tvSessionExpires');
          setHasAccess(false);
        }
      }
    };

    // Send heartbeat every 30 seconds
    const heartbeatInterval = setInterval(sendHeartbeat, 30 * 1000);
    sendHeartbeat(); // Send immediately

    return () => {
      clearInterval(heartbeatInterval);
    };
  }, [hasAccess]);

  useEffect(() => {
    fetchSlideshowData();

    // 🔄 Regular refresh every 20 seconds (silent, preserves scroll)
    refreshIntervalRef.current = setInterval(() => {
      console.log('⏰ 20-second interval - refreshing stats silently');
      refreshStatsOnly();
    }, 20 * 1000);

    socketService.connect();

    const handleNewDeal = (notification) => {
      if (notification && notification.agent && notification.agent.name) {
        // Show popup notification
        setCurrentNotification(notification);

        // ⚡ INSTANT UPDATE: Apply optimistic update immediately using Socket.io data
        applyOptimisticUpdate(notification);

        // Full refresh kommer triggas automatiskt från handleNotificationComplete efter konfigurerbar delay
        // Detta säkerställer att vi har korrekt data (SMS stats etc.) efter den optimistiska uppdateringen
      }
    };

    // ⚡ NEW: Handle leaderboard refresh event (triggered after deal + SMS sync)
    const handleLeaderboardRefresh = async (data) => {
      console.log(`\n⚡ LEADERBOARD REFRESH EVENT RECEIVED`);
      console.log(`   Reason: ${data.reason}`);
      console.log(`   Lead ID: ${data.leadId}`);
      console.log(`   User ID: ${data.userId}`);
      console.log(`   Commission: ${data.commission} THB`);

      // 🛡️ IMPORTANT: Wait a bit to ensure backend cache has been updated
      // This event is triggered immediately after deal is saved, but cache
      // reload might not have completed yet
      console.log(`   ⏰ Waiting 2 seconds for backend cache to update...`);
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log(`   🔄 Triggering silent refresh...`);

      // Trigger silent refresh (respects optimistic update debounce)
      await refreshStatsOnly();

      console.log(`   ✅ Refresh complete - stats are now up to date`);
    };

    socketService.on('new_deal', handleNewDeal);
    socketService.on('leaderboard_refresh', handleLeaderboardRefresh);

    return () => {
      socketService.off('new_deal', handleNewDeal);
      socketService.off('leaderboard_refresh', handleLeaderboardRefresh);
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [id]);

  useEffect(() => {
    if (leaderboardsData.length === 0 || !slideshow) return;

    // 🔥 FIX: Only run on mount and when data changes, NOT when currentIndex changes
    if (leaderboardsData.length <= 1) {
      console.log('⏭️  Only 1 slide, no rotation needed');
      return;
    }

    const currentSlide = leaderboardsData[currentIndex];

    // ⭐ UPPDATERAT: Använd slide-specifik duration om den finns
    const duration = (currentSlide?.duration || slideshow.duration || 15) * 1000;

    console.log(`⏱️  Slide ${currentIndex + 1}/${leaderboardsData.length} - duration: ${duration / 1000}s`);

    setProgress(0);

    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) return 0;
        return prev + (100 / (duration / 100));
      });
    }, 100);

    intervalRef.current = setInterval(() => {
      console.log(`⏰ Interval fired! Switching from slide ${currentIndex + 1} to next slide`);
      setProgress(0);
      setCurrentIndex((prev) => {
        const next = (prev + 1) % leaderboardsData.length;
        console.log(`   ↪️  Next index: ${next + 1}/${leaderboardsData.length}`);
        return next;
      });
    }, duration);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [leaderboardsData.length, slideshow, currentIndex]);  // 🔥 Use .length instead of full array!

  const handleNotificationComplete = () => {
    console.log('🎉 Notification complete - checking auto-refresh settings...');
    setCurrentNotification(null);

    // ⚡ Check if auto-refresh is enabled
    if (!autoRefreshSettings.enabled) {
      console.log('⏸️ Auto-refresh is disabled - skipping refresh');
      return;
    }

    const delay = autoRefreshSettings.refreshInterval || 5000;
    console.log(`⏰ Waiting ${delay}ms before silent refresh...`);

    // ⚡ Show indicator if enabled
    if (autoRefreshSettings.showIndicator) {
      setIsRefreshing(true);
    }

    setTimeout(async () => {
      console.log(`⏰ ${delay}ms passed - triggering SILENT refresh (scroll preserved)!`);

      // Use refreshStatsOnly instead of fetchSlideshowData to preserve scroll
      await refreshStatsOnly();

      // Hide indicator after refresh
      if (autoRefreshSettings.showIndicator) {
        setTimeout(() => setIsRefreshing(false), 1000);
      }
    }, delay);
  };

  // 🔑 Show access code modal if not granted
  if (!hasAccess) {
    return <TVAccessCodeModal onAccessGranted={() => {
      setHasAccess(true);
      setSessionError(null);
    }} sessionError={sessionError} />;
  }

  if (isLoading) {
    return (
      <div className="slideshow-container">
        <div className="slideshow-loading">
          <h1>🏆 Sweet TV</h1>
          <p>Laddar slideshow...</p>
        </div>
      </div>
    );
  }

  if (!slideshow || leaderboardsData.length === 0) {
    return (
      <div className="slideshow-container">
        <div className="slideshow-error">
          <h1>❌ Slideshow inte hittad</h1>
          <p>Kontrollera att slideshow är aktiverad i admin-panelen</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`slideshow-container size-${displaySize}`} key={refreshKey}>
      {/* 🔥 TV SIZE CONTROL */}
      <TVSizeControl
        currentSize={displaySize}
        onSizeChange={setDisplaySize}
      />

      {/* ⚡ AUTO-REFRESH INDICATOR */}
      {isRefreshing && autoRefreshSettings.showIndicator && (
        <div className="auto-refresh-indicator">
          <div className="refresh-spinner"></div>
          <span>Uppdaterar...</span>
        </div>
      )}

      <div className="slideshow-progress-bar">
        <div
          className="slideshow-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="slideshow-indicators">
        {leaderboardsData.map((_, index) => (
          <div 
            key={index}
            className={`indicator ${index === currentIndex ? 'active' : ''}`}
          />
        ))}
      </div>

      {leaderboardsData.map((slideData, index) => {
        const isActive = index === currentIndex;

        // Render quotes slide if type is 'quotes'
        if (slideData.type === 'quotes') {
          return (
            <div
              key={`slide-quotes-${index}-${refreshKey}`}
              className={`slideshow-slide ${isActive ? 'active' : ''}`}
            >
              <QuotesSlide
                isActive={isActive}
                tvSize={displaySize}
              />
            </div>
          );
        }

        // Render trend chart slide if type is 'trend'
        if (slideData.type === 'trend') {
          // CRITICAL: Handle undefined trendDays/trendHours from old leaderboards
          // If both are undefined, default to 7 days (weekly view) to avoid using TrendChartSlide's 30-day default
          const hasTrendConfig = slideData.leaderboard.trendDays !== undefined || slideData.leaderboard.trendHours !== undefined;

          const trendConfig = {
            leaderboardId: slideData.leaderboard.id,
            days: slideData.leaderboard.trendDays !== undefined ? slideData.leaderboard.trendDays : (slideData.leaderboard.trendHours ? undefined : 7),
            hours: slideData.leaderboard.trendHours,
            metrics: slideData.leaderboard.trendMetrics || [{ metric: 'commission', axis: 'left' }],
            refreshInterval: slideData.leaderboard.refreshInterval || 300000
            // DO NOT spread slideData.config - old hardcoded values will override leaderboard settings
          };

          console.log(`📊 Rendering trend slide for leaderboard "${slideData.leaderboard.name}":`);
          console.log(`   trendDays from leaderboard: ${slideData.leaderboard.trendDays}`);
          console.log(`   trendHours from leaderboard: ${slideData.leaderboard.trendHours}`);
          console.log(`   hasTrendConfig: ${hasTrendConfig}`);
          console.log(`   Final config:`, trendConfig);

          return (
            <div
              key={`slide-trend-${index}-${refreshKey}`}
              className={`slideshow-slide ${isActive ? 'active' : ''}`}
            >
              <TrendChartSlide
                leaderboard={slideData.leaderboard}
                isActive={isActive}
                config={trendConfig}
              />
            </div>
          );
        }

        // Render group comparison slide if type is 'groupComparison'
        if (slideData.type === 'groupComparison') {
          return (
            <div
              key={`slide-comparison-${index}-${refreshKey}`}
              className={`slideshow-slide ${isActive ? 'active' : ''}`}
            >
              <GroupComparisonSlide
                isActive={isActive}
                config={slideData.config || {}}
              />
            </div>
          );
        }

        // Render metrics grid slide if leaderboard type is 'metrics-grid'
        if (slideData.leaderboard?.type === 'metrics-grid') {
          return (
            <div
              key={`slide-metrics-grid-${slideData.leaderboard.id}-${refreshKey}`}
              className={`slideshow-slide ${isActive ? 'active' : ''}`}
            >
              <MetricsGridSlide
                leaderboard={slideData.leaderboard}
                isActive={isActive}
                displaySize={displaySize}
                refreshKey={refreshKey}
              />
            </div>
          );
        }

        // Render team battle slide if leaderboard type is 'team-battle'
        if (slideData.leaderboard?.type === 'team-battle') {
          return (
            <div
              key={`slide-team-battle-${slideData.leaderboard.id}-${refreshKey}`}
              className={`slideshow-slide ${isActive ? 'active' : ''}`}
            >
              <TeamBattleSlide
                leaderboard={slideData.leaderboard}
                isActive={isActive}
                displaySize={displaySize}
                refreshKey={refreshKey}
              />
            </div>
          );
        }

        // Render trend chart slide if leaderboard type is 'trend-chart'
        if (slideData.leaderboard?.type === 'trend-chart') {
          return (
            <div
              key={`slide-trend-chart-${slideData.leaderboard.id}-${refreshKey}`}
              className={`slideshow-slide ${isActive ? 'active' : ''}`}
            >
              <TrendChartSlide
                leaderboard={slideData.leaderboard}
                config={{
                  leaderboardId: slideData.leaderboard.id,
                  days: slideData.leaderboard.trendDays,
                  hours: slideData.leaderboard.trendHours,
                  metrics: slideData.leaderboard.trendMetrics,
                  refreshInterval: slideData.leaderboard.refreshInterval || 300000
                }}
                isActive={isActive}
                displaySize={displaySize}
              />
            </div>
          );
        }

        // Otherwise render standard leaderboard slide
        return (
          <LeaderboardSlide
            key={`slide-${slideData.leaderboard.id}-${refreshKey}`}
            leaderboard={slideData.leaderboard}
            stats={slideData.stats}
            miniStats={slideData.miniStats}
            isActive={isActive}
            displaySize={displaySize}
            refreshKey={refreshKey}
          />
        );
      })}

      {currentNotification && (
        <DealNotification
          notification={currentNotification}
          onComplete={handleNotificationComplete}
        />
      )}
    </div>
  );
};

export default Slideshow;
