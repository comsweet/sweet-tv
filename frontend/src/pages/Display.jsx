import { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import socketService from '../services/socket';
import { getLeaderboardStats } from '../services/api';
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
            +{parseFloat(commission).toLocaleString('sv-SE')} kr
          </p>
          <p className="notification-message">🎉 Ny affär registrerad!</p>
        </div>
      </div>
    </div>
  );
};

const Display = () => {
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [currentNotification, setCurrentNotification] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLeaderboard = async () => {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const response = await getLeaderboardStats(
        startOfMonth.toISOString(),
        now.toISOString()
      );
      
      setLeaderboardData(response.data);
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 60000);

    socketService.connect();

    const handleNewDeal = (notification) => {
      console.log('New deal received:', notification);
      setCurrentNotification(notification);
      fetchLeaderboard();
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

  return (
    <div className="display-container">
      <header className="display-header">
        <h1>🏆 Leaderboard</h1>
        <p className="display-subtitle">Denna månad</p>
      </header>

      {isLoading ? (
        <div className="loading">Laddar...</div>
      ) : (
        <div className="leaderboard">
          {leaderboardData.length === 0 ? (
            <div className="no-data">Inga affärer än denna månad</div>
          ) : (
            <div className="leaderboard-list">
              {leaderboardData.map((item, index) => (
                <div 
                  key={item.userId} 
                  className={`leaderboard-item ${index === 0 ? 'first-place' : ''}`}
                >
                  <div className="rank">
                    {index === 0 && '🥇'}
                    {index === 1 && '🥈'}
                    {index === 2 && '🥉'}
                    {index > 2 && `#${index + 1}`}
                  </div>
                  
                  {item.agent.profileImage ? (
                    <img 
                      src={item.agent.profileImage} 
                      alt={item.agent.name}
                      className="agent-avatar"
                    />
                  ) : (
                    <div className="agent-avatar-placeholder">
                      {item.agent.name?.charAt(0) || '?'}
                    </div>
                  )}
                  
                  <div className="agent-info">
                    <h3 className="agent-name">{item.agent.name}</h3>
                    <p className="agent-stats">
                      {item.dealCount} affärer
                    </p>
                  </div>
                  
                  <div className="commission">
                    {item.totalCommission.toLocaleString('sv-SE')} kr
                  </div>
                </div>
              ))}
            </div>
          )}
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
