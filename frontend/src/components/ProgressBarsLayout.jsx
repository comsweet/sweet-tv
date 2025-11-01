import './ProgressBarsLayout.css';

const ProgressBarsLayout = ({ stats, leaderboard, displayMode }) => {
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

  return (
    <div className="progress-bars-layout">
      {stats.map((stat, index) => renderProgressBar(stat, index))}
    </div>
  );
};

export default ProgressBarsLayout;
