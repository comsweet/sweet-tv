// 🔥 ALTERNATIV 8: WIPE TRANSITION - WITH DYNAMIC ITEMS PER PAGE
// Top 3 frozen, resten wipes horizontally mellan grupper

import { useState, useEffect, useRef } from 'react';

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
    overflow: 'hidden',
    height: '100%'
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
  frozenSection: {
    flexShrink: 0,
    marginBottom: '0.8rem',
    paddingBottom: '0.8rem',
    borderBottom: '2px solid rgba(102, 126, 234, 0.2)',
    background: 'linear-gradient(180deg, rgba(102, 126, 234, 0.05) 0%, transparent 100%)',
    borderRadius: '10px',
    padding: '0.5rem'
  },
  wipeContainer: {
    position: 'relative',
    flex: 1,
    overflow: 'hidden',
    minHeight: 0
  },
  wipeContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    overflow: 'hidden'
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.6rem 1rem',
    marginBottom: '0.5rem',
    background: 'rgba(255, 255, 255, 0.95)',
    borderRadius: '12px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
    height: '58px',
    flexShrink: 0
  },
  itemFirstPlace: {
    background: 'linear-gradient(135deg, #ffd700 0%, #ffed4e 100%)',
    borderColor: '#ffd700',
    borderWidth: '3px',
    transform: 'scale(1.02)',
    boxShadow: '0 8px 30px rgba(255, 215, 0, 0.4)'
  },
  itemFrozen: {
    position: 'relative',
    zIndex: 10,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
  },
  leftSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.8rem',
    flex: '0 0 300px',
    minWidth: 0
  },
  rank: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#2c3e50',
    width: '45px',
    flexShrink: 0
  },
  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '2px solid rgba(102, 126, 234, 0.3)',
    flexShrink: 0
  },
  avatarPlaceholder: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    border: '2px solid rgba(102, 126, 234, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    fontSize: '1rem',
    fontWeight: 'bold',
    flexShrink: 0
  },
  name: {
    margin: 0,
    fontSize: '1.05rem',
    fontWeight: 600,
    color: '#2c3e50',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flex: 1,
    minWidth: 0
  },
  nameZero: {
    color: '#e74c3c'
  },
  dealsSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#2c3e50',
    flex: '0 0 90px',
    justifyContent: 'center'
  },
  smsBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.4rem 0.8rem',
    borderRadius: '8px',
    flex: '0 0 120px',
    minHeight: '48px'
  },
  smsBoxGreen: {
    background: 'rgba(46, 204, 113, 0.15)',
    border: '2px solid #2ecc71'
  },
  smsBoxOrange: {
    background: 'rgba(230, 126, 34, 0.15)',
    border: '2px solid #e67e22'
  },
  smsBoxRed: {
    background: 'rgba(231, 76, 60, 0.15)',
    border: '2px solid #e74c3c'
  },
  smsRate: {
    fontSize: '1.1rem',
    fontWeight: 'bold',
    margin: 0,
    lineHeight: 1.2
  },
  smsRateGreen: {
    color: '#27ae60'
  },
  smsRateOrange: {
    color: '#d35400'
  },
  smsRateRed: {
    color: '#c0392b'
  },
  smsCount: {
    fontSize: '0.8rem',
    color: '#2c3e50',
    fontWeight: 'bold',
    margin: '0.1rem 0 0',
    lineHeight: 1
  },
  commission: {
    fontSize: '1rem',
    fontWeight: 'bold',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    flex: '0 0 140px'
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
  pageIndicator: {
    textAlign: 'center',
    padding: '0.5rem',
    background: 'rgba(102, 126, 234, 0.1)',
    borderRadius: '8px',
    marginTop: '0.5rem',
    flexShrink: 0
  },
  pageIndicatorText: {
    fontSize: '0.85rem',
    color: '#667eea',
    fontWeight: 500
  }
};

// 🔥 Hook för att beräkna hur många items som får plats
const useItemsPerPage = (containerRef) => {
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    if (!containerRef.current) return;

    const calculateItems = () => {
      const containerHeight = containerRef.current.clientHeight;
      // Item height: 58px + margin-bottom: 8px (0.5rem) = 66px per item
      const itemHeight = 66;
      const calculatedItems = Math.floor(containerHeight / itemHeight);
      // Sätt gränser: minst 6, max 15 items per sida
      const finalItems = Math.max(6, Math.min(calculatedItems, 15));
      
      console.log(`📏 Container height: ${containerHeight}px → ${finalItems} items per page`);
      setItemsPerPage(finalItems);
    };

    // Beräkna efter en kort delay så att layout är klar
    const timer = setTimeout(calculateItems, 100);
    
    window.addEventListener('resize', calculateItems);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', calculateItems);
    };
  }, [containerRef]);

  return itemsPerPage;
};

// 🔥 Hook som använder direkt DOM manipulation för smooth animation
const useWipeAnimation = (containerRef, totalPages, side, isActive) => {
  const [currentPage, setCurrentPage] = useState(0);
  const animationRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    if (!isActive || totalPages <= 1 || !containerRef.current) {
      setCurrentPage(0);
      return;
    }

    const performWipe = () => {
      const container = containerRef.current;
      if (!container) return;

      const nextPage = (currentPage + 1) % totalPages;
      console.log(`[${side}] 🔥 Wiping from page ${currentPage + 1} to ${nextPage + 1}`);

      // Animera ut (åt vänster)
      container.style.transition = 'transform 1.8s cubic-bezier(0.4, 0, 0.2, 1), opacity 1.8s ease';
      container.style.transform = 'translateX(-100%)';
      container.style.opacity = '0';

      // Efter animation, uppdatera page och reset position
      timeoutRef.current = setTimeout(() => {
        // Ta bort transition och flytta till höger
        container.style.transition = 'none';
        container.style.transform = 'translateX(100%)';
        
        // Uppdatera innehållet
        setCurrentPage(nextPage);
        
        // Force reflow så CSS appliceras
        container.offsetHeight;
        
        // Animera in (från höger till center)
        animationRef.current = requestAnimationFrame(() => {
          container.style.transition = 'transform 1.8s cubic-bezier(0.4, 0, 0.2, 1), opacity 1.8s ease';
          container.style.transform = 'translateX(0)';
          container.style.opacity = '1';
          
          console.log(`[${side}] ✅ Wiped to page ${nextPage + 1}`);
          
          // Schedule next wipe efter 12 sekunder
          timeoutRef.current = setTimeout(performWipe, 12000);
        });
      }, 1800);
    };

    // Start första wipe efter 12 sekunder
    console.log(`[${side}] 🎬 Starting wipe cycle with ${totalPages} pages`);
    timeoutRef.current = setTimeout(performWipe, 12000);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [currentPage, totalPages, side, isActive, containerRef]);

  return currentPage;
};

const DualLeaderboardSlide = ({ leftLeaderboard, rightLeaderboard, leftStats, rightStats, isActive }) => {
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

  const getCommissionStyle = (commission, timePeriod) => {
    if (!commission || commission === 0) {
      return styles.commissionZero;
    }

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

  const getSMSBoxStyle = (successRate) => {
    if (successRate >= 75) {
      return { box: styles.smsBoxGreen, text: styles.smsRateGreen };
    } else if (successRate >= 60) {
      return { box: styles.smsBoxOrange, text: styles.smsRateOrange };
    } else {
      return { box: styles.smsBoxRed, text: styles.smsRateRed };
    }
  };

  const LeaderboardColumn = ({ leaderboard, stats, side }) => {
    if (!leaderboard || !Array.isArray(stats)) return null;

    const wipeContainerRef = useRef(null);
    const totalDeals = stats.reduce((sum, stat) => sum + (stat.dealCount || 0), 0);

    const frozenCount = 3;
    const topStats = stats.slice(0, frozenCount);
    const scrollableStats = stats.slice(frozenCount);

    // 🔥 Dynamiskt beräkna items per page baserat på skärmhöjd
    const itemsPerPage = useItemsPerPage(wipeContainerRef);
    
    const totalPages = Math.ceil(scrollableStats.length / itemsPerPage);
    const needsWipe = scrollableStats.length > itemsPerPage;

    // 🔥 Använd custom hook med DOM manipulation
    const currentPage = useWipeAnimation(wipeContainerRef, totalPages, side, isActive);

    const renderItem = (item, index, isFrozen = false) => {
      if (!item || !item.agent) return null;

      const isZeroDeals = !item.dealCount || item.dealCount === 0;
      const isFirstPlace = index === 0 && !isZeroDeals;
      const commission = item.totalCommission || 0;
      
      const uniqueSMS = item.uniqueSMS || 0;
      const smsSuccessRate = item.smsSuccessRate || 0;

      const smsStyles = getSMSBoxStyle(smsSuccessRate);

      const itemStyle = {
        ...styles.item,
        ...(isFirstPlace ? styles.itemFirstPlace : {}),
        ...(isFrozen ? styles.itemFrozen : {})
      };

      return (
        <div key={`${item.userId || index}-${item.agent.id || index}`} style={itemStyle}>
          <div style={styles.leftSection}>
            <div style={styles.rank}>
              {index === 0 && !isZeroDeals && '🥇'}
              {index === 1 && !isZeroDeals && '🥈'}
              {index === 2 && !isZeroDeals && '🥉'}
              {(index > 2 || isZeroDeals) && `#${index + 1}`}
            </div>

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

            <p style={{ ...styles.name, ...(isZeroDeals ? styles.nameZero : {}) }}>
              {item.agent.name || `Agent ${item.userId || '?'}`}
            </p>
          </div>

          <div style={styles.dealsSection}>
            <span>🎯</span>
            <span style={isZeroDeals ? styles.nameZero : {}}>{item.dealCount || 0}</span>
          </div>

          <div style={{ ...styles.smsBox, ...smsStyles.box }}>
            <div style={{ ...styles.smsRate, ...smsStyles.text }}>
              {smsSuccessRate.toFixed(2)}%
            </div>
            <div style={styles.smsCount}>
              ({uniqueSMS} SMS)
            </div>
          </div>

          <div style={{ ...styles.commission, ...getCommissionStyle(commission, leaderboard.timePeriod) }}>
            {commission.toLocaleString('sv-SE')} THB
          </div>
        </div>
      );
    };

    // Rendera items för current page
    const startIndex = currentPage * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, scrollableStats.length);
    const pageItems = scrollableStats.slice(startIndex, endIndex);

    console.log(`[${side}] 📄 Page ${currentPage + 1}/${totalPages}: Items ${startIndex + frozenCount + 1}-${endIndex + frozenCount} (${pageItems.length} items)`);

    return (
      <div style={styles.column}>
        <div style={styles.header}>
          <h2 style={styles.headerTitle}>{leaderboard.name || 'Unnamed'}</h2>
          <p style={styles.period}>{getTimePeriodLabel(leaderboard.timePeriod)}</p>
          <p style={styles.stats}>
            📊 {totalDeals} {totalDeals === 1 ? 'affär' : 'affärer'} • {stats.length} {stats.length === 1 ? 'agent' : 'agenter'}
          </p>
        </div>

        {topStats.length > 0 && (
          <div style={styles.frozenSection}>
            {topStats.map((item, index) => renderItem(item, index, true))}
          </div>
        )}

        {scrollableStats.length > 0 && (
          <>
            <div ref={wipeContainerRef} style={styles.wipeContainer}>
              <div style={styles.wipeContent}>
                {pageItems.map((item, index) => 
                  renderItem(item, startIndex + index + frozenCount, false)
                )}
              </div>
            </div>

            {needsWipe && (
              <div style={styles.pageIndicator}>
                <span style={styles.pageIndicatorText}>
                  {isActive ? `➡️ Sida ${currentPage + 1} av ${totalPages}` : '⏸️ Pausad'}
                </span>
              </div>
            )}
          </>
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
