import { useRef, useEffect } from 'react';
import './ProgressBarsLayout.css';

const ProgressBarsLayout = ({ stats, leaderboard, displayMode }) => {
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
    const containerHeight = container.clientHeight;
    const contentHeight = content.scrollHeight;
    const scrollDistance = contentHeight - containerHeight;

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
  }, [stats.length, leaderboard.enableAutoScroll]);

  const getTotalValue = (stat) => {
    if (leaderboard.sortBy === 'dealCount') {
      return stat.dealCount || 0;
    } else if (leaderboard.sortBy === 'total') {
      return (stat.totalCommission || 0) + (stat.campaignBonus || 0);
    }
    return stat.totalCommission || 0;
  };

  // Find max value for percentage calculation
  const maxValue = Math.max(...stats.map(s => getTotalValue(s)), 1);

  const getProgressPercentage = (value) => {
    return (value / maxValue) * 100;
  };

  const getBarColor = (index, value) => {
    if (value === 0) return '#e53e3e';
    if (index === 0) return '#ffd700';
    if (index === 1) return '#c0c0c0';
    if (index === 2) return '#cd7f32';
    return '#667eea';
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

  const renderProgressBar = (stat, index) => {
    const value = getTotalValue(stat);
    const percentage = getProgressPercentage(value);
    const barColor = getBarColor(index, value);
    const isGroup = displayMode === 'groups';

    return (
      <div key={stat.userId || stat.groupName || index} className="progress-bar-item">
        <div className="progress-bar-header">
          <div className="progress-bar-left">
            <span className="progress-rank">{getRankIcon(index)}</span>

            {!isGroup && stat.agent?.profileImage ? (
              <img
                src={stat.agent.profileImage}
                alt={stat.agent?.name || stat.groupName || 'Unknown'}
                className="progress-avatar"
              />
            ) : (
              <div className="progress-avatar-placeholder">
                {isGroup ? '👥' : (stat.agent?.name || stat.groupName || '?').charAt(0)}
              </div>
            )}

            <div className="progress-info">
              <div className="progress-name">
                {isGroup ? stat.groupName : stat.agent?.name || 'Unknown'}
              </div>
              {isGroup && (
                <div className="progress-meta">
                  {stat.agentCount} agenter
                </div>
              )}
              {!isGroup && stat.agent?.groupName && (
                <div className="progress-meta">{stat.agent.groupName}</div>
              )}
            </div>
          </div>

          <div className="progress-bar-right">
            <div className="progress-value">{formatValue(stat)}</div>
            {stat.gapToLeader !== undefined && stat.gapToLeader > 0 && (
              <div className="progress-gap">
                -{leaderboard.sortBy === 'dealCount'
                  ? `${stat.gapToLeader}`
                  : `${stat.gapToLeader.toLocaleString('sv-SE')} THB`}
              </div>
            )}
          </div>
        </div>

        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{
              width: `${percentage}%`,
              backgroundColor: barColor
            }}
          >
            <div className="progress-bar-shine"></div>
          </div>
          <div className="progress-bar-percentage">{percentage.toFixed(0)}%</div>
        </div>

        {leaderboard.visibleColumns && (
          <div className="progress-sub-stats">
            {leaderboard.visibleColumns.deals && (
              <span className="progress-sub-stat">🎯 {stat.dealCount || 0}</span>
            )}
            {leaderboard.visibleColumns.sms && !isGroup && (
              <span className="progress-sub-stat">📱 {(stat.smsSuccessRate || 0).toFixed(1)}%</span>
            )}
            {leaderboard.visibleColumns.commission && (
              <span className="progress-sub-stat">💰 {(stat.totalCommission || 0).toLocaleString('sv-SE')}</span>
            )}
            {leaderboard.visibleColumns.campaignBonus && stat.campaignBonus > 0 && (
              <span className="progress-sub-stat">💸 {(stat.campaignBonus || 0).toLocaleString('sv-SE')}</span>
            )}
          </div>
        )}
      </div>
    );
  };

  const enableAutoScroll = leaderboard.enableAutoScroll !== undefined ? leaderboard.enableAutoScroll : true;
  const firstPlace = stats[0];
  const scrollableStats = stats.slice(1);

  return (
    <div className="progress-bars-layout">
      {/* If auto-scroll enabled and more than 1 stat, use frozen + scroll structure */}
      {enableAutoScroll && stats.length > 1 ? (
        <>
          {/* Frozen first place */}
          {firstPlace && (
            <div className="progress-frozen-first">
              {renderProgressBar(firstPlace, 0)}
            </div>
          )}

          {/* Auto-scrolling section for the rest */}
          {scrollableStats.length > 0 && (
            <div className="progress-scroll-container" ref={scrollContainerRef}>
              <div className="progress-scroll-content" ref={scrollContentRef}>
                {scrollableStats.map((stat, idx) => renderProgressBar(stat, idx + 1))}
              </div>
            </div>
          )}
        </>
      ) : (
        /* No auto-scroll: show all progress bars normally */
        stats.map((stat, index) => renderProgressBar(stat, index))
      )}
    </div>
  );
};

export default ProgressBarsLayout;
