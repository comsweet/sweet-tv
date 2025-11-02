import './RocketRaceLayout.css';

const RocketRaceLayout = ({ stats, leaderboard, displayMode }) => {
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
        {/* Participant info at BOTTOM - always visible */}
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

        {/* Thin trail line - see space background through it */}
        <div className="rocket-trail">
          {/* Rocket flying at the right height */}
          <div
            className={`rocket-sprite ${isLeader ? 'leader-rocket' : ''}`}
            style={{ bottom: `${percentage}%` }}
          >
            {/* Value ABOVE rocket - doesn't cover anything */}
            <div className="rocket-value-display">{formatValue(stat)}</div>

            <div className="rocket-body">🚀</div>
            <div className="rocket-flame">🔥</div>
            {isLeader && <div className="rocket-crown">👑</div>}
          </div>
        </div>
      </div>
    );
  };

  // Calculate responsive column width based on number of participants
  const participantCount = stats.length;
  const getResponsiveClass = () => {
    if (participantCount <= 3) return 'rockets-few'; // 3 or less
    if (participantCount <= 5) return 'rockets-medium'; // 4-5
    if (participantCount <= 8) return 'rockets-many'; // 6-8
    return 'rockets-lots'; // 9+
  };

  return (
    <div className={`rocket-race-vertical ${getResponsiveClass()}`}>
      <div className="rocket-race-title">
        <h2>{getGoalLabel()}</h2>
      </div>

      <div className="finish-zone">
        <div className="finish-flag">🏁</div>
        <div className="finish-text">MÅLGÅNG</div>
        <div className="finish-value">{getGoalText()}</div>
      </div>

      {/* Rockets fly upward toward finish line */}
      <div className="rocket-columns-container">
        {stats.map((stat, index) => renderRocket(stat, index))}
      </div>
    </div>
  );
};

export default RocketRaceLayout;
