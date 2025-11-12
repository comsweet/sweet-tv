import { useState, useEffect, useRef } from 'react';
import { getGoalProgress } from '../services/api';
import './GoalProgressSlide.css';

const GoalProgressSlide = ({ leaderboard, isActive, config = {} }) => {
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scaleFactor, setScaleFactor] = useState(1);
  const containerRef = useRef(null);
  const contentRef = useRef(null);

  const { refreshInterval = 60000 } = config; // 1 minute default

  // Auto-scaling logic (same as MetricsGrid)
  useEffect(() => {
    if (!containerRef.current || !contentRef.current || !isActive || !progress) return;

    const calculateScale = () => {
      const container = containerRef.current;
      const content = contentRef.current;

      if (!container || !content) return;

      const containerHeight = container.clientHeight;
      const contentHeight = content.scrollHeight;

      if (contentHeight > containerHeight) {
        const newScale = Math.min(1, (containerHeight * 0.95) / contentHeight);
        setScaleFactor(newScale);
      } else {
        setScaleFactor(1);
      }
    };

    const timer = setTimeout(calculateScale, 100);
    window.addEventListener('resize', calculateScale);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', calculateScale);
    };
  }, [isActive, progress]);

  useEffect(() => {
    if (!isActive || !leaderboard) return;

    const fetchProgress = async () => {
      try {
        setLoading(true);
        const response = await getGoalProgress(leaderboard.id);
        setProgress(response.data);
        setError(null);
      } catch (err) {
        console.error('Error fetching goal progress:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProgress();

    const interval = setInterval(fetchProgress, refreshInterval);
    return () => clearInterval(interval);
  }, [leaderboard, isActive, refreshInterval]);

  if (loading) {
    return (
      <div className="goal-progress-slide">
        <div className="goal-loading">
          <div className="spinner"></div>
          <p>Laddar målstatus...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="goal-progress-slide">
        <div className="goal-error">
          <p>⚠️ Kunde inte ladda målstatus</p>
        </div>
      </div>
    );
  }

  if (!progress || !progress.goals || progress.goals.length === 0) {
    return (
      <div className="goal-progress-slide">
        <div className="goal-no-data">
          <p>🎯 Inga mål är inställda</p>
          <p className="goal-hint">Konfigurera mål i admin-panelen</p>
        </div>
      </div>
    );
  }

  const getProgressColor = (percent) => {
    if (percent >= 100) return '#10b981'; // Green - goal reached!
    if (percent >= 80) return '#3b82f6';  // Blue - almost there
    if (percent >= 60) return '#f59e0b';  // Orange - halfway
    return '#ef4444';                      // Red - needs work
  };

  const getStatusIcon = (percent) => {
    if (percent >= 100) return '🎉';
    if (percent >= 80) return '🔥';
    if (percent >= 60) return '💪';
    return '🎯';
  };

  const formatValue = (goal) => {
    switch (goal.metric) {
      case 'deals':
        return `${goal.current}/${goal.target}`;
      case 'commission':
        return `${Math.round(goal.current / 1000)}K/${Math.round(goal.target / 1000)}K THB`;
      case 'sms_rate':
        return `${Math.round(goal.current)}%/${Math.round(goal.target)}%`;
      case 'order_per_hour':
        return `${goal.current.toFixed(2)}/${goal.target.toFixed(2)}`;
      default:
        return `${goal.current}/${goal.target}`;
    }
  };

  const getMetricLabel = (metric) => {
    const labels = {
      deals: 'Deals',
      commission: 'Provision',
      sms_rate: 'SMS Success Rate',
      order_per_hour: 'Order/Timme'
    };
    return labels[metric] || metric;
  };

  const daysLeft = progress.period?.daysLeft || 0;
  const periodName = progress.period?.name || 'Denna period';

  return (
    <div className="goal-progress-slide" ref={containerRef}>
      <div
        className="goal-content"
        ref={contentRef}
        style={{
          transform: scaleFactor < 1 ? `scale(${scaleFactor})` : 'none',
          transformOrigin: 'top center'
        }}
      >
        <div className="goal-header">
          <h1 className="goal-title">🎯 {leaderboard.name}</h1>
          <p className="goal-subtitle">{periodName}</p>
          {daysLeft > 0 && (
            <p className="goal-time-left">
              ⏰ {daysLeft} dag{daysLeft !== 1 ? 'ar' : ''} kvar!
            </p>
          )}
        </div>

        <div className="goals-container">
          {progress.goals.map((goal, index) => {
            const percent = Math.min(100, (goal.current / goal.target) * 100);
            const color = getProgressColor(percent);
            const icon = getStatusIcon(percent);

            return (
              <div key={index} className="goal-item">
                <div className="goal-item-header">
                  <span className="goal-icon">{icon}</span>
                  <span className="goal-label">{getMetricLabel(goal.metric)}</span>
                  <span className="goal-value">{formatValue(goal)}</span>
                </div>

                <div className="progress-bar-container">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${percent}%`,
                      backgroundColor: color,
                      boxShadow: `0 0 20px ${color}80`
                    }}
                  >
                    {percent >= 15 && (
                      <span className="progress-text">
                        {Math.round(percent)}%
                      </span>
                    )}
                  </div>
                  {percent < 15 && (
                    <span className="progress-text-outside" style={{ color }}>
                      {Math.round(percent)}%
                    </span>
                  )}
                </div>

                {percent >= 100 && (
                  <div className="goal-achieved">
                    <span className="goal-achieved-badge">✅ Mål uppnått!</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Overall team status */}
        <div className="goal-summary">
          <div className="summary-stat">
            <span className="summary-label">Mål uppnådda</span>
            <span className="summary-value">
              {progress.goals.filter(g => (g.current / g.target) >= 1).length} / {progress.goals.length}
            </span>
          </div>
          {progress.totalMembers && (
            <div className="summary-stat">
              <span className="summary-label">Teammedlemmar</span>
              <span className="summary-value">{progress.totalMembers}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GoalProgressSlide;
