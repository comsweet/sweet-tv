// DualLeaderboardSlide.jsx - NY KOMPONENT
// Lägg till i frontend/src/components/

import { useState, useEffect } from 'react';
import './DualLeaderboardSlide.css';

const DualLeaderboardSlide = ({ leftLeaderboard, rightLeaderboard, leftStats, rightStats, isActive }) => {
  const [scrollPosition, setScrollPosition] = useState(0);

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

  // Auto-scroll logic
  const rowHeight = 52;
  const visibleRows = 18;
  const maxAgents = Math.max(leftStats.length, rightStats.length);
  const needsScroll = maxAgents > visibleRows;
  const maxScroll = needsScroll ? (maxAgents - visibleRows) * rowHeight : 0;

  useEffect(() => {
    if (!isActive || !needsScroll) return;

    const interval = setInterval(() => {
      setScrollPosition(prev => {
        const newPosition = prev + 1;
        if (newPosition >= maxScroll) {
          setTimeout(() => setScrollPosition(0), 2000);
          return maxScroll;
        }
        return newPosition;
      });
    }, 30);

    return () => clearInterval(interval);
  }, [isActive, needsScroll, maxScroll]);

  // Reset scroll when slide becomes inactive
  useEffect(() => {
    if (!isActive) {
      setScrollPosition(0);
    }
  }, [isActive]);

  const LeaderboardColumn = ({ leaderboard, stats, side }) => {
    const totalDeals = stats.reduce((sum, stat) => sum + stat.dealCount, 0);

    return (
      <div className="dual-leaderboard-column">
        <div className="dual-leaderboard-header">
          <h2>{leaderboard.name}</h2>
          <p className="dual-period">{getTimePeriodLabel(leaderboard.timePeriod)}</p>
          <p className="dual-stats">📊 {totalDeals} affärer • {stats.length} agenter</p>
        </div>

        <div 
          className="dual-leaderboard-scroll-container"
          style={{ height: `${visibleRows * rowHeight}px` }}
        >
          <div 
            className="dual-leaderboard-items"
            style={{ 
              transform: `translateY(-${scrollPosition}px)`,
              transition: 'transform 0.1s linear'
            }}
          >
            {stats.map((item, index) => {
              const isZeroDeals = item.dealCount === 0;
              const isFirstPlace = index === 0 && !isZeroDeals;

              return (
                <div
                  key={item.userId}
                  className={`dual-leaderboard-item ${isFirstPlace ? 'first-place' : ''} ${isZeroDeals ? 'zero-deals' : ''}`}
                  style={{ 
                    height: `${rowHeight}px`,
                    animationDelay: isActive ? `${index * 0.05}s` : '0s'
                  }}
                >
                  {/* Rank */}
                  <div className="dual-rank">
                    {index === 0 && !isZeroDeals && '🥇'}
                    {index === 1 && !isZeroDeals && '🥈'}
                    {index === 2 && !isZeroDeals && '🥉'}
                    {(index > 2 || isZeroDeals) && `#${index + 1}`}
                  </div>

                  {/* Avatar */}
                  {item.agent.profileImage ? (
                    <img
                      src={item.agent.profileImage}
                      alt={item.agent.name}
                      className="dual-avatar"
                    />
                  ) : (
                    <div className="dual-avatar-placeholder">
                      {item.agent.name?.charAt(0) || '?'}
                    </div>
                  )}

                  {/* Name */}
                  <div className="dual-info">
                    <p className={`dual-name ${isZeroDeals ? 'zero-deals' : ''}`}>
                      {item.agent.name || `Agent ${item.userId}`}
                    </p>
                  </div>

                  {/* Deals */}
                  <div className="dual-deals">
                    <span className="deal-heart">❤️</span>
                    <span className={isZeroDeals ? 'zero' : ''}>{item.dealCount}</span>
                  </div>

                  {/* Commission */}
                  <div className={`dual-commission ${getCommissionClass(item.totalCommission)}`}>
                    {item.totalCommission} THB
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {needsScroll && (
          <div className="dual-scroll-indicator">
            <span>Scrollar automatiskt...</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`dual-leaderboard-slide ${isActive ? 'active' : ''}`}>
      <div className="dual-leaderboard-container">
        <LeaderboardColumn
          leaderboard={leftLeaderboard}
          stats={leftStats}
          side="left"
        />
        <LeaderboardColumn
          leaderboard={rightLeaderboard}
          stats={rightStats}
          side="right"
        />
      </div>
    </div>
  );
};

export default DualLeaderboardSlide;
