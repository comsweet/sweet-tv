# SWEET-TV CACHE & DAILY BUDGET NOTIFICATION SYSTEM - DETAILED ANALYSIS

## EXECUTIVE SUMMARY

The Sweet-TV system uses a **PostgreSQL + Write-Through Cache** architecture:
- **Database Layer:** PostgreSQL stores ALL historical data permanently
- **Cache Layer:** In-memory Maps hold ONLY today's data for ultra-fast access
- **Update Strategy:** Write-through pattern (immediate DB write + synchronous cache update)
- **Reset Strategy:** Automatic midnight reset ensures "today's" data never becomes stale

---

## 1. CACHE ARCHITECTURE

### 1.1 Overall Design Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                           │
│  ✅ ALL data persisted (historical + current)                   │
│  ✅ UNIQUE index on lead_id prevents duplicates                 │
│  ✅ Indexed for fast queries on timestamp/user_id/date          │
└─────────────────────────────────────────────────────────────────┘
                            ↑↓ (Sync every 2 min)
┌─────────────────────────────────────────────────────────────────┐
│              In-Memory Cache (Write-Through)                     │
│  ⚡ ONLY TODAY'S data (00:00 - 23:59)                           │
│  ⚡ < 1ms response time (no DB query needed)                    │
│  ⚡ Automatically cleared & reloaded at midnight                │
└─────────────────────────────────────────────────────────────────┘
                            ↑↓ (Real-time updates)
┌─────────────────────────────────────────────────────────────────┐
│                   API & WebSocket Layer                          │
│  📡 Notifications sent via Socket.IO                            │
│  📡 Leaderboards updated every 5 seconds                        │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Cache Implementations

#### **DealsCache** (`/backend/services/dealsCache.js`)
**Purpose:** Track commission deals for agents

**Structure:**
```javascript
class DealsCache {
  this.todayCache = new Map();          // leadId -> deal object
  this.todayUserTotals = new Map();     // userId -> total commission (THB)
  this.retryQueue = [];                 // Failed DB writes (auto-retry every 30s)
  this.lastSync = null;                 // Timestamp of last sync with Adversus
}
```

**What Gets Cached:**
- **In-Memory:** Only deals from today (00:00:00 - 23:59:59)
- **Database:** ALL deals (monthly rolling window + 7 days before)

**Data Stored Per Deal:**
```javascript
{
  leadId: "12345",
  userId: 456,
  campaignId: "campaign-1",
  commission: 1250.50,        // THB
  multiDeals: 3,              // Number of deals
  orderDate: "2025-11-03T14:30:00.000Z",
  status: "success",
  syncedAt: "2025-11-03T14:32:00.000Z"
}
```

**Key Operations:**
1. **addDeal()** - Add deal to cache + schedule DB write
   - Detects duplicates via unique lead_id constraint
   - Returns atomic previousTotal/newTotal for notifications
   - Updates todayUserTotals immediately (< 1ms)

2. **loadTodayCache()** - Load today's deals from DB
   - Called at startup and midnight reset
   - Populates todayCache and todayUserTotals

3. **syncDeals()** / **pollNewDeals()** - Sync with Adversus API
   - Full sync: rolling window (current month + 7 days)
   - Poll: only NEW deals since last sync
   - Smart UPSERT: Insert new, update changed, delete removed

4. **getTodayTotalForAgent()** - Get agent's daily total
   - **FAST!** Direct Map lookup (< 0.1ms)
   - No DB query needed

#### **SMSCache** (`/backend/services/smsCache.js`)
**Purpose:** Track SMS sent for conversion rate calculation

**Structure:**
```javascript
class SMSCache {
  this.todayCache = new Map();          // smsId -> sms object
  this.retryQueue = [];                 // Failed DB writes
  this.lastSync = null;                 // Timestamp of last sync
}
```

**Key Operations:**
1. **getUniqueSMSForAgent()** - Count unique receivers per day
2. **getSMSSuccessRate()** - Calculate conversion rate
3. **syncSMS()** - Sync with Adversus (paginated)

#### **LeaderboardCache** (`/backend/services/leaderboardCache.js`)
**Purpose:** Cache leaderboard calculations with 30-second TTL

---

## 2. DAILY BUDGET NOTIFICATION SYSTEM

### 2.1 How Notifications Are Triggered

**Flow Diagram:**
```
1. Poll Service finds new deal (every 5 seconds)
                ↓
2. processDeal() called with lead data
                ↓
3. addDeal() updates cache (atomic operation)
    - previousTotal = current total
    - newTotal = previousTotal + commission
                ↓
4. Check daily budget threshold
    - if (newTotal >= dailyBudget) → play milestone sound
    - if (previousTotal < dailyBudget && newTotal >= dailyBudget) → FIRST TIME!
                ↓
5. Create notification object with:
    - totalToday: newTotal
    - reachedBudget: boolean flag
    - soundType: 'milestone' or 'default'
    - soundUrl: specific URL
                ↓
6. Emit via Socket.IO: this.io.emit('new_deal', notification)
```

### 2.2 Budget Configuration

**Daily Budget Stored In:** `/backend/services/soundSettings.js`

**Configuration File:** `backend/data/soundSettings.json`
```json
{
  "defaultSound": "https://cdn.example.com/pling.mp3",
  "milestoneSound": "https://cdn.example.com/dagsbudget.mp3",
  "dailyBudget": 3600
}
```

**Default Value:** 3600 THB per day

### 2.3 Sound Logic (Budget Milestone)

**Location:** `/backend/services/pollingService.js` - `processDeal()` method (lines 305-346)

**Priority Hierarchy When Agent Reaches Budget:**

1. **First Priority:** Agent-Specific Sound
2. **Second Priority:** Milestone Sound (Budget sound)
3. **Fallback:** Default Sound

**Important Flag:**
```javascript
if (previousTotal < dailyBudget && newTotal >= dailyBudget) {
  reachedBudget = true;  // ← Frontend knows it's milestone moment
}
```

### 2.4 Group-Based Notification Filtering

**Location:** `/backend/services/notificationSettings.js`

**Configuration File:** `backend/data/notification-settings.json`

**Two Modes:**
1. **Blacklist Mode (Default)** - Notify ALL except disabled groups
2. **Whitelist Mode** - Notify ONLY enabled groups

---

## 3. CACHE INVALIDATION & RESET

### 3.1 Automatic Midnight Reset

**Location:** Both `DealsCache` and `SMSCache` (lines ~574-600)

**Why This Is Needed:**
- If server runs 24/7 without restart, cache never resets
- Without reset: yesterday's deals mixed with today's
- Result: Daily totals showing incorrect (stale) values
- **With reset:** Automatic refresh at 00:00:01 every day

**Scheduler implementation:**
```javascript
startMidnightScheduler() {
  // Calculates time until next midnight
  // Runs loadTodayCache() at 00:00:01
  // Automatically reschedules for next midnight
}
```

### 3.2 Manual Cache Invalidation

**Endpoints:** `/api/deals/database` and `/api/sms/cache`

**What it does:**
1. Clear in-memory todayCache Map
2. Clear todayUserTotals Map
3. Reload today's deals from PostgreSQL
4. Return fresh stats with counts

---

## 4. RECENT BUG FIXES

### 4.1 Commit b85cbec - "Fix clear cache 500 errors and add midnight reset"

**Problem 1: Clear Cache Button Returns 500 Error**

Root Cause:
- Old JSON-based cache was replaced with PostgreSQL
- Endpoints still called `dealsCache.saveCache([])` method
- Method no longer exists → 500 error

**Solution:**
- Changed endpoint to call `invalidateCache()` instead

**Problem 2: "Today's" Cache Not Reset at Midnight**

Root Cause:
- Server runs 24/7 without restart
- `todayCache` and `todayUserTotals` Maps never cleared
- After midnight, yesterday's deals still in cache
- Daily totals show stale data from yesterday

**Solution:**
- Added `startMidnightScheduler()` to both caches
- Runs `loadTodayCache()` at 00:00:01 every day
- Automatically reschedules for next midnight

---

## 5. POTENTIAL BUGS TO INVESTIGATE

### 5.1 Race Conditions in Concurrent Deal Processing

**Location:** `/backend/services/pollingService.js` - `processDeal()` method

**Risk:** If SMS sync is slower, SMS count might be from BEFORE the deal was added
- Could cause incorrect SMS success rate calculation

### 5.2 Timezone Issues with Daily Budget

**Location:** `/backend/services/dealsCache.js` - `getTodayWindow()`

**Issue:**
- Uses LOCAL timezone (server's timezone)
- Adversus API might use different timezone
- Deal might appear in "today" in one system but "yesterday" in another

### 5.3 Duplicate Detection Unique Constraint

**Location:** Database schema - `deals` table

**Issue:**
- If same lead_id comes from Adversus twice legitimately
- Gets added to retry queue indefinitely

### 5.4 Missing Error Handling in Midnight Scheduler

**Location:** `/backend/services/dealsCache.js` - `startMidnightScheduler()` (line 589)

**Issue:**
- If `loadTodayCache()` fails at midnight (DB down, network error)
- Cache is NOT cleared
- Still contains yesterday's data
- No retry logic

### 5.5 SMS Success Rate Can Go Above 100%

**Location:** `/backend/services/smsCache.js` - `getSMSSuccessRate()` (line 427)

**Issue:**
- `dealCount` is cumulative (includes multiDeals)
- `uniqueSMS` is counted by receiver/date
- Not the same metric → Can exceed 100%

---

## 6. KEY FILES

### Cache Implementation Files
- `/backend/services/dealsCache.js` (611 lines)
- `/backend/services/smsCache.js` (588 lines)
- `/backend/services/leaderboardCache.js` (85 lines)
- `/backend/services/campaignCache.js` (191 lines)

### Notification & Settings Files
- `/backend/services/notificationSettings.js` (233 lines)
- `/backend/services/soundSettings.js` (93 lines)
- `/backend/services/pollingService.js` (426 lines)

### Route Handlers
- `/backend/routes/modules/deals.js` (73 lines)
- `/backend/routes/modules/sms.js` (91 lines)
- `/backend/routes/modules/notifications.js` (89 lines)

### Database
- `/backend/db/schema.sql` - Full schema with indexes
- `/backend/services/postgres.js` - Database connection & queries

---

## 7. PERFORMANCE METRICS

### Cache Performance
| Operation | Before (JSON) | After (PostgreSQL) | Improvement |
|-----------|---------------|-------------------|-------------|
| Add Deal (pling sound) | 20-75ms | 0.5-2ms | **40-150x faster** |
| Get today's deals | 5-10ms | < 0.1ms (cache) | **50-100x faster** |
| Get agent daily total | 5-10ms | < 0.1ms (cache) | **50-100x faster** |

### Memory Usage
- **Before:** ~37 days of data in memory = ~200MB+
- **After:** ~1 day of data in memory = ~2-5MB
- **Reduction:** **97% less memory**

---

## 8. TESTING CHECKLIST

When investigating cache bugs:

- [ ] **Midnight Reset:** Check logs for "🌙 MIDNIGHT" message at 00:00:01
- [ ] **Duplicate Detection:** Look for "🚨 TRUE DUPLICATE DETECTED"
- [ ] **Cache Stats:** Call `GET /api/deals/stats` and `GET /api/sms/stats`
- [ ] **Daily Totals:** Verify `todayUserTotals` doesn't include yesterday's deals
- [ ] **Timezone:** Check if server timezone matches Adversus timezone
- [ ] **Clear Cache:** Test `DELETE /api/deals/database` - should not return 500
- [ ] **Retry Queue:** Look for "Processing X failed DB writes" in logs
- [ ] **Notification Filtering:** Verify group-based blocking is working

