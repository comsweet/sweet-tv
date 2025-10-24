import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import confetti from 'canvas-confetti';
import socketService from '../services/socket';
import { getSlideshow, getLeaderboardStats2 } from '../services/api';
import './Slideshow.css';

const DealNotification = ({ notification, onComplete }) => {
  useEffect(() => {
    // NO SOUND - notification.mp3 doesn't exist!
    
    const confettiDuration = 3000;
    const confettiEnd = Date.now() + confettiDuration;
    
    let confettiFrame;
    const colors = ['#bb0000', '#ffffff', '#00bb00'];

    const runConfetti = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: colors
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: colors
      });

      if (Date.now() < confettiEnd) {
        confettiFrame = requestAnimationFrame(runConfetti);
      }
    };
    
    runConfetti();

    // GUARANTEE cleanup after 5 seconds
    const cleanupTimer = setTimeout(() => {
      console.log('🧹 Cleaning up notification...');
      if (confettiFrame) {
        cancelAnimationFrame(confettiFrame);
      }
      onComplete();
    }, 5000);

    return () => {
      console.log('🧹 Component unmounting - cleanup');
      clearTimeout(cleanupTimer);
      if (confettiFrame) {
        cancelAnimationFrame(confettiFrame);
      }
    };
  }, [notification, onComplete]); // Include dependencies!

  const { agent, commission } = notification;

  return (
    <div className="deal-notification">
      <div className="notification-content">
        {agent.profileImage && (
          <img 
            src={agent.profileImage} 
            alt={agent.name}
            className="notification-avatar"
          />
        )}
        {!agent.profileImage && (
          <div className="notification-avatar-placeholder">
            {agent.name?.charAt(0) || '?'}
          </div>
        )}
        <div className="notification-text">
          <h2 className="notification-name">{agent.name}</h2>
          <p className="notification-commission">
            +{parseFloat(commission).toLocaleString('sv-SE')} THB
          </p>
          <p className="notification-message">🎉 Ny affär registrerad!</p>
        </div>
      </div>
    </div>
  );
};

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
            {stats.slice(0, 20).map((item, index) => (
              <div 
                key={item.userId} 
                className={`slideshow-item ${index === 0 ? 'first-place' : ''}`}
                style={{ 
                  animationDelay: isActive ? `${index * 0.1}s` : '0s'
                }}
              >
                <div className="slideshow-rank">
                  {index === 0 && '🥇'}
                  {index === 1 && '🥈'}
                  {index === 2 && '🥉'}
                  {index > 2 && `#${index + 1}`}
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
                  <h3 className="slideshow-name">{item.agent.name}</h3>
                  <p className="slideshow-deals">{item.dealCount} affärer</p>
                </div>
                
                <div className="slideshow-commission">
                  {item.totalCommission.toLocaleString('sv-SE')} THB
                </div>
              </div>
            ))}
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

  // Fetch slideshow och leaderboards data
  const fetchSlideshowData = async () => {
    try {
      setIsLoading(true);
      
      // Hämta slideshow config
      const slideshowResponse = await getSlideshow(id);
      const slideshowData = slideshowResponse.data;
      setSlideshow(slideshowData);
      
      console.log(`📺 Slideshow "${slideshowData.name}" with ${slideshowData.leaderboards.length} leaderboards`);
      
      // Hämta stats för varje leaderboard SEKVENTIELLT
      const leaderboardsWithStats = [];
      
      for (let i = 0; i < slideshowData.leaderboards.length; i++) {
        const lbId = slideshowData.leaderboards[i];
        
        try {
          console.log(`📈 Loading leaderboard ${i + 1}/${slideshowData.leaderboards.length}`);
          const statsResponse = await getLeaderboardStats2(lbId);
          
          leaderboardsWithStats.push({
            leaderboard: statsResponse.data.leaderboard,
            stats: statsResponse.data.stats || []
          });
          
          console.log(`✅ Loaded (${statsResponse.data.stats?.length || 0} agents)`);
          
          // Delay mellan varje leaderboard (3s för rate limit protection!)
          if (i < slideshowData.leaderboards.length - 1) {
            console.log('⏳ Waiting 3s...');
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
          
        } catch (error) {
          console.error(`❌ Error loading leaderboard ${lbId}:`, error);
          
          // If rate limit, wait longer
          if (error.response?.status === 429) {
            console.log('⏰ Rate limit! Waiting 10s...');
            await new Promise(resolve => setTimeout(resolve, 10000));
          }
        }
      }
      
      console.log(`✅ Loaded ${leaderboardsWithStats.length} leaderboards for slideshow`);
      setLeaderboardsData(leaderboardsWithStats);
      setIsLoading(false);
      
    } catch (error) {
      console.error('Error fetching slideshow:', error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSlideshowData();
    
    socketService.connect();

    const handleNewDeal = (notification) => {
      console.log('🎉 New deal:', notification);
      
      // Only show notification if agent exists and valid
      // Commission check is done in backend - we only get valid deals here!
      if (notification.agent && 
          notification.agent.name && 
          notification.agent.name !== 'Agent null') {
        setCurrentNotification(notification);
      } else {
        console.log('⏭️  Skipping notification (invalid agent)');
      }
      
      // Update leaderboard data in background (no page reload!)
      // Wait 2s for backend to process the deal
      setTimeout(async () => {
        try {
          console.log('📊 Updating leaderboard data after deal...');
          
          // Re-fetch ALL leaderboards (but don't show loading screen)
          const response = await getSlideshow(id);
          const slideshowData = response.data;
          
          const updatedLeaderboards = [];
          for (let i = 0; i < slideshowData.leaderboards.length; i++) {
            const lbId = slideshowData.leaderboards[i];
            try {
              const statsResponse = await getLeaderboardStats2(lbId);
              updatedLeaderboards.push({
                leaderboard: statsResponse.data.leaderboard,
                stats: statsResponse.data.stats || []
              });
              
              // Small delay between fetches
              if (i < slideshowData.leaderboards.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            } catch (error) {
              console.error(`Error updating leaderboard ${lbId}:`, error);
            }
          }
          
          setLeaderboardsData(updatedLeaderboards);
          console.log('✅ All leaderboard data updated silently!');
        } catch (error) {
          console.error('Error updating leaderboards:', error);
        }
      }, 2000);
    };

    socketService.onNewDeal(handleNewDeal);

    return () => {
      socketService.offNewDeal(handleNewDeal);
    };
  }, [id]); // ← ONLY id as dependency!

  // Slideshow rotation with progress bar
  useEffect(() => {
    if (leaderboardsData.length === 0 || !slideshow) return;

    const duration = (slideshow.duration || 15) * 1000;
    
    // Reset progress
    setProgress(0);
    
    // Progress bar animation (updates every 100ms)
    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) return 0;
        return prev + (100 / (duration / 100));
      });
    }, 100);
    
    // Slide rotation
    intervalRef.current = setInterval(() => {
      setProgress(0);
      setCurrentIndex((prev) => (prev + 1) % leaderboardsData.length);
    }, duration);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [leaderboardsData, slideshow]);

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
      {/* Progress bar */}
      <div className="slideshow-progress-bar">
        <div 
          className="slideshow-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Progress indicators */}
      <div className="slideshow-indicators">
        {leaderboardsData.map((_, index) => (
          <div 
            key={index}
            className={`indicator ${index === currentIndex ? 'active' : ''}`}
          />
        ))}
      </div>

      {/* Slides */}
      {leaderboardsData.map((data, index) => (
        <LeaderboardSlide
          key={data.leaderboard.id}
          leaderboard={data.leaderboard}
          stats={data.stats}
          isActive={index === currentIndex}
        />
      ))}

      {/* Deal notification */}
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
