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

  // Find max value for percentage calculation
  const maxValue = Math.max(...stats.map(s => getTotalValue(s)), 1);

  const getProgressPercentage = (value) => {
    return Math.min((value / maxValue) * 95, 95); // Max 95% to leave space for finish line
  };

  const getRankIcon = (index) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  };

  const formatValue = (stat) => {
    if (leaderboard.sortBy === 'dealCount') {
      return `${stat.dealCount || 0}`;
    }
    const value = getTotalValue(stat);
    return value.toLocaleString('sv-SE');
  };

  const getGoalText = () => {
    if (leaderboard.sortBy === 'dealCount') {
      return `${maxValue} affärer`;
    }
    return `${maxValue.toLocaleString('sv-SE')} THB`;
  };

  const renderRocket = (stat, index) => {
    const value = getTotalValue(stat);
    const percentage = getProgressPercentage(value);
    const isGroup = displayMode === 'groups';
    const isLeader = index === 0;

    return (
      <div key={stat.userId || stat.groupName || index} className="rocket-lane">
        <div className="rocket-info">
          <span className="rocket-rank">{getRankIcon(index)}</span>

          <div className="rocket-participant">
            {!isGroup && stat.agent?.profileImage ? (
              <img
                src={stat.agent.profileImage}
                alt={stat.agent?.name || stat.groupName || 'Unknown'}
                className="rocket-avatar"
              />
            ) : (
              <div className="rocket-avatar-placeholder">
                {isGroup ? '👥' : (stat.agent?.name || stat.groupName || '?').charAt(0)}
              </div>
            )}

            <div className="rocket-name-section">
              <div className="rocket-name">
                {isGroup ? stat.groupName : stat.agent?.name || 'Unknown'}
              </div>
              {isGroup && (
                <div className="rocket-meta">{stat.agentCount} agenter</div>
              )}
            </div>
          </div>
        </div>

        <div className="rocket-track">
          <div
            className={`rocket ${isLeader ? 'rocket-leader' : ''}`}
            style={{ left: `${percentage}%` }}
          >
            <div className="rocket-body">🚀</div>
            <div className="rocket-flame">🔥</div>
            <div className="rocket-value">{formatValue(stat)}</div>
          </div>

          {isLeader && percentage > 70 && (
            <div className="rocket-sparkles">✨✨✨</div>
          )}
        </div>

        {stat.gapToLeader !== undefined && stat.gapToLeader > 0 && (
          <div className="rocket-gap">
            📏 {leaderboard.sortBy === 'dealCount'
              ? `${stat.gapToLeader} affärer`
              : `${stat.gapToLeader.toLocaleString('sv-SE')} THB`} bakom
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="rocket-race-layout">
      <div className="rocket-race-header">
        <h2>🏁 Race mot målet!</h2>
        <div className="rocket-goal">
          <span className="goal-label">Mål:</span>
          <span className="goal-value">{getGoalText()}</span>
        </div>
      </div>

      <div className="rocket-race-track">
        {stats.map((stat, index) => renderRocket(stat, index))}
      </div>

      <div className="finish-line">
        <div className="finish-flag">🏁</div>
        <div className="finish-text">MÅLGÅNG</div>
      </div>
    </div>
  );
};

export default RocketRaceLayout;
