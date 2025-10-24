import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import confetti from 'canvas-confetti';
import socketService from '../services/socket';
import { getSlideshow, getLeaderboardStats2 } from '../services/api';
import './Slideshow.css';

const playNotificationSound = () => {
  const audio = new Audio('/notification.mp3');
  audio.play().catch(e => console.log('Could not play sound:', e));
};

const DealNotification = ({ notification, onComplete }) => {
  useEffect(() => {
    playNotificationSound();
    
    const duration = 3000;
    const end = Date.now() + duration;
    const colors = ['#bb0000', '#ffffff', '#00bb00'];

    (function frame() {
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

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();

    const timer = setTimeout(() => {
      onComplete();
    }, 5000);

    return () => clearTimeout(timer);
  }, [onComplete]);

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
            {stats.slice(0, 10).map((item, index) => (
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
          
          // Delay mellan varje leaderboard
          if (i < slideshowData.leaderboards.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
        } catch (error) {
          console.error(`Error loading leaderboard ${lbId}:`, error);
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
    
    // NO automatic refresh - only refresh on new deal or manual reload
    
    socketService.connect();

    const handleNewDeal = (notification) => {
      console.log('🎉 New deal:', notification);
      setCurrentNotification(notification);
      setTimeout(() => fetchSlideshowData(), 3000);
    };

    socketService.onNewDeal(handleNewDeal);

    return () => {
      socketService.offNewDeal(handleNewDeal);
    };
  }, [id]);

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
