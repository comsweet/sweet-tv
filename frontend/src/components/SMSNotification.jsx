import { useState, useEffect, useCallback } from 'react';
import { getGlobalRecentSMS } from '../services/api';
import './SMSNotification.css';

const SMSNotification = ({ scaleFactor = 1 }) => {
  const [notifications, setNotifications] = useState([]);
  const [lastCheckTime, setLastCheckTime] = useState(Date.now());
  const [nextId, setNextId] = useState(0);

  const checkForNewSMS = useCallback(async () => {
    try {
      // Get SMS from last 2 minutes (to catch any we might have missed)
      const response = await getGlobalRecentSMS({ minutes: 2 });
      const recentSMS = response.data.sms || [];

      // Filter SMS that are newer than last check
      const newSMS = recentSMS.filter(sms => {
        const smsTime = new Date(sms.timestamp).getTime();
        return smsTime > lastCheckTime;
      });

      if (newSMS.length > 0) {
        // Group by userId and sum counts (SMS doesn't have count field, so each is 1)
        const groupedSMS = newSMS.reduce((acc, sms) => {
          const userId = sms.userId;
          if (!acc[userId]) {
            acc[userId] = {
              userId: sms.userId,
              userName: sms.userName,
              count: 0,
              timestamp: sms.timestamp
            };
          }
          acc[userId].count += 1;
          // Keep the latest timestamp
          if (new Date(sms.timestamp) > new Date(acc[userId].timestamp)) {
            acc[userId].timestamp = sms.timestamp;
          }
          return acc;
        }, {});

        // Create notifications for each user
        const newNotifications = Object.values(groupedSMS).map(sms => ({
          id: nextId + Object.keys(groupedSMS).indexOf(sms.userId.toString()),
          userName: sms.userName,
          count: sms.count,
          timestamp: Date.now()
        }));

        setNotifications(prev => [...prev, ...newNotifications]);
        setNextId(prev => prev + newNotifications.length);
        setLastCheckTime(Date.now());
      } else {
        // Update last check time even if no new SMS
        setLastCheckTime(Date.now());
      }
    } catch (error) {
      console.error('Error fetching global recent SMS:', error);
    }
  }, [lastCheckTime, nextId]);

  useEffect(() => {
    // Initial check
    checkForNewSMS();

    // Poll every 15 seconds
    const interval = setInterval(checkForNewSMS, 15000);

    return () => clearInterval(interval);
  }, [checkForNewSMS]);

  // Auto-remove notifications after 8 seconds
  useEffect(() => {
    if (notifications.length === 0) return;

    const timer = setTimeout(() => {
      const now = Date.now();
      setNotifications(prev =>
        prev.filter(notif => now - notif.timestamp < 8000)
      );
    }, 1000);

    return () => clearTimeout(timer);
  }, [notifications]);

  if (notifications.length === 0) return null;

  return (
    <div className="sms-notifications-container" style={{ transform: `scale(${scaleFactor})` }}>
      {notifications.map(notif => (
        <div key={notif.id} className="sms-notification">
          <div className="sms-notification-icon">💬</div>
          <div className="sms-notification-content">
            <div className="sms-notification-user">{notif.userName}</div>
            <div className="sms-notification-text">
              skickade {notif.count} SMS
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SMSNotification;
