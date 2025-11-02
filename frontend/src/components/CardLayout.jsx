import { useRef, useEffect } from 'react';
import './CardLayout.css';

const CardLayout = ({ stats, leaderboard, displayMode }) => {
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

  const formatValue = (stat) => {
    if (leaderboard.sortBy === 'dealCount') {
      return `${stat.dealCount || 0} affärer`;
    }
    const value = getTotalValue(stat);
    return `${value.toLocaleString('sv-SE')} THB`;
  };

  const getCardClass = (index, value) => {
    if (index === 0) return 'gold';
    if (index === 1) return 'silver';
    if (index === 2) return 'bronze';
    if (value === 0) return 'zero';
    return 'default';
  };

  const getRankIcon = (index) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  };

  const renderCard = (stat, index) => {
    const value = getTotalValue(stat);
    const cardClass = getCardClass(index, value);
    const isGroup = displayMode === 'groups';

    return (
      <div key={stat.userId || stat.groupName || index} className={`leaderboard-card ${cardClass}`}>
        <div className="card-rank">{getRankIcon(index)}</div>

        <div className="card-avatar-section">
          {!isGroup && stat.agent?.profileImage ? (
            <img
              src={stat.agent.profileImage}
              alt={stat.agent?.name || stat.groupName || 'Unknown'}
              className="card-avatar"
            />
          ) : (
            <div className="card-avatar-placeholder">
              {isGroup ? '👥' : (stat.agent?.name || stat.groupName || '?').charAt(0)}
            </div>
          )}
        </div>

        <div className="card-info">
          <h3 className="card-name">
            {isGroup ? stat.groupName : stat.agent?.name || 'Unknown'}
          </h3>

          {isGroup && (
            <div className="card-meta">
              {stat.agentCount} agenter • Ø {stat.avgDeals.toFixed(1)} affärer
            </div>
          )}

          {!isGroup && stat.agent?.groupName && (
            <div className="card-group-badge">{stat.agent.groupName}</div>
          )}
        </div>

        <div className="card-stats">
          <div className="card-main-stat">
            {formatValue(stat)}
          </div>

          {leaderboard.visibleColumns?.deals && (
            <div className="card-sub-stat">
              <span className="stat-icon">🎯</span>
              <span>{stat.dealCount || 0} affärer</span>
            </div>
          )}

          {leaderboard.visibleColumns?.sms && !isGroup && (
            <div className="card-sub-stat">
              <span className="stat-icon">📱</span>
              <span>{(stat.smsSuccessRate || 0).toFixed(1)}% ({stat.uniqueSMS || 0} SMS)</span>
            </div>
          )}

          {stat.gapToLeader !== undefined && stat.gapToLeader > 0 && (
            <div className="card-gap">
              <span className="gap-icon">📏</span>
              <span className="gap-text">
                {leaderboard.sortBy === 'dealCount'
                  ? `${stat.gapToLeader} affärer bakom`
                  : `${stat.gapToLeader.toLocaleString('sv-SE')} THB bakom`}
              </span>
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
    <div className="card-layout">
      {/* If auto-scroll enabled and more than 1 stat, use frozen + scroll structure */}
      {enableAutoScroll && stats.length > 1 ? (
        <>
          {/* Frozen first place */}
          {firstPlace && (
            <div className="card-frozen-first">
              {renderCard(firstPlace, 0)}
            </div>
          )}

          {/* Auto-scrolling section for the rest */}
          {scrollableStats.length > 0 && (
            <div className="card-scroll-container" ref={scrollContainerRef}>
              <div className="card-scroll-content" ref={scrollContentRef}>
                {scrollableStats.map((stat, idx) => renderCard(stat, idx + 1))}
              </div>
            </div>
          )}
        </>
      ) : (
        /* No auto-scroll: show all cards normally */
        stats.map((stat, index) => renderCard(stat, index))
      )}
    </div>
  );
};

export default CardLayout;
