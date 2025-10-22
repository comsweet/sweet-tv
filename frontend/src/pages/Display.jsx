import { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import socketService from '../services/socket';
import { getActiveLeaderboards, getLeaderboardStats2 } from '../services/api';
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
    <div className="leaderboard-card-display">
      <div className="leaderboard-header">
        <h2>{leaderboard.name}</h2>
        <p className="leaderboard-period">{getTimePeriodLabel(leaderboard.timePeriod)}</p>
      </div>

      {stats.length === 0 ? (
        <div className="no-data-display">Inga affärer än</div>
      ) : (
        <div className="leaderboard-items">
          {stats.slice(0, 10).map((item, index) => (
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
  const [leaderboardsData, setLeaderboardsData] = useState([]);
  const [currentNotification, setCurrentNotification] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLeaderboards = async () => {
    try {
      const response = await getActiveLeaderboards();
      const activeLeaderboards = response.data;
      
      // Hämta stats för varje aktiv leaderboard
      const leaderboardsWithStats = await Promise.all(
        activeLeaderboards.map(async (lb) => {
          try {
            const statsResponse = await getLeaderboardStats2(lb.id);
            return {
              leaderboard: lb,
              stats: statsResponse.data.stats || []
            };
          } catch (error) {
            console.error(`Error fetching stats for leaderboard ${lb.id}:`, error);
            return {
              leaderboard: lb,
              stats: []
            };
          }
        })
      );
      
      setLeaderboardsData(leaderboardsWithStats);
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching leaderboards:', error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboards();
    const interval = setInterval(fetchLeaderboards, 60000); // Uppdatera varje minut

    socketService.connect();

    const handleNewDeal = (notification) => {
      console.log('New deal received:', notification);
      setCurrentNotification(notification);
      fetchLeaderboards();
    };

    socketService.onNewDeal(handleNewDeal);

    return () => {
      clearInterval(interval);
      socketService.offNewDeal(handleNewDeal);
    };
  }, []);

  const handleNotificationComplete = () => {
    setCurrentNotification(null);
  };

  // Bestäm grid-layout baserat på antal leaderboards
  const getGridClass = () => {
    const count = leaderboardsData.length;
    if (count === 1) return 'grid-1';
    if (count === 2) return 'grid-2';
    if (count <= 4) return 'grid-4';
    return 'grid-4'; // Max 4 leaderboards i taget
  };

  return (
    <div className="display-container">
      <header className="display-header">
        <h1>🏆 Sweet TV Leaderboards</h1>
      </header>

      {isLoading ? (
        <div className="loading-display">Laddar...</div>
      ) : leaderboardsData.length === 0 ? (
        <div className="no-leaderboards">
          <p>Inga aktiva leaderboards</p>
          <p className="hint">Skapa en leaderboard i Admin-panelen</p>
        </div>
      ) : (
        <div className={`leaderboards-grid ${getGridClass()}`}>
          {leaderboardsData.slice(0, 4).map(({ leaderboard, stats }) => (
            <LeaderboardCard 
              key={leaderboard.id}
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
