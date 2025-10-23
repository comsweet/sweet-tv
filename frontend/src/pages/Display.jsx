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

  return (
    <div className="leaderboard-card-display slideshow-mode">
      <div className="leaderboard-header">
        <h2>{leaderboard.name}</h2>
        <p className="leaderboard-period">{getTimePeriodLabel(leaderboard.timePeriod)}</p>
      </div>

      {stats.length === 0 ? (
        <div className="no-data-display">Inga affärer än</div>
      ) : (
        <div className="leaderboard-items">
          {stats.slice(0, 15).map((item, index) => (
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
                <p className="agent-stats-display">{item.dealCount} affärer</p>
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
  const slideIntervalRef = useRef(null);

  const fetchSlideshowData = async () => {
    if (!slideshowId) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await getSlideshow(slideshowId);
      const slideshowData = response.data;
      setSlideshow(slideshowData);
      
      // Hämta stats för alla leaderboards i slideshow
      const leaderboardsWithStats = await Promise.all(
        slideshowData.leaderboards.map(async (leaderboardId) => {
          try {
            const statsResponse = await getLeaderboardStats2(leaderboardId);
            return {
              leaderboard: statsResponse.data.leaderboard,
              stats: statsResponse.data.stats || []
            };
          } catch (error) {
            console.error(`Error fetching stats for leaderboard ${leaderboardId}:`, error);
            return null;
          }
        })
      );
      
      // Filtrera bort null-värden
      setLeaderboardsData(leaderboardsWithStats.filter(Boolean));
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching slideshow:', error);
      setIsLoading(false);
    }
  };

  // Hämta data första gången och sedan varje minut
  useEffect(() => {
    fetchSlideshowData();
    const interval = setInterval(fetchSlideshowData, 60000);
    return () => clearInterval(interval);
  }, [slideshowId]);

  // Slideshow rotation
  useEffect(() => {
    if (!slideshow || leaderboardsData.length === 0) return;

    const duration = (slideshow.duration || 30) * 1000;
    
    slideIntervalRef.current = setInterval(() => {
      setCurrentSlideIndex((prevIndex) => 
        (prevIndex + 1) % leaderboardsData.length
      );
    }, duration);

    return () => {
      if (slideIntervalRef.current) {
        clearInterval(slideIntervalRef.current);
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
          <p>Kunde inte ladda slideshow</p>
          <p className="hint">Kontrollera att slideshow:en finns och har leaderboards</p>
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
