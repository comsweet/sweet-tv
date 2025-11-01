import './RaceLayout.css';

const RaceLayout = ({ stats, leaderboard, displayMode }) => {
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

  const getRunnerIcon = (index) => {
    if (index === 0) return '🏃‍♂️'; // Leader - running
    if (index === 1 || index === 2) return '🏃'; // Close behind
    return '🚶'; // Walking
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
              <div className="race-avatar-wrapper">
                <img
                  src={stat.agent.profileImage}
                  alt={stat.agent?.name || stat.groupName || 'Unknown'}
                  className="race-avatar"
                />
              </div>
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

  return (
    <div className="race-layout">
      <div className="race-header">
        <h2>🏁 Löpar-Race till Målet!</h2>
        <div className="race-goal">
          <span className="goal-label">Målgång:</span>
          <span className="goal-value">{getGoalText()}</span>
        </div>
      </div>

      <div className="race-stadium">
        {stats.map((stat, index) => renderRunner(stat, index))}
      </div>

      <div className="race-finish-line">
        <div className="finish-banner">🏁 MÅLGÅNG 🏁</div>
      </div>
    </div>
  );
};

export default RaceLayout;
