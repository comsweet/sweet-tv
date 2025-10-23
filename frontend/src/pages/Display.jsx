import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import confetti from 'canvas-confetti';
import socketService from '../services/socket';
import { getSlideshow, getLeaderboardStats2 } from '../services/api';
import './Display.css';

const playNotificationSound = () => {
  const audio = new Audio('/notification.mp3');
  audio.play().catch(e => console.log('Could not play sound:', e));
};

const DealNotification = ({ notification, onComplete }) => {
  useEffect(() => {
    playNotificationSound();
    
    const duration = 2000; // Reduced from 3000 for better TV performance
    const end = Date.now() + duration;
    const colors = ['#bb0000', '#ffffff', '#00bb00'];

    (function frame() {
      confetti({
        particleCount: 2, // Reduced from 3
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: colors
      });
      confetti({
        particleCount: 2, // Reduced from 3
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
    }, 4000); // Reduced from 5000

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

  // Calculate total deals
  const totalDeals = stats.reduce((sum, item) => sum + item.dealCount, 0);

  return (
    <div className="leaderboard-card-display slideshow-mode">
      <div className="leaderboard-header">
        {totalDeals > 0 && (
          <div className="total-deals-badge">
            <div>Totalt</div>
            <div className="total-deals-number">{totalDeals} 🎯</div>
          </div>
        )}
        
        <div className="leaderboard-title">
          <h2>{leaderboard.name}</h2>
          <p className="leaderboard-period">{getTimePeriodLabel(leaderboard.timePeriod)}</p>
        </div>
        
        <div style={{ width: '120px' }}></div> {/* Spacer for symmetry */}
      </div>

      {stats.length === 0 ? (
        <div className="no-data-display">Inga affärer än</div>
      ) : (
        <div className="leaderboard-items">
          {stats.slice(0, 25).map((item, index) => (
            <div 
              key={item.userId} 
              className={`leaderboard-item-display ${index === 0 ? 'first-place' : ''}`}
            >
              <div className="rank-display">
                {index === 0 && '🥇'}
                {index === 1 && '🥈'}
                {index === 2 && '🥉'}
                {index > 2 && `#${index + 1}`}
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
                <h3 className="agent-name-display">{item.agent.name}</h3>
              </div>
              
              <div className="deals-display">
                <span className="emoji">🎯</span>
                <span className="number">{item.dealCount}</span>
              </div>
              
              <div className="commission-display">
                {item.totalCommission.toLocaleString('sv-SE')} THB
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Display = () => {
  const [searchParams] = useSearchParams();
  const slideshowId = searchParams.get('slideshow');
  
  const [slideshow, setSlideshow] = useState(null);
  const [leaderboardsData, setLeaderboardsData] = useState([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [currentNotification, setCurrentNotification] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const slideIntervalRef = useRef(null);
  const progressIntervalRef = useRef(null);

  const fetchSlideshowData = async () => {
    if (!slideshowId) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await getSlideshow(slideshowId);
      const slideshowData = response.data;
      setSlideshow(slideshowData);
      
      console.log('📊 Slideshow data:', slideshowData);
      console.log('📋 Leaderboard IDs:', slideshowData.leaderboards);
      
      // Hämta stats för alla leaderboards i slideshow
      const leaderboardsWithStats = await Promise.all(
        slideshowData.leaderboards.map(async (leaderboardId) => {
          try {
            console.log(`🔍 Fetching stats for leaderboard ${leaderboardId}...`);
            const statsResponse = await getLeaderboardStats2(leaderboardId);
            console.log(`✅ Stats fetched for ${leaderboardId}:`, statsResponse.data);
            return {
              leaderboard: statsResponse.data.leaderboard,
              stats: statsResponse.data.stats || []
            };
          } catch (error) {
            console.error(`❌ Error fetching stats for leaderboard ${leaderboardId}:`, error);
            // Skip this leaderboard if it fails
            return null;
          }
        })
      );
      
      // Filtrera bort null-värden (misslyckade fetches)
      const validLeaderboards = leaderboardsWithStats.filter(Boolean);
      
      console.log(`📈 Successfully loaded ${validLeaderboards.length}/${slideshowData.leaderboards.length} leaderboards`);
      
      if (validLeaderboards.length === 0) {
        console.error('⚠️  No valid leaderboards found in slideshow');
      }
      
      setLeaderboardsData(validLeaderboards);
      setIsLoading(false);
    } catch (error) {
      console.error('❌ Error fetching slideshow:', error);
      setIsLoading(false);
    }
  };

  // Hämta data första gången och sedan varje minut
  useEffect(() => {
    fetchSlideshowData();
    const interval = setInterval(fetchSlideshowData, 60000);
    return () => clearInterval(interval);
  }, [slideshowId]);

  // Slideshow rotation with progress bar
  useEffect(() => {
    if (!slideshow || leaderboardsData.length === 0) return;

    const duration = (slideshow.duration || 30) * 1000;
    const progressUpdateInterval = 100; // Update every 100ms

    // Reset progress
    setProgress(0);

    // Progress bar animation
    let elapsed = 0;
    progressIntervalRef.current = setInterval(() => {
      elapsed += progressUpdateInterval;
      const newProgress = Math.min((elapsed / duration) * 100, 100);
      setProgress(newProgress);
    }, progressUpdateInterval);

    // Slide rotation
    slideIntervalRef.current = setInterval(() => {
      setCurrentSlideIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % leaderboardsData.length;
        
        // Preload hint (data is already loaded, but log for future preload logic)
        const nextNextIndex = (nextIndex + 1) % leaderboardsData.length;
        console.log(`🔄 Next slide: ${nextIndex + 1}, Preload ready: ${nextNextIndex + 1}`);
        
        // Reset progress for new slide
        setProgress(0);
        
        return nextIndex;
      });
    }, duration);

    return () => {
      if (slideIntervalRef.current) {
        clearInterval(slideIntervalRef.current);
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [slideshow, leaderboardsData]);

  // WebSocket för notifikationer
  useEffect(() => {
    socketService.connect();

    const handleNewDeal = (notification) => {
      console.log('New deal received:', notification);
      setCurrentNotification(notification);
      fetchSlideshowData(); // Uppdatera stats
    };

    socketService.onNewDeal(handleNewDeal);

    return () => {
      socketService.offNewDeal(handleNewDeal);
    };
  }, []);

  const handleNotificationComplete = () => {
    setCurrentNotification(null);
  };

  if (isLoading) {
    return (
      <div className="display-container">
        <div className="loading-display">Laddar slideshow...</div>
      </div>
    );
  }

  if (!slideshowId) {
    return (
      <div className="display-container">
        <div className="no-leaderboards">
          <p>Ingen slideshow vald</p>
          <p className="hint">Lägg till ?slideshow=ID i URL:en</p>
        </div>
      </div>
    );
  }

  if (!slideshow || leaderboardsData.length === 0) {
    return (
      <div className="display-container">
        <div className="no-leaderboards">
          <p>⚠️ Kunde inte ladda slideshow</p>
          {slideshow && slideshow.leaderboards.length > 0 ? (
            <>
              <p className="hint">Slideshow:en har {slideshow.leaderboards.length} leaderboard(s)</p>
              <p className="hint">men inga kunde laddas korrekt</p>
              <p className="hint" style={{ marginTop: '1rem', fontSize: '1rem' }}>
                Kontrollera att leaderboards med följande ID:n finns:
              </p>
              <ul style={{ listStyle: 'none', padding: 0, marginTop: '0.5rem' }}>
                {slideshow.leaderboards.map(id => (
                  <li key={id} style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>
                    • {id}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="hint">Kontrollera att slideshow:en finns och har leaderboards</p>
          )}
        </div>
      </div>
    );
  }

  const currentSlide = leaderboardsData[currentSlideIndex];

  return (
    <div className="display-container">
      <header className="display-header">
        <h1>🏆 {slideshow.name}</h1>
        <div className="slideshow-indicator">
          {leaderboardsData.map((_, index) => (
            <span 
              key={index} 
              className={`indicator-dot ${index === currentSlideIndex ? 'active' : ''}`}
            />
          ))}
        </div>
        <div className="slideshow-progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <div className="slideshow-container">
        <LeaderboardCard 
          leaderboard={currentSlide.leaderboard}
          stats={currentSlide.stats}
        />
      </div>

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
