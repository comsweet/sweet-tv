import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

/**
 * DEAL NOTIFICATION COMPONENT
 * 
 * Plays the correct sound based on notification type:
 * - milestone: Dagsbudget ljud (agent reached daily budget)
 * - agent: Agent's custom sound
 * - default: Standard pling
 * 
 * 🔥 CONCURRENT SAFETY:
 * - Varje notification är en separat component instance
 * - Har sina egna timers och cleanup
 * - Parent component hanterar queue (visa en i taget)
 * 
 * Popup visas i 10 sekunder (matchar max ljudlängd)
 * Mörk backdrop bakom popupen för bättre fokus
 * Konfetti varar hela 10 sekunder (matchar popup-duration)
 */
const DealNotification = ({ notification, onComplete }) => {
  const cleanupTimerRef = useRef(null);
  const confettiFrameRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    console.log('🎉 Notification mounted:', notification.agent.name);
    console.log('🔊 Sound type:', notification.soundType);
    console.log('🎵 Sound URL:', notification.soundUrl);
    
    // PLAY SOUND
    if (notification.soundUrl && audioRef.current) {
      audioRef.current.src = notification.soundUrl;
      audioRef.current.play()
        .then(() => {
          console.log('✅ Sound playing');
        })
        .catch(e => {
          console.error('❌ Could not play sound:', e);
          // Try fallback without sound
        });
    } else {
      console.log('⚠️  No sound URL provided');
    }
    
    // CONFETTI ANIMATION - varar lika länge som popupen (10s)
    const confettiDuration = 10000;
    const confettiEnd = Date.now() + confettiDuration;
    
    // 🔥 FIXAT: Använd reachedBudget för guld-konfetti (agent kan ha agent-specific sound!)
    const isMilestone = notification.reachedBudget || notification.soundType === 'milestone';
    const colors = isMilestone
      ? ['#ffd700', '#ffffff', '#ffed4e'] // Gold for milestone
      : ['#bb0000', '#ffffff', '#00bb00']; // Standard colors

    const runConfetti = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: colors,
        zIndex: 10000 // 🔥 FIXAT: Högre än backdrop (9998) och notification (9999)
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: colors,
        zIndex: 10000 // 🔥 FIXAT: Högre än backdrop (9998) och notification (9999)
      });

      if (Date.now() < confettiEnd) {
        confettiFrameRef.current = requestAnimationFrame(runConfetti);
      }
    };
    
    runConfetti();

    // 🔥 CLEANUP after 10 seconds
    cleanupTimerRef.current = setTimeout(() => {
      console.log('🧹 Cleaning up notification (10s timeout)');
      if (confettiFrameRef.current) {
        cancelAnimationFrame(confettiFrameRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      onComplete();
    }, 10000);

    return () => {
      console.log('🧹 Component unmounting');
      if (cleanupTimerRef.current) {
        clearTimeout(cleanupTimerRef.current);
      }
      if (confettiFrameRef.current) {
        cancelAnimationFrame(confettiFrameRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []); // Empty dependency - only run once on mount

  const { agent, commission, soundType, totalToday, reachedBudget } = notification;

  return (
    <>
      {/* 🔥 Mörk backdrop bakom popupen */}
      <div className="notification-backdrop"></div>
      
      <div className={`deal-notification ${(reachedBudget || soundType === 'milestone') ? 'milestone' : ''}`}>
        <audio ref={audioRef} />
        
        <div className="notification-content">
          {agent.profileImage && (
            <img 
              src={agent.profileImage} 
              alt={agent.name}
              className="notification-avatar"
            />
          )}
          {!agent.profileImage && (
            <div className="notification-avatar-placeholder">
              {agent.name?.charAt(0) || '?'}
            </div>
          )}
          <div className="notification-text">
            <h2 className="notification-name">{agent.name}</h2>
            <p className="notification-commission">
              +{parseFloat(commission).toLocaleString('sv-SE')} THB
            </p>
            {(reachedBudget || soundType === 'milestone') && totalToday && (
              <p className="notification-message milestone">
                🏆 DAGSBUDGET NÅDD! ({totalToday.toLocaleString('sv-SE')} THB idag)
              </p>
            )}
            {!(reachedBudget || soundType === 'milestone') && (
              <p className="notification-message">🎉 Ny affär registrerad!</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default DealNotification;
