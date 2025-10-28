// frontend/src/pages/Slideshow.jsx
// ✨ UPPDATERAD: Nu med stöd för Live Leaderboards från Adversus (med SMS!)

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import socketService from '../services/socket';
import { getSlideshow, getLeaderboardStats2, syncDealsFromAdversus, syncSMSFromAdversus } from '../services/api';
import DealNotification from '../components/DealNotification';
import DualLeaderboardSlide from '../components/DualLeaderboardSlide';
import '../components/DealNotification.css';
import './Slideshow.css';

const LeaderboardSlide = ({ leaderboard, stats, isActive }) => {
  const getTimePeriodLabel = (period) => {
    const labels = {
      day: 'Idag',
      week: 'Denna vecka',
      month: 'Denna månad',
      custom: 'Anpassat'
    };
    return labels[period] || period;
  };

  const getCommissionClass = (commission) => {
    if (commission === 0) return 'zero';
    if (commission < 3400) return 'low';
    return 'high';
  };

  const totalDeals = stats.reduce((sum, stat) => sum + stat.dealCount, 0);

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
          <div className="slideshow-items">
            {stats.slice(0, 20).map((item, index) => {
              const isZeroDeals = item.dealCount === 0;
              
              return (
                <div 
                  key={item.userId} 
                  className={`slideshow-item ${index === 0 && !isZeroDeals ? 'first-place' : ''} ${isZeroDeals ? 'zero-deals' : ''}`}
                  style={{ 
                    animationDelay: isActive ? `${index * 0.1}s` : '0s'
                  }}
                >
                  <div className="slideshow-rank">
                    {index === 0 && !isZeroDeals && '🥇'}
                    {index === 1 && !isZeroDeals && '🥈'}
                    {index === 2 && !isZeroDeals && '🥉'}
                    {(index > 2 || isZeroDeals) && `#${index + 1}`}
                  </div>
                  
                  {item.agent.profileImage ? (
                    <img 
                      src={item.agent.profileImage} 
                      alt={item.agent.name}
                      className="slideshow-avatar"
                    />
                  ) : (
                    <div className="slideshow-avatar-placeholder">
                      {item.agent.name?.charAt(0) || '?'}
                    </div>
                  )}
                  
                  <div className="slideshow-info">
                    <h3 className={`slideshow-name ${isZeroDeals ? 'zero-deals' : ''}`}>
                      {item.agent.name}
                    </h3>
                  </div>
                  
                  <div className={`slideshow-deals-column ${isZeroDeals ? 'zero' : ''}`}>
                    <span className="emoji">🎯</span>
                    <span>{item.dealCount} affärer</span>
                  </div>
                  
                  <div className={`slideshow-commission ${getCommissionClass(item.totalCommission)}`}>
                    {item.totalCommission.toLocaleString('sv-SE')} THB
                  </div>
                </div>
              );
            })}
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
  const intervalRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const refreshIntervalRef = useRef(null);
  const adversusSyncRef = useRef(null);

  // ✨ NYTT: Synka Adversus-data (deals + SMS)
  const syncAdversusData = async (silent = false) => {
    try {
      if (!silent) {
        console.log('🔄 Synkar deals och SMS från Adversus...');
      }
      
      await Promise.all([
        syncDealsFromAdversus(),
        syncSMSFromAdversus()
      ]);
      
      if (!silent) {
        console.log('✅ Adversus-data synkad!');
      }
    } catch (error) {
      console.error('❌ Fel vid synkning av Adversus-data:', error);
      // Fortsätt ändå - befintliga leaderboards fungerar fortfarande
    }
  };

  // ✨ UPPDATERAD: Helper för att hämta stats (med stöd för live leaderboards)
  const getStatsForLeaderboard = async (lbId) => {
    // Kolla om det är en "live" leaderboard från Adversus
    if (lbId === 'live-today' || lbId === 'live-month') {
      console.log(`📊 Hämtar ${lbId} från Adversus cache...`);
      const response = await getLeaderboardStats2(lbId);
      return response;
    } else {
      // Befintlig logik för vanliga leaderboards
      return await getLeaderboardStats2(lbId);
    }
  };

  // ✨ UPPDATERAD: Fetch slideshow med stöd för både single och dual mode + live leaderboards
  const fetchSlideshowData = async (silent = false) => {
    try {
      if (!silent) {
        setIsLoading(true);
      }
      
      const slideshowResponse = await getSlideshow(id);
      const slideshowData = slideshowResponse.data;
      setSlideshow(slideshowData);
      
      console.log('📺 Slideshow data:', slideshowData);
      
      // ✨ NYTT: Hantera både single och dual mode
      if (slideshowData.type === 'dual' && slideshowData.dualSlides) {
        // Dual mode
        if (!silent) {
          console.log(`📺 Dual Slideshow "${slideshowData.name}" with ${slideshowData.dualSlides.length} dual slides`);
        }
        
        const dualSlidesData = [];
        
        for (let i = 0; i < slideshowData.dualSlides.length; i++) {
          const dualSlide = slideshowData.dualSlides[i];
          
          try {
            if (!silent) {
              console.log(`📈 Loading dual slide ${i + 1}/${slideshowData.dualSlides.length}`);
              console.log(`  Left: ${dualSlide.left}, Right: ${dualSlide.right}`);
            }
            
            // ✨ UPPDATERAD: Använd nya helper-funktionen
            const [leftStatsRes, rightStatsRes] = await Promise.all([
              getStatsForLeaderboard(dualSlide.left),
              getStatsForLeaderboard(dualSlide.right)
            ]);
            
            dualSlidesData.push({
              type: 'dual',
              duration: dualSlide.duration,
              leftLeaderboard: leftStatsRes.data.leaderboard,
              rightLeaderboard: rightStatsRes.data.leaderboard,
              leftStats: leftStatsRes.data.stats || [],
              rightStats: rightStatsRes.data.stats || []
            });
            
            if (!silent) {
              console.log(`✅ Loaded dual slide (${leftStatsRes.data.stats?.length || 0} + ${rightStatsRes.data.stats?.length || 0} agents)`);
            }
            
            // Delay mellan slides
            if (i < slideshowData.dualSlides.length - 1) {
              if (!silent) console.log('⏳ Waiting 3s...');
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
          } catch (error) {
            console.error(`❌ Error loading dual slide:`, error);
            if (error.response?.status === 429) {
              console.log('⏰ Rate limit! Waiting 10s...');
              await new Promise(resolve => setTimeout(resolve, 10000));
            }
          }
        }
        
        setLeaderboardsData(dualSlidesData);
        
      } else {
        // Single mode (original logic)
        if (!silent) {
          console.log(`📺 Single Slideshow "${slideshowData.name}" with ${slideshowData.leaderboards.length} leaderboards`);
        }
        
        const leaderboardsWithStats = [];
        
        for (let i = 0; i < slideshowData.leaderboards.length; i++) {
          const lbId = slideshowData.leaderboards[i];
          
          try {
            if (!silent) {
              console.log(`📈 Loading leaderboard ${i + 1}/${slideshowData.leaderboards.length}`);
            }
            
            // ✨ UPPDATERAD: Använd nya helper-funktionen
            const statsResponse = await getStatsForLeaderboard(lbId);
            
            leaderboardsWithStats.push({
              type: 'single',
              leaderboard: statsResponse.data.leaderboard,
              stats: statsResponse.data.stats || []
            });
            
            if (!silent) {
              console.log(`✅ Loaded (${statsResponse.data.stats?.length || 0} agents)`);
            }
            
            // Delay mellan leaderboards
            if (i < slideshowData.leaderboards.length - 1) {
              if (!silent) console.log('⏳ Waiting 3s...');
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
          } catch (error) {
            console.error(`❌ Error loading leaderboard ${lbId}:`, error);
            if (error.response?.status === 429) {
              console.log('⏰ Rate limit! Waiting 10s...');
              await new Promise(resolve => setTimeout(resolve, 10000));
            }
          }
        }
        
        setLeaderboardsData(leaderboardsWithStats);
      }
      
      if (!silent) {
        console.log(`✅ Loaded slideshow successfully`);
      } else {
        console.log(`🔄 Silent refresh complete`);
      }
      
      setIsLoading(false);
      
    } catch (error) {
      console.error('Error fetching slideshow:', error);
      setIsLoading(false);
    }
  };

  // ✨ UPPDATERAD: Initial load med Adversus-synkning
  useEffect(() => {
    const initializeSlideshow = async () => {
      // Synka Adversus-data först
      await syncAdversusData(false);
      
      // Sedan ladda slideshow
      await fetchSlideshowData();
    };

    initializeSlideshow();
    
    // ✨ NYTT: Auto-synk av Adversus-data varje 5 minuter
    adversusSyncRef.current = setInterval(() => {
      console.log('🔄 Auto-synk: Uppdaterar Adversus-data...');
      syncAdversusData(true);
    }, 5 * 60 * 1000); // 5 minuter
    
    // Befintlig auto-refresh av slideshow-data (varje 2 min)
    refreshIntervalRef.current = setInterval(() => {
      console.log('🔄 Auto-refresh: Updating leaderboard data...');
      fetchSlideshowData(true);
    }, 2 * 60 * 1000);
    
    socketService.connect();

    const handleNewDeal = (notification) => {
      console.log('🎉 New deal:', notification);
      
      if (notification.agent && 
          notification.agent.name && 
          notification.agent.name !== 'Agent null') {
        setCurrentNotification(notification);
      }
      
      setTimeout(() => {
        console.log('🔄 Deal received: Refreshing data...');
        // Synka Adversus-data och uppdatera slideshow
        syncAdversusData(true).then(() => {
          fetchSlideshowData(true);
        });
      }, 5000);
    };

    socketService.onNewDeal(handleNewDeal);

    return () => {
      socketService.offNewDeal(handleNewDeal);
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      if (adversusSyncRef.current) {
        clearInterval(adversusSyncRef.current);
      }
    };
  }, [id]);

  // ✨ UPPDATERAD: Slide rotation med individuell duration per slide
  useEffect(() => {
    if (leaderboardsData.length === 0 || !slideshow) return;

    const currentSlide = leaderboardsData[currentIndex];
    const duration = (currentSlide?.duration || slideshow.duration || 15) * 1000;
    
    setProgress(0);
    
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
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [leaderboardsData, slideshow, currentIndex]);

  const handleNotificationComplete = () => {
    console.log('✅ Notification complete - clearing state');
    setCurrentNotification(null);
  };

  if (isLoading) {
    return (
      <div className="slideshow-container">
        <div className="slideshow-loading">
          <h1>🏆 Sweet TV</h1>
          <p>Laddar slideshow...</p>
          <p style={{ fontSize: '0.9rem', opacity: 0.7, marginTop: '0.5rem' }}>
            Synkar data från Adversus...
          </p>
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
    <div className="slideshow-container">
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

      {/* ✨ UPPDATERAD: Render både single och dual slides (med SMS-data!) */}
      {leaderboardsData.map((slideData, index) => {
        const isActive = index === currentIndex;
        
        if (slideData.type === 'dual') {
          return (
            <DualLeaderboardSlide
              key={index}
              leftLeaderboard={slideData.leftLeaderboard}
              rightLeaderboard={slideData.rightLeaderboard}
              leftStats={slideData.leftStats}
              rightStats={slideData.rightStats}
              isActive={isActive}
            />
          );
        } else {
          return (
            <LeaderboardSlide
              key={slideData.leaderboard.id}
              leaderboard={slideData.leaderboard}
              stats={slideData.stats}
              isActive={isActive}
            />
          );
        }
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
