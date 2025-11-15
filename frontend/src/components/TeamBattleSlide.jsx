import { useState, useEffect, useRef } from 'react';
import { getTeamBattleLiveScore } from '../services/api';
import './TeamBattleSlide.css';

const TeamBattleSlide = ({ battleId, leaderboard, isActive, config = {} }) => {
  const [liveScore, setLiveScore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scaleFactor, setScaleFactor] = useState(1);
  const containerRef = useRef(null);
  const contentRef = useRef(null);

  // Get battleId from prop or leaderboard
  const effectiveBattleId = battleId || leaderboard?.battleId;

  const { refreshInterval = 15000 } = config; // 15 seconds default

  // Debug: Log battleId issues
  useEffect(() => {
    if (!effectiveBattleId) {
      console.error('⚠️ TeamBattleSlide: No battleId provided!', {
        battleId,
        leaderboard,
        leaderboardId: leaderboard?.id,
        leaderboardType: leaderboard?.type,
        leaderboardBattleId: leaderboard?.battleId
      });
    }
  }, [effectiveBattleId, battleId, leaderboard]);

  // Auto-scaling logic (same as MetricsGrid)
  useEffect(() => {
    if (!containerRef.current || !contentRef.current || !isActive || !liveScore) return;

    const calculateScale = () => {
      const container = containerRef.current;
      const content = contentRef.current;

      if (!container || !content) return;

      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const contentWidth = content.scrollWidth;
      const contentHeight = content.scrollHeight;

      // Calculate scale factor to fit content
      const scaleX = containerWidth / contentWidth;
      const scaleY = containerHeight / contentHeight;
      const scale = Math.min(scaleX, scaleY, 1.4); // Max 1.4x scale

      setScaleFactor(scale);
    };

    calculateScale();

    const resizeObserver = new ResizeObserver(calculateScale);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [isActive, liveScore]);

  useEffect(() => {
    if (!isActive || !effectiveBattleId) return;

    const fetchLiveScore = async () => {
      try {
        setLoading(true);
        const response = await getTeamBattleLiveScore(effectiveBattleId);
        setLiveScore(response.data);
        setError(null);
      } catch (err) {
        console.error('Error fetching team battle live score:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchLiveScore();

    // Auto-refresh
    const interval = setInterval(fetchLiveScore, refreshInterval);
    return () => clearInterval(interval);
  }, [effectiveBattleId, isActive, refreshInterval]);

  // Show error if no battleId provided
  if (!effectiveBattleId) {
    return (
      <div className="team-battle-slide">
        <div className="team-battle-error">
          <p>⚠️ Battle ID saknas</p>
          <p className="error-message">
            Denna leaderboard har ingen kopplad battle. Kontrollera inställningarna.
            {leaderboard?.id && <><br/>Leaderboard ID: {leaderboard.id}</>}
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="team-battle-slide">
        <div className="team-battle-loading">
          <div className="spinner"></div>
          <p>Laddar team battle...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="team-battle-slide">
        <div className="team-battle-error">
          <p>⚠️ Kunde inte ladda team battle</p>
          <p className="error-message">{error}</p>
          <p className="error-message" style={{ fontSize: '1rem', marginTop: '0.5rem' }}>
            Battle ID: {effectiveBattleId}
          </p>
        </div>
      </div>
    );
  }

  if (!liveScore || !liveScore.teamScores || liveScore.teamScores.length === 0) {
    return (
      <div className="team-battle-slide">
        <div className="team-battle-no-data">
          <p>🏆 Ingen battle data tillgänglig</p>
        </div>
      </div>
    );
  }

  const { battle, teamScores, leader, leaderFormattedLeadingBy, victoryAchieved, winner } = liveScore;

  // Get max score for progress bar calculation
  const maxScore = Math.max(...teamScores.map(t => t.score));
  const targetValue = battle.targetValue;

  // Victory condition text
  const getVictoryConditionText = () => {
    switch (battle.victoryCondition) {
      case 'first_to_target':
        return `Först till ${targetValue}`;
      case 'highest_at_end':
        return 'Högst vid slutet';
      case 'best_average':
        return 'Bästa genomsnitt';
      default:
        return '';
    }
  };

  // Victory metric label
  const getMetricLabel = () => {
    switch (battle.victoryMetric) {
      case 'commission':
        return 'Commission';
      case 'deals':
        return 'Affärer';
      case 'sms_rate':
        return 'SMS Success Rate';
      case 'order_per_hour':
        return 'Affärer per timme';
      default:
        return '';
    }
  };

  // Calculate progress percentage
  const getProgressPercentage = (score) => {
    if (battle.victoryCondition === 'first_to_target' && targetValue) {
      return Math.min((score / targetValue) * 100, 100);
    } else {
      return maxScore > 0 ? (score / maxScore) * 100 : 0;
    }
  };

  // Get relevant stats to display based on victory metric
  const getDisplayStats = (teamScore) => {
    const stats = teamScore.stats;

    switch (battle.victoryMetric) {
      case 'commission':
        return [
          { label: 'Commission:', value: `${Math.round(stats.commission ?? 0).toLocaleString()} THB` },
          { label: 'Deals:', value: stats.deals ?? 0 },
          { label: 'Comm/h:', value: stats.commissionPerHour !== null ? `${Math.round(stats.commissionPerHour ?? 0).toLocaleString()} THB/h` : '-' }
        ];
      case 'deals':
        return [
          { label: 'Deals:', value: stats.deals ?? 0 },
          { label: 'Commission:', value: `${Math.round(stats.commission ?? 0).toLocaleString()} THB` },
          { label: 'Order/h:', value: stats.orderPerHour !== null ? `${(stats.orderPerHour ?? 0).toFixed(2)}` : '-' }
        ];
      case 'sms_rate':
        return [
          { label: 'SMS%:', value: `${(stats.smsRate ?? 0).toFixed(1)}%` },
          { label: 'Delivered:', value: stats.smsDelivered ?? 0 },
          { label: 'Sent:', value: stats.smsSent ?? 0 }
        ];
      case 'order_per_hour':
        return [
          { label: 'Order/h:', value: stats.orderPerHour !== null ? `${(stats.orderPerHour ?? 0).toFixed(2)}` : '-' },
          { label: 'Deals:', value: stats.deals ?? 0 },
          { label: 'Commission:', value: `${Math.round(stats.commission ?? 0).toLocaleString()} THB` }
        ];
      case 'commission_per_hour':
        return [
          { label: 'Comm/h:', value: stats.commissionPerHour !== null ? `${Math.round(stats.commissionPerHour ?? 0).toLocaleString()} THB/h` : '-' },
          { label: 'Commission:', value: `${Math.round(stats.commission ?? 0).toLocaleString()} THB` },
          { label: 'Deals:', value: stats.deals ?? 0 }
        ];
      default:
        // Fallback to original stats
        return [
          { label: 'Deals:', value: stats.deals ?? 0 },
          { label: 'SMS%:', value: `${(stats.smsRate ?? 0).toFixed(1)}%` },
          { label: 'Order/h:', value: stats.orderPerHour !== null ? `${(stats.orderPerHour ?? 0).toFixed(2)}` : '-' }
        ];
    }
  };

  return (
    <div ref={containerRef} className="team-battle-slide">
      <div
        ref={contentRef}
        className="team-battle-content"
        style={{ transform: `scale(${scaleFactor})` }}
      >
        {/* Header */}
        <div className="team-battle-header">
          <h1 className="team-battle-title">{battle.name}</h1>
          <div className="team-battle-info">
            <span className="victory-condition">{getVictoryConditionText()}</span>
            <span className="victory-metric">{getMetricLabel()}</span>
          </div>
        </div>

        {/* Victory Banner */}
        {victoryAchieved && winner && (
          <div className="victory-banner">
            <div className="victory-content">
              <div className="victory-icon">🏆</div>
              <div className="victory-text">
                <div className="victory-title">VINNARE!</div>
                <div className="victory-team">
                  {winner.teamEmoji} {winner.teamName}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Teams */}
        <div className={`team-battle-teams teams-count-${teamScores.length}`}>
          {teamScores.map((teamScore, index) => {
            const isLeader = teamScore.team.id === leader.id;
            const progressPercentage = getProgressPercentage(teamScore.score);

            return (
              <div
                key={teamScore.team.id}
                className={`team-card ${isLeader ? 'is-leader' : ''} rank-${index + 1}`}
              >
                {/* Rank Badge */}
                <div className="team-rank" style={{ backgroundColor: teamScore.team.color }}>
                  #{index + 1}
                </div>

                {/* Team Info */}
                <div className="team-info">
                  <div className="team-emoji">{teamScore.team.teamEmoji}</div>
                  <div className="team-name">{teamScore.team.teamName}</div>
                </div>

                {/* Score */}
                <div className="team-score" style={{ color: teamScore.team.color }}>
                  {teamScore.formattedScore}
                </div>

                {/* Progress Bar */}
                <div className="team-progress-container">
                  <div
                    className="team-progress-bar"
                    style={{
                      width: `${progressPercentage}%`,
                      backgroundColor: teamScore.team.color
                    }}
                  >
                    <div className="team-progress-glow"></div>
                  </div>

                  {/* Target line (only for first_to_target) */}
                  {battle.victoryCondition === 'first_to_target' && targetValue && (
                    <div className="target-line">
                      <div className="target-marker"></div>
                      <span className="target-label">Mål</span>
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="team-stats">
                  {getDisplayStats(teamScore).map((stat, idx) => (
                    <div key={idx} className="stat">
                      <span className="stat-label">{stat.label}</span>
                      <span className="stat-value">{stat.value}</span>
                    </div>
                  ))}
                </div>

                {/* Leader Badge */}
                {isLeader && !victoryAchieved && (
                  <div className="leader-badge">
                    <span className="leader-icon">👑</span>
                    <span className="leader-text">LEDER</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Leading By */}
        {!victoryAchieved && teamScores.length > 1 && (
          <div className="leading-by">
            <span className="leading-by-text">
              {leader.teamEmoji} {leader.teamName} leder med{' '}
              <span className="leading-by-value">{leaderFormattedLeadingBy}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamBattleSlide;
