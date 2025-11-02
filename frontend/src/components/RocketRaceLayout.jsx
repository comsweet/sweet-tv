import { useRef, useEffect } from 'react';
import './RocketRaceLayout.css';

const RocketRaceLayout = ({ stats, leaderboard, displayMode }) => {
  const scrollContainerRef = useRef(null);
  const scrollContentRef = useRef(null);

  // Auto-scroll logic
  useEffect(() => {
    const enableAutoScroll = leaderboard.enableAutoScroll !== undefined ? leaderboard.enableAutoScroll : true;

    if (!enableAutoScroll || stats.length <= 1) return;

    const container = scrollContainerRef.current;
    const content = scrollContentRef.current;

    if (!container || !content) return;

    // Calculate scroll distance
    const containerWidth = container.clientWidth;
    const contentWidth = content.scrollWidth;
    const scrollDistance = contentWidth - containerWidth;

    if (scrollDistance <= 0) {
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
  }, [stats, leaderboard.enableAutoScroll]); // Track full stats array, not just length

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
    return Math.min((value / goalValue) * 90, 90); // Max 90% to leave space for finish
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
    return 'Race mot målet!';
  };

  const getGoalText = () => {
    if (leaderboard.sortBy === 'dealCount') {
      return `${goalValue} affärer`;
    }
    return `${goalValue.toLocaleString('sv-SE')} THB`;
  };

  const renderRocket = (stat, index) => {
    const value = getTotalValue(stat);
    const percentage = getProgressPercentage(value);
    const isGroup = displayMode === 'groups';
    const isLeader = index === 0;

    return (
      <div key={stat.userId || stat.groupName || index} className="rocket-column">
        {/* Value display at top of bar */}
        <div className="rocket-value-display">{formatValue(stat)}</div>

        {/* Vertical bar with rocket */}
        <div className="rocket-trail">
          <div
            className={`rocket-fill ${isLeader ? 'leader-fill' : ''}`}
            style={{ height: `${percentage}%` }}
          >
            <div className="rocket-shine"></div>
          </div>

          <div
            className={`rocket-sprite ${isLeader ? 'leader-rocket' : ''}`}
            style={{ bottom: `${percentage}%` }}
          >
            <div className="rocket-flame">🔥</div>
            <div className="rocket-body">🚀</div>
            {isLeader && <div className="rocket-crown">👑</div>}
          </div>
        </div>

        {/* Participant info below bar - ALWAYS VISIBLE */}
        <div className="rocket-participant-info">
          <span className="rocket-rank-badge">{getRankIcon(index)}</span>

          {!isGroup && stat.agent?.profileImage ? (
            <img
              src={stat.agent.profileImage}
              alt={stat.agent?.name || stat.groupName || 'Unknown'}
              className="rocket-avatar-img"
            />
          ) : (
            <div className="rocket-avatar-circle">
              {isGroup ? '👥' : (stat.agent?.name || stat.groupName || '?').charAt(0)}
            </div>
          )}

          <div className="rocket-name-text">
            {isGroup ? stat.groupName : stat.agent?.name || 'Unknown'}
          </div>

          {isGroup && (
            <div className="rocket-meta-text">{stat.agentCount} agenter</div>
          )}

          {stat.gapToLeader !== undefined && stat.gapToLeader > 0 && (
            <div className="rocket-gap-text">
              -{leaderboard.sortBy === 'dealCount'
                ? `${stat.gapToLeader} affärer`
                : `${stat.gapToLeader.toLocaleString('sv-SE')} THB`}
            </div>
          )}
        </div>
      </div>
    );
  };

  const enableAutoScroll = leaderboard.enableAutoScroll !== undefined ? leaderboard.enableAutoScroll : true;
  const firstPlace = stats[0];
  const scrollableStats = stats.slice(1);

  return (
    <div className="rocket-race-vertical">
      <div className="rocket-race-title">
        <h2>{getGoalLabel()}</h2>
        <div className="rocket-goal-info">
          <span className="goal-icon">🎯</span>
          <span className="goal-text">{getGoalText()}</span>
        </div>
      </div>

      <div className="finish-zone">
        <div className="finish-flag">🏁</div>
        <div className="finish-text">MÅLGÅNG</div>
      </div>

      {/* Rockets container with optional auto-scroll */}
      {enableAutoScroll && stats.length > 1 ? (
        <div className="rocket-columns-wrapper">
          {/* Frozen first place */}
          {firstPlace && (
            <div className="rocket-frozen-first">
              {renderRocket(firstPlace, 0)}
            </div>
          )}

          {/* Auto-scrolling section for the rest */}
          {scrollableStats.length > 0 && (
            <div className="rocket-scroll-container" ref={scrollContainerRef}>
              <div className="rocket-scroll-content" ref={scrollContentRef}>
                {scrollableStats.map((stat, idx) => renderRocket(stat, idx + 1))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* No auto-scroll: show all rockets normally */
        <div className="rocket-columns-container">
          {stats.map((stat, index) => renderRocket(stat, index))}
        </div>
      )}
    </div>
  );
};

export default RocketRaceLayout;
