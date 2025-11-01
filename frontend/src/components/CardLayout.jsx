import './CardLayout.css';

const CardLayout = ({ stats, leaderboard, displayMode }) => {
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

  return (
    <div className="card-layout">
      {stats.map((stat, index) => renderCard(stat, index))}
    </div>
  );
};

export default CardLayout;
