import { useRef, useEffect } from 'react';
import './RaceLayout.css';

const RaceLayout = ({ stats, leaderboard, displayMode }) => {
  const scrollContainerRef = useRef(null);
  const scrollContentRef = useRef(null);

  // Auto-scroll logic (similar to Slideshow table)
  useEffect(() => {
    const enableAutoScroll = leaderboard.enableAutoScroll !== undefined ? leaderboard.enableAutoScroll : true;

    if (!enableAutoScroll || stats.length <= 1) return;

    const container = scrollContainerRef.current;
    const content = scrollContentRef.current;

    if (!container || !content) return;

    // Calculate scroll distance
    const containerHeight = container.clientHeight;
    const contentHeight = content.scrollHeight;
    const scrollDistance = contentHeight - containerHeight;

    if (scrollDistance <= 0) {
      // Nothing to scroll
      return;
    }

    // Dynamic scroll speed: 25 pixels per second
    const SCROLL_SPEED = 25;
    const scrollDuration = scrollDistance / SCROLL_SPEED;
    const totalDuration = scrollDuration * 1.1; // Add 10% for pauses

    // Set CSS variables for animation
    container.style.setProperty('--scroll-distance', `-${scrollDistance}px`);
    container.style.setProperty('--scroll-duration', `${totalDuration}s`);

    // Start animation
    content.classList.add('scrolling');

    return () => {
      if (content) {
        content.classList.remove('scrolling');
      }
    };
  }, [stats.length, leaderboard.enableAutoScroll]);

  const getTotalValue = (stat) => {
    if (leaderboard.sortBy === 'dealCount') {
      return stat.dealCount || 0;
    } else if (leaderboard.sortBy === 'total') {
      return (stat.totalCommission || 0) + (stat.campaignBonus || 0);
    }
    return stat.totalCommission || 0;
  };

  // Use goalValue if set, otherwise use max value
  const maxValue = Math.max(...stats.map(s => getTotalValue(s)), 1);
  const goalValue = leaderboard.goalValue || maxValue;

  const getProgressPercentage = (value) => {
    return Math.min((value / goalValue) * 95, 95);
  };

  const getRankIcon = (index) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  };

  const formatValue = (stat) => {
    if (leaderboard.sortBy === 'dealCount') {
      return `${stat.dealCount || 0} affärer`;
    }
    const value = getTotalValue(stat);
    return `${value.toLocaleString('sv-SE')} THB`;
  };

  const getGoalLabel = () => {
    if (leaderboard.goalLabel) {
      return leaderboard.goalLabel;
    }
    return 'Löpar-Race till Målet!';
  };

  const getGoalText = () => {
    if (leaderboard.sortBy === 'dealCount') {
      return `${goalValue} affärer`;
    }
    return `${goalValue.toLocaleString('sv-SE')} THB`;
  };

  const getRunnerIcon = (index) => {
    // Use better running emoji
    if (index === 0) return '🏃‍♂️';
    if (index === 1 || index === 2) return '🏃';
    return '🚶';
  };

  const renderRunner = (stat, index) => {
    const value = getTotalValue(stat);
    const percentage = getProgressPercentage(value);
    const isGroup = displayMode === 'groups';
    const isLeader = index === 0;

    return (
      <div key={stat.userId || stat.groupName || index} className="race-lane">
        <div className="race-info">
          <span className="race-rank">{getRankIcon(index)}</span>

          <div className="race-participant">
            {!isGroup && stat.agent?.profileImage ? (
              <img
                src={stat.agent.profileImage}
                alt={stat.agent?.name || stat.groupName || 'Unknown'}
                className="race-avatar"
              />
            ) : (
              <div className="race-avatar-placeholder">
                {isGroup ? '👥' : (stat.agent?.name || stat.groupName || '?').charAt(0)}
              </div>
            )}

            <div className="race-name-section">
              <div className="race-name">
                {isGroup ? stat.groupName : stat.agent?.name || 'Unknown'}
              </div>
              {isGroup && (
                <div className="race-meta">{stat.agentCount} agenter</div>
              )}
            </div>
          </div>
        </div>

        <div className="race-track">
          <div className="race-track-lines">
            <div className="track-line"></div>
            <div className="track-line"></div>
          </div>

          <div
            className={`runner ${isLeader ? 'runner-leader' : ''}`}
            style={{ left: `${percentage}%` }}
          >
            <div className="runner-icon">{getRunnerIcon(index)}</div>
            <div className="runner-value">{formatValue(stat)}</div>
            {isLeader && (
              <div className="runner-crown">👑</div>
            )}
          </div>

          {isLeader && percentage > 60 && (
            <div className="runner-cheers">🎉</div>
          )}
        </div>

        {stat.gapToLeader !== undefined && stat.gapToLeader > 0 && (
          <div className="race-gap">
            🏁 {leaderboard.sortBy === 'dealCount'
              ? `${stat.gapToLeader} affärer`
              : `${stat.gapToLeader.toLocaleString('sv-SE')} THB`} bakom
          </div>
        )}
      </div>
    );
  };

  const enableAutoScroll = leaderboard.enableAutoScroll !== undefined ? leaderboard.enableAutoScroll : true;
  const firstPlace = stats[0];
  const scrollableStats = stats.slice(1);

  return (
    <div className="race-layout">
      <div className="race-header">
        <h2>{getGoalLabel()}</h2>
        <div className="race-goal">
          <span className="goal-label">Målgång:</span>
          <span className="goal-value">{getGoalText()}</span>
        </div>
      </div>

      <div className="race-stadium">
        {/* If auto-scroll enabled and more than 1 stat, use frozen + scroll structure */}
        {enableAutoScroll && stats.length > 1 ? (
          <>
            {/* Frozen first place */}
            {firstPlace && (
              <div className="race-frozen-first">
                {renderRunner(firstPlace, 0)}
              </div>
            )}

            {/* Auto-scrolling section for the rest */}
            {scrollableStats.length > 0 && (
              <div className="race-scroll-container" ref={scrollContainerRef}>
                <div className="race-scroll-content" ref={scrollContentRef}>
                  {scrollableStats.map((stat, idx) => renderRunner(stat, idx + 1))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* No auto-scroll: show all runners normally */
          stats.map((stat, index) => renderRunner(stat, index))
        )}
      </div>

      <div className="race-finish-line">
        <div className="finish-banner">🏁 MÅLGÅNG 🏁</div>
      </div>
    </div>
  );
};

export default RaceLayout;
