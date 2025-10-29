// frontend/src/pages/Slideshow.jsx
// 🔥 SÄKER VERSION - Fixar deploy-problem

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import socketService from '../services/socket';
import { getSlideshow, getLeaderboardStats2 } from '../services/api';
import DealNotification from '../components/DealNotification';
import DualLeaderboardSlide from '../components/DualLeaderboardSlide';
import '../components/DealNotification.css';
import './Slideshow.css';

// ⭐ LeaderboardSlide komponent med SMS-box
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
              const isZeroDeals = !item.dealCount || item.dealCount === 0;
              const uniqueSMS = item.uniqueSMS || 0;
              const smsSuccessRate = item.smsSuccessRate || 0;
              
              return (
                <div 
                  key={`${item.userId}-${index}`}
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
                  
                  <div className={`slideshow-deals-column ${isZeroDeals ? 'zero' : ''}`}>
                    <span className="emoji">🎯</span>
                    <span>{item.dealCount || 0} affärer</span>
                  </div>
                  
                  <div className={`slideshow-sms-box ${getSMSBoxClass(smsSuccessRate)}`}>
                    <div className="sms-rate">
                      {smsSuccessRate.toFixed(2)}%
                    </div>
                    <div className="sms-count">
                      ({uniqueSMS} SMS)
                    </div>
                  </div>
                  
                  <div className={`slideshow-commission ${getCommissionClass(item.totalCommission || 0, leaderboard.timePeriod)}`}>
                    {(item.totalCommission || 0).toLocaleString('sv-SE')} THB
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
  const [refreshKey, setRefreshKey] = useState(0);
  
  const intervalRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const refreshIntervalRef = useRef(null);

  const fetchSlideshowData = async (silent = false) => {
    try {
      if (!silent) {
        setIsLoading(true);
      }
      
      const slideshowResponse = await getSlideshow(id);
      const slideshowData = slideshowResponse.data;
      
      if (!silent) {
        setSlideshow(slideshowData);
      }
      
      if (slideshowData.type === 'dual' && slideshowData.dualSlides) {
        const dualSlidesData = [];
        
        for (let i = 0; i < slideshowData.dualSlides.length; i++) {
          const dualSlide = slideshowData.dualSlides[i];
          
          try {
            const [leftStatsRes, rightStatsRes] = await Promise.all([
              getLeaderboardStats2(dualSlide.left),
              getLeaderboardStats2(dualSlide.right)
            ]);
            
            dualSlidesData.push({
              type: 'dual',
              duration: dualSlide.duration,
              leftLeaderboard: leftStatsRes.data.leaderboard,
              rightLeaderboard: rightStatsRes.data.leaderboard,
              leftStats: leftStatsRes.data.stats || [],
              rightStats: rightStatsRes.data.stats || []
            });
            
            if (i < slideshowData.dualSlides.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          } catch (error) {
            console.error(`Error loading dual slide ${i + 1}:`, error.message);
          }
        }
        
        setLeaderboardsData(dualSlidesData);
      } else {
        const leaderboardsWithStats = [];
        
        for (let i = 0; i < slideshowData.leaderboards.length; i++) {
          const lbId = slideshowData.leaderboards[i];
          
          try {
            const statsResponse = await getLeaderboardStats2(lbId);
            
            leaderboardsWithStats.push({
              type: 'single',
              leaderboard: statsResponse.data.leaderboard,
              stats: statsResponse.data.stats || []
            });
            
            if (i < slideshowData.leaderboards.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          } catch (error) {
            console.error(`Error loading leaderboard ${lbId}:`, error.message);
          }
        }
        
        setLeaderboardsData(leaderboardsWithStats);
      }
      
      setRefreshKey(prev => prev + 1);
      setIsLoading(false);
      
    } catch (error) {
      console.error('Error fetching slideshow:', error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSlideshowData();
    
    refreshIntervalRef.current = setInterval(() => {
      fetchSlideshowData(true);
    }, 2 * 60 * 1000);
    
    socketService.connect();

    const handleNewDeal = (notification) => {
      if (notification && notification.agent && notification.agent.name) {
        setCurrentNotification(notification);
        
        setTimeout(() => {
          fetchSlideshowData(true);
        }, 5000);
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
    const duration = (currentSlide?.duration || slideshow.duration || 15) * 1000;
    
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
    <div className="slideshow-container" key={refreshKey}>
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
        
        if (slideData.type === 'dual') {
          return (
            <DualLeaderboardSlide
              key={`dual-${index}-${refreshKey}`}
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
              key={`single-${slideData.leaderboard.id}-${refreshKey}`}
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
