// FIXED VERSION - frontend/src/components/DualLeaderboardSlide.jsx
// Fixar: 
// 1. Separat scroll för varje kolumn (44 vs 37 problem)
// 2. Dart emoji istället för hjärta
// 3. Freeze topp 3 (de stannar synliga medan resten scrollar)

import { useState, useEffect } from 'react';
import './DualLeaderboardSlide.css';

const DualLeaderboardSlide = ({ leftLeaderboard, rightLeaderboard, leftStats, rightStats, isActive }) => {
  // 🔥 SEPARAT SCROLL för varje kolumn!
  const [leftScrollPosition, setLeftScrollPosition] = useState(0);
  const [rightScrollPosition, setRightScrollPosition] = useState(0);

  if (!leftLeaderboard || !rightLeaderboard || !Array.isArray(leftStats) || !Array.isArray(rightStats)) {
    console.error('❌ DualLeaderboardSlide: Missing required data');
    return null;
  }

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
    if (!commission || commission === 0) return 'zero';
    if (commission < 3400) return 'low';
    return 'high';
  };

  // Reset scroll when slide becomes inactive
  useEffect(() => {
    if (!isActive) {
      setLeftScrollPosition(0);
      setRightScrollPosition(0);
    }
  }, [isActive]);

  const LeaderboardColumn = ({ leaderboard, stats, side }) => {
    if (!leaderboard || !Array.isArray(stats)) return null;

    const totalDeals = stats.reduce((sum, stat) => sum + (stat.dealCount || 0), 0);

    // 🔥 FREEZE LOGIC: Topp 3 visas separat
    const frozenCount = 3;
    const topStats = stats.slice(0, frozenCount);
    const scrollableStats = stats.slice(frozenCount);

    // Auto-scroll settings
    const rowHeight = 52;
    const visibleRows = 15; // Minskad från 18 eftersom topp 3 är frozen
    const needsScroll = scrollableStats.length > visibleRows;
    const maxScroll = needsScroll ? (scrollableStats.length - visibleRows) * rowHeight : 0;

    // 🔥 Använd rätt scroll position beroende på side
    const scrollPosition = side === 'left' ? leftScrollPosition : rightScrollPosition;
    const setScrollPosition = side === 'left' ? setLeftScrollPosition : setRightScrollPosition;

    // Auto-scroll effect - SEPARAT för varje kolumn
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
    }, [isActive, needsScroll, maxScroll, setScrollPosition]);

    const renderItem = (item, index, isFrozen = false) => {
      if (!item || !item.agent) return null;

      const isZeroDeals = !item.dealCount || item.dealCount === 0;
      const isFirstPlace = index === 0 && !isZeroDeals;
      const commission = item.totalCommission || 0;

      return (
        <div
          key={`${item.userId || index}-${item.agent.id || index}`}
          className={`dual-leaderboard-item ${isFirstPlace ? 'first-place' : ''} ${isZeroDeals ? 'zero-deals' : ''} ${isFrozen ? 'frozen' : ''}`}
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
              alt={item.agent.name || 'Agent'}
              className="dual-avatar"
            />
          ) : (
            <div className="dual-avatar-placeholder">
              {(item.agent.name && item.agent.name.charAt(0)) || '?'}
            </div>
          )}

          {/* Name */}
          <div className="dual-info">
            <p className={`dual-name ${isZeroDeals ? 'zero-deals' : ''}`}>
              {item.agent.name || `Agent ${item.userId || '?'}`}
            </p>
          </div>

          {/* Deals - 🎯 DART EMOJI ISTÄLLET FÖR HJÄRTA! */}
          <div className="dual-deals">
            <span className="deal-icon">🎯</span>
            <span className={isZeroDeals ? 'zero' : ''}>{item.dealCount || 0}</span>
          </div>

          {/* Commission */}
          <div className={`dual-commission ${getCommissionClass(commission)}`}>
            {commission.toLocaleString('sv-SE')} THB
          </div>
        </div>
      );
    };

    return (
      <div className="dual-leaderboard-column">
        <div className="dual-leaderboard-header">
          <h2>{leaderboard.name || 'Unnamed'}</h2>
          <p className="dual-period">{getTimePeriodLabel(leaderboard.timePeriod)}</p>
          <p className="dual-stats">
            📊 {totalDeals} {totalDeals === 1 ? 'affär' : 'affärer'} • {stats.length} {stats.length === 1 ? 'agent' : 'agenter'}
          </p>
        </div>

        {/* 🔥 FROZEN TOP 3 - Visas alltid */}
        {topStats.length > 0 && (
          <div className="dual-leaderboard-frozen">
            {topStats.map((item, index) => renderItem(item, index, true))}
          </div>
        )}

        {/* SCROLLABLE REST */}
        {scrollableStats.length > 0 && (
          <>
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
                {scrollableStats.map((item, index) => renderItem(item, index + frozenCount, false))}
              </div>
            </div>

            {needsScroll && (
              <div className="dual-scroll-indicator">
                <span>Scrollar automatiskt...</span>
              </div>
            )}
          </>
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
