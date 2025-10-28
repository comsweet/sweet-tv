// ✨ TV-RESPONSIV VERSION - frontend/src/components/DualLeaderboardSlide.jsx
// ÄNDRINGAR:
// 1. Ökat gap mellan kolumner (0.6rem → 1.5rem) - LÖSER DITT PROBLEM
// 2. Responsiv för 1080p, 2K, och 4K TV-skärmar
// 3. BEHÅLLER original textstorlekar (inget större)
// 4. Proportionell skalning för olika upplösningar

import { useState, useEffect } from 'react';

// 🎨 BASE STYLES - Optimerat för 1080p (1920x1080)
const getResponsiveStyles = () => {
  const width = window.innerWidth;
  
  // 📺 Detektera TV-upplösning
  let scale = 1;
  if (width >= 3840) {
    // 4K (3840x2160)
    scale = 2;
  } else if (width >= 2560) {
    // 2K (2560x1440)
    scale = 1.35;
  } else {
    // 1080p (1920x1080)
    scale = 1;
  }
  
  return {
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
      gap: `${2 * scale}rem`,
      height: '100vh',
      padding: `${3 * scale}rem ${2 * scale}rem ${2 * scale}rem`,
      boxSizing: 'border-box'
    },
    column: {
      background: 'rgba(255, 255, 255, 0.95)',
      borderRadius: `${20 * scale}px`,
      padding: `${1.5 * scale}rem`,
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
      overflow: 'hidden'
    },
    header: {
      textAlign: 'center',
      marginBottom: `${1 * scale}rem`,
      paddingBottom: `${0.8 * scale}rem`,
      borderBottom: `${3 * scale}px solid #667eea`,
      flexShrink: 0
    },
    headerTitle: {
      margin: 0,
      fontSize: `${1.6 * scale}rem`,
      color: '#2c3e50',
      fontWeight: 'bold'
    },
    period: {
      margin: `${0.3 * scale}rem 0 0`,
      fontSize: `${0.95 * scale}rem`,
      color: '#7f8c8d'
    },
    stats: {
      margin: `${0.3 * scale}rem 0 0`,
      fontSize: `${0.85 * scale}rem`,
      color: '#95a5a6'
    },
    frozenSection: {
      flexShrink: 0,
      marginBottom: `${0.8 * scale}rem`,
      paddingBottom: `${0.8 * scale}rem`,
      borderBottom: `${2 * scale}px solid rgba(102, 126, 234, 0.2)`,
      background: 'linear-gradient(180deg, rgba(102, 126, 234, 0.05) 0%, transparent 100%)',
      borderRadius: `${10 * scale}px`,
      padding: `${0.5 * scale}rem`
    },
    scrollContainer: {
      position: 'relative',
      overflow: 'hidden',
      flex: 1
    },
    items: {
      willChange: 'transform'
    },
    // ✨ HUVUDÄNDRING: Mer gap mellan kolumner
    item: {
      display: 'grid',
      gridTemplateColumns: `${50 * scale}px ${40 * scale}px minmax(${150 * scale}px, 1fr) ${120 * scale}px ${140 * scale}px ${160 * scale}px`,
      alignItems: 'center',
      gap: `${1.5 * scale}rem`, // 🔥 ÖKAT från 0.6rem - LÖSER DITT PROBLEM
      padding: `${0.6 * scale}rem ${1 * scale}rem`,
      marginBottom: `${0.5 * scale}rem`,
      background: 'rgba(255, 255, 255, 0.95)',
      borderRadius: `${12 * scale}px`,
      border: `${2 * scale}px solid rgba(255, 255, 255, 0.3)`,
      transition: 'all 0.3s ease',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
    },
    itemFirstPlace: {
      background: 'linear-gradient(135deg, #ffd700 0%, #ffed4e 100%)',
      borderColor: '#ffd700',
      borderWidth: `${3 * scale}px`,
      transform: 'scale(1.02)',
      boxShadow: '0 8px 30px rgba(255, 215, 0, 0.4)'
    },
    itemSecondPlace: {
      background: 'linear-gradient(135deg, #e8e8e8 0%, #f5f5f5 100%)',
      borderColor: '#c0c0c0',
      borderWidth: `${2.5 * scale}px`
    },
    // itemThirdPlace borttagen - trean får samma style som alla andra
    itemFrozen: {
      position: 'relative',
      zIndex: 10,
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
    },
    itemZeroDeals: {
      opacity: 0.6,
      background: 'rgba(255, 255, 255, 0.7)'
    },
    rank: {
      fontSize: `${1.5 * scale}rem`, // ✨ ÖKAT från 1.1rem - Större medaljer!
      fontWeight: 'bold',
      textAlign: 'center',
      color: '#2c3e50',
      flexShrink: 0
    },
    avatar: {
      width: `${40 * scale}px`, // Original storlek
      height: `${40 * scale}px`,
      borderRadius: '50%',
      objectFit: 'cover',
      border: `${2 * scale}px solid rgba(102, 126, 234, 0.3)`,
      flexShrink: 0
    },
    avatarPlaceholder: {
      width: `${40 * scale}px`,
      height: `${40 * scale}px`,
      borderRadius: '50%',
      border: `${2 * scale}px solid rgba(102, 126, 234, 0.3)`,
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: `${1 * scale}rem`,
      fontWeight: 'bold',
      flexShrink: 0
    },
    info: {
      minWidth: 0,
      maxWidth: `${280 * scale}px`,
      overflow: 'hidden'
    },
    name: {
      margin: 0,
      fontSize: `${0.95 * scale}rem`, // Original storlek
      fontWeight: '600',
      color: '#2c3e50',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    },
    nameZeroDeals: {
      color: '#e74c3c'
    },
    // ✨ Deals kolumn med mer utrymme
    dealsSection: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: `${0.4 * scale}rem`,
      fontSize: `${1 * scale}rem`, // Original storlek
      fontWeight: '600',
      color: '#2c3e50'
    },
    dealsSectionZero: {
      color: '#e74c3c'
    },
    dealEmoji: {
      fontSize: `${1 * scale}rem`
    },
    // ✨ SMS Box med mer utrymme
    smsBox: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: `${0.5 * scale}rem ${0.8 * scale}rem`,
      borderRadius: `${10 * scale}px`,
      minWidth: `${110 * scale}px`,
      transition: 'all 0.2s ease',
      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.1)'
    },
    smsRate: {
      fontSize: `${1 * scale}rem`, // Original storlek
      fontWeight: '700',
      lineHeight: 1.2,
      color: 'white'
    },
    smsCount: {
      fontSize: `${0.75 * scale}rem`,
      color: 'rgba(0, 0, 0, 0.8)',
      fontWeight: '600',
      marginTop: `${0.15 * scale}rem`
    },
    smsGreen: {
      background: 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)'
    },
    smsOrange: {
      background: 'linear-gradient(135deg, #f39c12 0%, #e67e22 100%)'
    },
    smsRed: {
      background: 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)'
    },
    // ✨ Commission med mer utrymme
    commission: {
      fontSize: `${0.95 * scale}rem`, // Original storlek
      fontWeight: 'bold',
      textAlign: 'right',
      whiteSpace: 'nowrap',
      padding: `${0.4 * scale}rem ${0.6 * scale}rem`
    },
    commissionZero: {
      color: '#e74c3c'
    },
    commissionLow: {
      color: '#2c3e50' // Svart för under threshold
    },
    commissionHigh: {
      color: '#27ae60' // Grön för över threshold
    },
    scrollIndicator: {
      textAlign: 'center',
      padding: `${0.5 * scale}rem`,
      background: 'rgba(102, 126, 234, 0.1)',
      borderRadius: `${8 * scale}px`,
      marginTop: `${0.5 * scale}rem`,
      flexShrink: 0
    },
    scrollIndicatorText: {
      fontSize: `${0.85 * scale}rem`,
      color: '#667eea',
      fontWeight: 500
    }
  };
};

const DualLeaderboardSlide = ({ leftLeaderboard, rightLeaderboard, leftStats, rightStats, isActive }) => {
  const [leftScrollPosition, setLeftScrollPosition] = useState(0);
  const [rightScrollPosition, setRightScrollPosition] = useState(0);
  const [styles, setStyles] = useState(getResponsiveStyles());

  // 📺 Update styles on window resize (TV-upplösning ändras)
  useEffect(() => {
    const handleResize = () => {
      setStyles(getResponsiveStyles());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  // Dynamisk färglogik baserat på timePeriod
  const getCommissionStyle = (commission, timePeriod) => {
    if (!commission || commission === 0) {
      return styles.commissionZero;
    }

    // Olika trösklar för olika perioder
    if (timePeriod === 'day') {
      return commission < 3400 ? styles.commissionLow : styles.commissionHigh;
    } else if (timePeriod === 'week') {
      return commission < 18000 ? styles.commissionLow : styles.commissionHigh;
    } else if (timePeriod === 'month') {
      return commission < 50000 ? styles.commissionLow : styles.commissionHigh;
    } else {
      return commission < 50000 ? styles.commissionLow : styles.commissionHigh;
    }
  };

  // SMS färglogik
  const getSmsStyle = (successRate) => {
    if (successRate >= 75) return styles.smsGreen;
    if (successRate >= 60) return styles.smsOrange;
    return styles.smsRed;
  };

  // Reset scroll when slide becomes inactive
  useEffect(() => {
    if (!isActive) {
      setLeftScrollPosition(0);
      setRightScrollPosition(0);
    }
  }, [isActive]);

  const LeaderboardColumn = ({ leaderboard, stats, side }) => {
    if (!leaderboard || !Array.isArray(stats)) return null;

    const totalDeals = stats.reduce((sum, stat) => sum + (stat.dealCount || 0), 0);

    // Freeze top 3
    const frozenCount = 3;
    const topStats = stats.slice(0, frozenCount);
    const scrollableStats = stats.slice(frozenCount);

    // Auto-scroll settings med dynamisk scale
    const scale = window.innerWidth >= 3840 ? 2 : window.innerWidth >= 2560 ? 1.35 : 1;
    const rowHeight = 52 * scale;
    const marginPerRow = 6.4 * scale;
    const effectiveRowHeight = rowHeight + marginPerRow;
    const visibleRows = 15;
    const needsScroll = scrollableStats.length > visibleRows;
    
    const containerHeight = visibleRows * effectiveRowHeight;
    const totalContentHeight = scrollableStats.length * effectiveRowHeight;
    const safetyBuffer = effectiveRowHeight * 2;
    const maxScroll = needsScroll ? 
      Math.max(0, totalContentHeight - containerHeight + safetyBuffer) : 
      0;

    const scrollPosition = side === 'left' ? leftScrollPosition : rightScrollPosition;
    const setScrollPosition = side === 'left' ? setLeftScrollPosition : setRightScrollPosition;

    // Auto-scroll effect
    useEffect(() => {
      if (!isActive || !needsScroll) return;

      const scrollSpeed = 25;
      const updateInterval = 30;
      const pixelsPerUpdate = (scrollSpeed / 1000) * updateInterval;

      const interval = setInterval(() => {
        setScrollPosition(prev => {
          const newPosition = prev + pixelsPerUpdate;
          
          if (newPosition >= maxScroll) {
            setTimeout(() => setScrollPosition(0), 2000);
            return maxScroll;
          }
          
          return newPosition;
        });
      }, updateInterval);

      return () => clearInterval(interval);
    }, [isActive, needsScroll, maxScroll]);

    const renderAgentRow = (item, index, isFrozen = false) => {
      const isZeroDeals = item.dealCount === 0;
      const rank = index + 1;

      let itemStyle = { ...styles.item };
      if (isFrozen) {
        itemStyle = { ...itemStyle, ...styles.itemFrozen };
      }
      if (rank === 1 && !isZeroDeals) {
        itemStyle = { ...itemStyle, ...styles.itemFirstPlace };
      } else if (rank === 2 && !isZeroDeals) {
        itemStyle = { ...itemStyle, ...styles.itemSecondPlace };
      }
      // Rank 3 får vanlig style - ingen special styling
      if (isZeroDeals) {
        itemStyle = { ...itemStyle, ...styles.itemZeroDeals };
      }

      const successRate = item.smsSuccessRate || 0;
      const uniqueSMS = item.uniqueSMS || 0;

      return (
        <div 
          key={item.userId}
          style={itemStyle}
        >
          {/* Rank */}
          <div style={styles.rank}>
            {rank === 1 && !isZeroDeals && '🥇'}
            {rank === 2 && !isZeroDeals && '🥈'}
            {rank === 3 && !isZeroDeals && '🥉'}
            {(rank > 3 || isZeroDeals) && `#${rank}`}
          </div>

          {/* Avatar */}
          {item.agent?.profileImage ? (
            <img 
              src={item.agent.profileImage}
              alt={item.agent.name}
              style={styles.avatar}
            />
          ) : (
            <div style={styles.avatarPlaceholder}>
              {item.agent?.name?.charAt(0) || '?'}
            </div>
          )}

          {/* Name */}
          <div style={styles.info}>
            <h3 style={{
              ...styles.name,
              ...(isZeroDeals ? styles.nameZeroDeals : {})
            }}>
              {item.agent?.name || 'Unknown Agent'}
            </h3>
          </div>

          {/* Deals */}
          <div style={{
            ...styles.dealsSection,
            ...(isZeroDeals ? styles.dealsSectionZero : {})
          }}>
            <span style={styles.dealEmoji}>🎯</span>
            <span>{item.dealCount}</span>
          </div>

          {/* SMS Box */}
          <div style={{
            ...styles.smsBox,
            ...getSmsStyle(successRate)
          }}>
            <div style={styles.smsRate}>
              {successRate.toFixed(2)}%
            </div>
            <div style={styles.smsCount}>
              ({uniqueSMS} SMS)
            </div>
          </div>

          {/* Commission */}
          <div style={{
            ...styles.commission,
            ...getCommissionStyle(item.totalCommission, leaderboard.timePeriod)
          }}>
            {item.totalCommission.toLocaleString('sv-SE')} THB
          </div>
        </div>
      );
    };

    return (
      <div style={styles.column}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.headerTitle}>{leaderboard.name || 'Unnamed'}</h2>
          <p style={styles.period}>{getTimePeriodLabel(leaderboard.timePeriod)}</p>
          <p style={styles.stats}>
            📊 {totalDeals} affärer • {stats.length} agenter
          </p>
        </div>

        {stats.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#7f8c8d' }}>
            Inga affärer än
          </div>
        ) : (
          <>
            {/* Frozen Top 3 */}
            <div style={styles.frozenSection}>
              {topStats.map((item, index) => renderAgentRow(item, index, true))}
            </div>

            {/* Scrollable Rest */}
            {scrollableStats.length > 0 && (
              <div style={{
                ...styles.scrollContainer,
                height: `${visibleRows * effectiveRowHeight}px`
              }}>
                <div style={{
                  ...styles.items,
                  transform: `translateY(-${scrollPosition}px)`,
                  transition: 'transform 0.03s linear'
                }}>
                  {scrollableStats.map((item, index) => 
                    renderAgentRow(item, index + frozenCount, false)
                  )}
                </div>
              </div>
            )}

            {/* Scroll Indicator */}
            {needsScroll && (
              <div style={styles.scrollIndicator}>
                <span style={styles.scrollIndicatorText}>
                  Scrollar automatiskt • {stats.length} agenter totalt
                </span>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div style={{
      ...styles.slide,
      ...(isActive ? styles.slideActive : {})
    }}>
      <div style={styles.container}>
        <LeaderboardColumn 
          leaderboard={leftLeaderboard}
          stats={leftStats}
          side="left"
        />
        <LeaderboardColumn 
          leaderboard={rightLeaderboard}
          stats={rightStats}
          side="right"
        />
      </div>
    </div>
  );
};

export default DualLeaderboardSlide;
