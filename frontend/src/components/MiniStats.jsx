import './MiniStats.css';

const MiniStats = ({ miniStats, displayMode }) => {
  if (!miniStats) return null;

  return (
    <div className="mini-stats">
      <div className="mini-stat-card">
        <div className="mini-stat-icon">👥</div>
        <div className="mini-stat-content">
          <div className="mini-stat-value">{miniStats.participantCount}</div>
          <div className="mini-stat-label">{displayMode === 'groups' ? 'Grupper' : 'Agenter'}</div>
        </div>
      </div>

      <div className="mini-stat-card">
        <div className="mini-stat-icon">🎯</div>
        <div className="mini-stat-content">
          <div className="mini-stat-value">{miniStats.totalDeals}</div>
          <div className="mini-stat-label">Affärer</div>
        </div>
      </div>

      <div className="mini-stat-card">
        <div className="mini-stat-icon">💰</div>
        <div className="mini-stat-content">
          <div className="mini-stat-value">{miniStats.totalCommission.toLocaleString('sv-SE')}</div>
          <div className="mini-stat-label">Provision</div>
        </div>
      </div>

      <div className="mini-stat-card">
        <div className="mini-stat-icon">💸</div>
        <div className="mini-stat-content">
          <div className="mini-stat-value">{miniStats.totalBonus.toLocaleString('sv-SE')}</div>
          <div className="mini-stat-label">Bonus</div>
        </div>
      </div>

      <div className="mini-stat-card highlight">
        <div className="mini-stat-icon">💎</div>
        <div className="mini-stat-content">
          <div className="mini-stat-value">{miniStats.grandTotal.toLocaleString('sv-SE')}</div>
          <div className="mini-stat-label">TOTALT</div>
        </div>
      </div>
    </div>
  );
};

export default MiniStats;
