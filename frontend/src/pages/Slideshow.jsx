import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import socketService from '../services/socket';
import { getSlideshow, getLeaderboardStats2 } from '../services/api';
import DealNotification from '../components/DealNotification.jsx';
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
  const refreshIntervalRef = useRef(null);

  // 🔥 FIXED: Fetch slideshow och leaderboards data
  const fetchSlideshowData = async (silent = false) => {
    try {
      if (!silent) {
        setIsLoading(true);
      }
      
      // Hämta slideshow config
      const slideshowResponse = await getSlideshow(id);
      const slideshowData = slideshowResponse.data;
      setSlideshow(slideshowData);
      
      if (!silent) {
        console.log(`📺 Slideshow "${slideshowData.name}" with ${slideshowData.leaderboards.length} leaderboards`);
      }
      
      // Hämta stats för varje leaderboard SEKVENTIELLT
      const leaderboardsWithStats = [];
      
      for (let i = 0; i < slideshowData.leaderboards.length; i++) {
        const lbId = slideshowData.leaderboards[i];
        
        try {
          if (!silent) {
            console.log(`📈 Loading leaderboard ${i + 1}/${slideshowData.leaderboards.length}`);
          }
          const statsResponse = await getLeaderboardStats2(lbId);
          
          leaderboardsWithStats.push({
            leaderboard: statsResponse.data.leaderboard,
            stats: statsResponse.data.stats || []
          });
          
          if (!silent) {
            console.log(`✅ Loaded (${statsResponse.data.stats?.length || 0} agents)`);
          }
          
          // Delay mellan varje leaderboard (3s för rate limit protection!)
          if (i < slideshowData.leaderboards.length - 1) {
            if (!silent) {
              console.log('⏳ Waiting 3s...');
            }
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
      
      if (!silent) {
        console.log(`✅ Loaded ${leaderboardsWithStats.length} leaderboards for slideshow`);
      } else {
        console.log(`🔄 Silent refresh: Updated ${leaderboardsWithStats.length} leaderboards`);
      }
      
      setLeaderboardsData(leaderboardsWithStats);
      setIsLoading(false);
      
    } catch (error) {
      console.error('Error fetching slideshow:', error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchSlideshowData();
    
    // 🔥 AUTOMATIC REFRESH var 2:e minut (background update)
    refreshIntervalRef.current = setInterval(() => {
      console.log('🔄 Auto-refresh: Updating leaderboard data...');
      fetchSlideshowData(true); // silent = true (no loading screen)
    }, 2 * 60 * 1000); // 2 minuter
    
    // Socket för real-time notifications
    socketService.connect();

    const handleNewDeal = (notification) => {
      console.log('🎉 New deal:', notification);
      
      // Show notification if agent is valid
      if (notification.agent && 
          notification.agent.name && 
          notification.agent.name !== 'Agent null') {
        setCurrentNotification(notification);
      }
      
      // 🔥 FIXED: IMMEDIATE BACKGROUND UPDATE efter notification
      // Vänta 5s för att backend ska processa dealen
      setTimeout(() => {
        console.log('🔄 Deal received: Refreshing leaderboard data...');
        fetchSlideshowData(true); // Silent refresh - FIXED function name!
      }, 5000);
    };

    socketService.onNewDeal(handleNewDeal);

    return () => {
      socketService.offNewDeal(handleNewDeal);
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
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
