// frontend/src/pages/Slideshow.jsx
// 🔥 AUTO-SCROLL VERSION - Visar ALLA agenter med smooth scroll
// ⭐ UPDATED: Stöd för individuell duration per slide
console.log('🔥🔥🔥 SLIDESHOW.JSX LOADED - VERSION: INDIVIDUAL-DURATION');

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import socketService from '../services/socket';
import { getSlideshow, getLeaderboardStats2, getAutoRefreshSettings } from '../services/api';
import DealNotification from '../components/DealNotification';
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
const LeaderboardSlide = ({ leaderboard, stats, isActive, displaySize, refreshKey }) => {
  const scrollContainerRef = useRef(null);
  const scrollContentRef = useRef(null);

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

  const getCommissionClass = (commission, timePeriod) => {
    if (!commission || commission === 0) return 'zero';
    if (timePeriod === 'day') return commission < 3400 ? 'low' : 'high';
    if (timePeriod === 'week') return commission < 18000 ? 'low' : 'high';
    return commission < 50000 ? 'low' : 'high';
  };

  const getSMSBoxClass = (successRate) => {
    if (successRate >= 75) return 'sms-green';
    if (successRate >= 60) return 'sms-orange';
    return 'sms-red';
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
          </h3>
        </div>

        {/* Conditional rendering based on visibleColumns */}
        {leaderboard.visibleColumns?.deals !== false && (
          <div className={`slideshow-deals-column ${isZeroDeals ? 'zero' : ''}`}>
            <span className="emoji">🎯</span>
            <span>{item.dealCount || 0} affärer</span>
          </div>
        )}

        {leaderboard.visibleColumns?.sms !== false && (
          <div className={`slideshow-sms-box ${getSMSBoxClass(smsSuccessRate)}`}>
            <div className="sms-rate">
              {smsSuccessRate.toFixed(2)}%
            </div>
            <div className="sms-count">
              ({uniqueSMS} SMS)
            </div>
          </div>
        )}

        {leaderboard.visibleColumns?.commission !== false && (
          <div className={`slideshow-commission ${getCommissionClass(item.totalCommission || 0, leaderboard.timePeriod)}`}>
            {(item.totalCommission || 0).toLocaleString('sv-SE')} THB
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`slideshow-slide ${isActive ? 'active' : ''}`}>
      <div className="slideshow-content">
        <div className="slideshow-header">
          <h1>{leaderboard.name}</h1>
          <p className="slideshow-period">{getTimePeriodLabel(leaderboard.timePeriod)}</p>
          <p className="slideshow-stats">📊 {totalDeals} affärer totalt • {stats.length} agenter</p>
        </div>

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

  // 🔄 NEW: Silent stats refresh without affecting scroll
  const refreshStatsOnly = async () => {
    console.log('\n🔄 ═══════════════════════════════════════════');
    console.log('🔄 refreshStatsOnly CALLED - Silent stats update');
    console.log(`⏰ Time: ${new Date().toLocaleTimeString()}`);
    console.log('═══════════════════════════════════════════');

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
        const lbId = slideConfig.leaderboardId || slideConfig;
        const slideDuration = slideConfig.duration || slideshowData.duration || 30;

        try {
          const statsResponse = await getLeaderboardStats2(lbId);
          const stats = statsResponse.data.stats || [];

          leaderboardsWithStats.push({
            leaderboard: statsResponse.data.leaderboard,
            stats: stats,
            duration: slideDuration
          });

          const totalDeals = stats.reduce((sum, s) => sum + (s.dealCount || 0), 0);
          console.log(`   🔄 Refreshed "${statsResponse.data.leaderboard.name}": ${stats.length} agents, ${totalDeals} deals`);

          if (i < slidesConfig.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          console.error(`   ❌ Error refreshing leaderboard ${lbId}:`, error.message);
        }
      }

      // Update ONLY the leaderboardsData state - do NOT touch refreshKey!
      setLeaderboardsData(leaderboardsWithStats);

      console.log('✅ Stats refreshed silently - scroll position preserved');
      console.log('═══════════════════════════════════════════\n');

    } catch (error) {
      console.error('❌ Error refreshing stats:', error);
    }
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
          const lbId = slideConfig.leaderboardId || slideConfig;
          const slideDuration = slideConfig.duration || slideshowData.duration || 30;
          
          console.log(`   📈 Loading leaderboard ${i + 1}/${slidesConfig.length} (ID: ${lbId}, Duration: ${slideDuration}s)`);
          
          try {
            const statsResponse = await getLeaderboardStats2(lbId);
            const stats = statsResponse.data.stats || [];
            
            leaderboardsWithStats.push({
              leaderboard: statsResponse.data.leaderboard,
              stats: stats,
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

        console.log(`✅ Setting ${leaderboardsWithStats.length} slides to state...`);
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

  useEffect(() => {
    fetchSlideshowData();

    // 🔄 Regular refresh every 2 minutes (silent, preserves scroll)
    refreshIntervalRef.current = setInterval(() => {
      console.log('⏰ 2-minute interval - refreshing stats silently');
      refreshStatsOnly();
    }, 2 * 60 * 1000);

    socketService.connect();

    const handleNewDeal = (notification) => {
      if (notification && notification.agent && notification.agent.name) {
        setCurrentNotification(notification);

        // Refresh kommer triggas automatiskt från handleNotificationComplete efter konfigurerbar delay!
      }
    };

    socketService.on('new_deal', handleNewDeal);

    return () => {
      socketService.off('new_deal', handleNewDeal);
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

    const currentSlide = leaderboardsData[currentIndex];
    
    // ⭐ UPPDATERAT: Använd slide-specifik duration om den finns
    const duration = (currentSlide?.duration || slideshow.duration || 15) * 1000;
    
    console.log(`⏱️  Slide ${currentIndex + 1} duration: ${duration / 1000}s`);
    
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
      setProgress(0);
      setCurrentIndex((prev) => (prev + 1) % leaderboardsData.length);
    }, duration);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [leaderboardsData, slideshow, currentIndex]);

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

        return (
          <LeaderboardSlide
            key={`slide-${slideData.leaderboard.id}-${refreshKey}`}
            leaderboard={slideData.leaderboard}
            stats={slideData.stats}
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
