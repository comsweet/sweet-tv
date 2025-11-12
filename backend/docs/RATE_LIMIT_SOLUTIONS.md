# Rate Limiting Solutions & Best Practices

## 🔴 Problem Identified

After adding login time functionality, rate limiting became an issue because:

1. **Metrics Grid looped over users individually** (1 API call per user)
2. **Multiple leaderboards sync simultaneously** (multiplying requests)
3. **Aggressive sync intervals** (2 minutes was too frequent)

---

## ✅ Solutions Implemented

### 1. Fixed Metrics Grid Loop (CRITICAL)
**Before:**
```javascript
for (const userId of userIds) {
  await loginTimeCache.syncUserLoginTime(userId, adversusAPI, startDate, endDate);
}
// Result: 20 users = 20 API calls
```

**After:**
```javascript
await loginTimeCache.syncLoginTimeForUsers(adversusAPI, userIds, startDate, endDate);
// Result: 20 users = 1 API call (workforce batch API)
```

**Impact:** Reduces API calls by 95% for Metrics Grid!

---

### 2. Increased Sync Interval
**Changed:** 2 minutes → 5 minutes

**Reasoning:**
- Login time changes slowly (not like deals)
- 5 minutes still provides near real-time data
- Reduces API load by 60%

---

### 3. Existing Smart Caching (Already Working!)

You already have these excellent features:

✅ **Ongoing Sync Lock** - Prevents duplicate syncs
✅ **Workforce API** - Batch-fetches ALL users at once
✅ **PostgreSQL Cache** - Persists data between restarts
✅ **Memory Cache** - Sub-millisecond lookups

---

## 📊 Expected Results

### Before Fixes:
- Metrics Grid with 3 groups × 20 users each = **60 API calls per refresh**
- 10 active leaderboards = **600 API calls per minute**
- ❌ Rate limit: ~500 calls/minute

### After Fixes:
- Metrics Grid with 3 groups × 20 users = **3 API calls total** (1 per group)
- Sync interval: 5 min instead of 2 min = **60% fewer syncs**
- Combined reduction: **~95% fewer API calls!**
- ✅ Well under rate limit

---

## 🚀 Additional Optimization Ideas (Optional)

### 4. Stagger Leaderboard Refreshes
Instead of all leaderboards refreshing at same time (causing burst):

```javascript
// In slideshow, add small delay between leaderboards
const refreshDelay = slideIndex * 2000; // 2s per slide
setTimeout(() => fetchLeaderboardData(), refreshDelay);
```

### 5. Smart Polling - Reduce frequency when idle
```javascript
// Reduce polling when TV is not active/visible
if (!document.hidden) {
  // Normal: 30s interval
} else {
  // Idle: 5min interval
}
```

### 6. Share Login Time Cache Across Metrics
If multiple metrics in same grid need login time, fetch once and share:

```javascript
// Fetch login time ONCE before metric loop
const loginTimeMap = await loginTimeCache.getLoginTimeForUsers(userIds, startDate, endDate);

// Then use cached data in metric calculations
for (const metric of metrics) {
  const loginTime = loginTimeMap.get(userId);
  // Calculate metric...
}
```

### 7. Request Queue with Rate Limiting
Implement a global queue that respects rate limits:

```javascript
class RequestQueue {
  constructor(maxPerMinute = 400) {
    this.queue = [];
    this.maxPerMinute = maxPerMinute;
    this.requestTimestamps = [];
  }

  async enqueue(requestFn) {
    // Wait if at rate limit
    await this.waitForCapacity();

    // Execute request
    this.requestTimestamps.push(Date.now());
    return await requestFn();
  }

  async waitForCapacity() {
    // Remove timestamps older than 1 minute
    const oneMinuteAgo = Date.now() - 60000;
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);

    // If at limit, wait
    if (this.requestTimestamps.length >= this.maxPerMinute) {
      const oldestTimestamp = this.requestTimestamps[0];
      const waitTime = 60000 - (Date.now() - oldestTimestamp) + 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}
```

---

## 📈 Monitoring

Check backend logs for:
```
✅ BATCH SYNC: X users in Y ms
✅ Using cached data (Z seconds old)
⚠️ Rate limit: Waiting...
```

If you still see rate limiting:
1. Check how many leaderboards are active
2. Increase sync interval to 10 minutes
3. Implement request queue (#7 above)

---

## 🎯 Priority

1. ✅ **DONE:** Fixed Metrics Grid loop
2. ✅ **DONE:** Increased sync interval
3. **OPTIONAL:** Stagger refreshes (#4)
4. **IF NEEDED:** Request queue (#7)
