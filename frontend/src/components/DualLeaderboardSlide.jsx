// INLINE CSS VERSION - frontend/src/components/DualLeaderboardSlide.jsx
// Använd denna om CSS-filen inte laddas!

import { useState, useEffect } from 'react';

// 🔥 INLINE STYLES - Garanterat att fungera!
const styles = {
  slide: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    transform: 'translateX(100%) scale(0.9)',
    transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
    pointerEvents: 'none'
  },
  slideActive: {
    opacity: 1,
    transform: 'translateX(0) scale(1)',
    pointerEvents: 'all'
  },
  container: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '2rem',
    height: '100vh',
    padding: '3rem 2rem 2rem',
    boxSizing: 'border-box'
  },
  column: {
    background: 'rgba(255, 255, 255, 0.95)',
    borderRadius: '20px',
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
    overflow: 'hidden'
  },
  header: {
    textAlign: 'center',
    marginBottom: '1rem',
    paddingBottom: '0.8rem',
    borderBottom: '3px solid #667eea',
    flexShrink: 0
  },
  headerTitle: {
    margin: 0,
    fontSize: '1.6rem',
    color: '#2c3e50',
    fontWeight: 'bold'
  },
  period: {
    margin: '0.3rem 0 0',
    fontSize: '0.95rem',
    color: '#7f8c8d'
  },
  stats: {
    margin: '0.3rem 0 0',
    fontSize: '0.85rem',
    color: '#95a5a6'
  },
  scrollContainer: {
    position: 'relative',
    overflow: 'hidden',
    flex: 1
  },
  items: {
    willChange: 'transform'
  },
  item: {
    display: 'grid',
    gridTemplateColumns: '50px 40px 1fr 100px 130px',
    alignItems: 'center',
    gap: '0.6rem',
    padding: '0.4rem 0.8rem',
    marginBottom: '0.4rem',
    background: 'rgba(255, 255, 255, 0.95)',
    borderRadius: '10px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    transition: 'all 0.3s ease'
  },
  itemFirstPlace: {
    background: 'linear-gradient(135deg, #ffd700 0%, #ffed4e 100%)',
    borderColor: '#ffd700',
    borderWidth: '3px',
    transform: 'scale(1.02)',
    boxShadow: '0 8px 30px rgba(255, 215, 0, 0.4)'
  },
  rank: {
    fontSize: '1.1rem',
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#2c3e50'
  },
  avatar: {
    width: '35px',
    height: '35px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '2px solid rgba(102, 126, 234, 0.3)',
    flexShrink: 0
  },
  avatarPlaceholder: {
    width: '35px',
    height: '35px',
    borderRadius: '50%',
    border: '2px solid rgba(102, 126, 234, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    fontSize: '0.9rem',
    fontWeight: 'bold'
  },
  info: {
    minWidth: 0
  },
  name: {
    margin: 0,
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#2c3e50',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  nameZero: {
    color: '#e74c3c'
  },
  deals: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.3rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#2c3e50'
  },
  commission: {
    fontSize: '0.95rem',
    fontWeight: 'bold',
    textAlign: 'right',
    whiteSpace: 'nowrap'
  },
  commissionZero: {
    color: '#e74c3c'
  },
  commissionLow: {
    color: '#e67e22'
  },
  commissionHigh: {
    color: '#27ae60'
  },
  scrollIndicator: {
    textAlign: 'center',
    padding: '0.5rem',
    background: 'rgba(102, 126, 234, 0.1)',
    borderRadius: '8px',
    marginTop: '0.5rem',
    flexShrink: 0
  },
  scrollIndicatorText: {
    fontSize: '0.85rem',
    color: '#667eea',
    fontWeight: 500
  }
};

const DualLeaderboardSlide = ({ leftLeaderboard, rightLeaderboard, leftStats, rightStats, isActive }) => {
  const [scrollPosition, setScrollPosition] = useState(0);

  if (!leftLeaderboard || !rightLeaderboard || !Array.isArray(leftStats) || !Array.isArray(rightStats)) {
    console.error('❌ DualLeaderboardSlide: Missing required data');
    return null;
  }

  const getTimePeriodLabel = (period) => {
    const labels = {
      day: 'Idag',
      week: 'Denna vecka',
      month: 'Denna månad',
      custom: 'Anpassat'
    };
    return labels[period] || period;
  };

  const getCommissionStyle = (commission) => {
    if (!commission || commission === 0) return styles.commissionZero;
    if (commission < 3400) return styles.commissionLow;
    return styles.commissionHigh;
  };

  // Auto-scroll logic
  const rowHeight = 52;
  const visibleRows = 18;
  const maxAgents = Math.max(leftStats.length, rightStats.length);
  const needsScroll = maxAgents > visibleRows;
  const maxScroll = needsScroll ? (maxAgents - visibleRows) * rowHeight : 0;

  useEffect(() => {
    if (!isActive || !needsScroll) return;

    const interval = setInterval(() => {
      setScrollPosition(prev => {
        const newPosition = prev + 1;
        if (newPosition >= maxScroll) {
          setTimeout(() => setScrollPosition(0), 2000);
          return maxScroll;
        }
        return newPosition;
      });
    }, 30);

    return () => clearInterval(interval);
  }, [isActive, needsScroll, maxScroll]);

  useEffect(() => {
    if (!isActive) {
      setScrollPosition(0);
    }
  }, [isActive]);

  const LeaderboardColumn = ({ leaderboard, stats }) => {
    if (!leaderboard || !Array.isArray(stats)) return null;

    const totalDeals = stats.reduce((sum, stat) => sum + (stat.dealCount || 0), 0);

    return (
      <div style={styles.column}>
        <div style={styles.header}>
          <h2 style={styles.headerTitle}>{leaderboard.name || 'Unnamed'}</h2>
          <p style={styles.period}>{getTimePeriodLabel(leaderboard.timePeriod)}</p>
          <p style={styles.stats}>
            📊 {totalDeals} {totalDeals === 1 ? 'affär' : 'affärer'} • {stats.length} {stats.length === 1 ? 'agent' : 'agenter'}
          </p>
        </div>

        <div style={{ ...styles.scrollContainer, height: `${visibleRows * rowHeight}px` }}>
          <div
            style={{
              ...styles.items,
              transform: `translateY(-${scrollPosition}px)`,
              transition: 'transform 0.1s linear'
            }}
          >
            {stats.map((item, index) => {
              if (!item || !item.agent) return null;

              const isZeroDeals = !item.dealCount || item.dealCount === 0;
              const isFirstPlace = index === 0 && !isZeroDeals;
              const commission = item.totalCommission || 0;

              const itemStyle = {
                ...styles.item,
                height: `${rowHeight}px`,
                ...(isFirstPlace ? styles.itemFirstPlace : {})
              };

              return (
                <div key={`${item.userId || index}-${item.agent.id || index}`} style={itemStyle}>
                  {/* Rank */}
                  <div style={styles.rank}>
                    {index === 0 && !isZeroDeals && '🥇'}
                    {index === 1 && !isZeroDeals && '🥈'}
                    {index === 2 && !isZeroDeals && '🥉'}
                    {(index > 2 || isZeroDeals) && `#${index + 1}`}
                  </div>

                  {/* Avatar */}
                  {item.agent.profileImage ? (
                    <img
                      src={item.agent.profileImage}
                      alt={item.agent.name || 'Agent'}
                      style={styles.avatar}
                    />
                  ) : (
                    <div style={styles.avatarPlaceholder}>
                      {(item.agent.name && item.agent.name.charAt(0)) || '?'}
                    </div>
                  )}

                  {/* Name */}
                  <div style={styles.info}>
                    <p style={{ ...styles.name, ...(isZeroDeals ? styles.nameZero : {}) }}>
                      {item.agent.name || `Agent ${item.userId || '?'}`}
                    </p>
                  </div>

                  {/* Deals */}
                  <div style={styles.deals}>
                    <span>❤️</span>
                    <span style={isZeroDeals ? styles.nameZero : {}}>{item.dealCount || 0}</span>
                  </div>

                  {/* Commission */}
                  <div style={{ ...styles.commission, ...getCommissionStyle(commission) }}>
                    {commission.toLocaleString('sv-SE')} THB
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {needsScroll && (
          <div style={styles.scrollIndicator}>
            <span style={styles.scrollIndicatorText}>Scrollar automatiskt...</span>
          </div>
        )}
      </div>
    );
  };

  const slideStyle = {
    ...styles.slide,
    ...(isActive ? styles.slideActive : {})
  };

  return (
    <div style={slideStyle}>
      <div style={styles.container}>
        <LeaderboardColumn leaderboard={leftLeaderboard} stats={leftStats} />
        <LeaderboardColumn leaderboard={rightLeaderboard} stats={rightStats} />
      </div>
    </div>
  );
};

export default DualLeaderboardSlide;
