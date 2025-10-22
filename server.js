// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// === Adversus API credentials (lägg i Render env) ===
const ADVERSUS_CONFIG = {
  baseUrl: 'https://api.adversus.dk/v1',
  username: process.env.ADVERSUS_USERNAME || 'your_username_here',
  password: process.env.ADVERSUS_PASSWORD || 'your_password_here'
};

// ===== Middleware =====
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== Logger =====
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ===== Health =====
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', at: new Date().toISOString() });
});

/* ==========================================================
   ADVERSUS PROXY
   Allt som börjar med /api/v1 proxas rakt till Adversus.
   ========================================================== */
app.use('/api/v1', async (req, res) => {
  const adversusUrl = `${ADVERSUS_CONFIG.baseUrl}${req.path}`;
  try {
    const r = await axios({
      method: req.method,
      url: adversusUrl,
      params: req.query,
      data: req.body,
      auth: {
        username: ADVERSUS_CONFIG.username,
        password: ADVERSUS_CONFIG.password
      },
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    res.status(r.status).json(r.data);
  } catch (e) {
    console.error('Proxy error', e?.message);
    res.status(e?.response?.status || 500).json({
      error: e?.message || 'Proxy error',
      details: e?.response?.data || null
    });
  }
});

/* ==========================================================
   SERVER-SIDE LEADERBOARD
   /api/leaderboard?period=month|today&metric=deals|commission&top=10&groups=Dentle%20Faraz,Sinfrid%20Bangkok
   ========================================================== */

// Helper: GET Adversus with auth, retry + backoff
const adversusGet = async (path, params = {}, tries = 3) => {
  const url = `${ADVERSUS_CONFIG.baseUrl}${path}`;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await axios.get(url, {
        params,
        auth: {
          username: ADVERSUS_CONFIG.username,
          password: ADVERSUS_CONFIG.password
        },
        timeout: 30000
      });
      return r.data;
    } catch (e) {
      const status = e?.response?.status;
      if ((status === 429 || !status) && i < tries - 1) {
        await new Promise(res => setTimeout(res, 800 * (i + 1)));
        continue;
      }
      throw e;
    }
  }
};

// Mini-cache in memory
const cache = new Map();
const getCache = (key, ttlMs = 60000) => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;
  return null;
};
const setCache = (key, data) => cache.set(key, { at: Date.now(), data });

// Period → ISO interval
const periodToRange = (period) => {
  const now = new Date();
  const start = (period === 'today')
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    : new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: start.toISOString(), to: now.toISOString() };
};

// Fält-ID:n (som du bekräftat i /fields & /campaigns)
const FIELD_IDS = { commission: 70163, multideals: 74126, orderDate: 71067 };

// Plocka fält från lead oavsett var de råkar ligga
function getFieldValue(lead, id) {
  // resultData (vanligast för orderfält)
  if (Array.isArray(lead.resultData)) {
    const hit = lead.resultData.find(x => `${x.id}` === `${id}`);
    if (hit?.value != null) return hit.value;
  }
  // resultFields (ibland)
  if (Array.isArray(lead.resultFields)) {
    const hit = lead.resultFields.find(x => `${x.id}` === `${id}`);
    if (hit?.value != null) return hit.value;
  }
  // masterData fallback
  const md = Array.isArray(lead.masterData) ? lead.masterData :
             (Array.isArray(lead.masterFields) ? lead.masterFields : []);
  const hit = md?.find?.(x => `${x.id}` === `${id}`);
  return hit?.value;
}

app.get('/api/leaderboard', async (req, res) => {
  try {
    const period = (req.query.period === 'today') ? 'today' : 'month';
    const metric = (req.query.metric === 'commission') ? 'commission' : 'deals';
    const top = Math.max(1, Math.min(100, parseInt(req.query.top || '10', 10)));
    const groupsFilter = (req.query.groups || '')
      .split(',').map(s => s.trim()).filter(Boolean);

    const cacheKey = JSON.stringify({ period, metric, top, groupsFilter });
    const cached = getCache(cacheKey, 60000);
    if (cached) return res.json(cached);

    // 1) Hämta users → map userId → {name, group}
    const users = await adversusGet('/v1/users');
    const userMap = new Map();
    for (const u of (Array.isArray(users) ? users : [])) {
      const groupName = u?.group?.name || u?.groups?.[0]?.name || u?.memberOf?.[0]?.name || '-';
      userMap.set(u.id, {
        id: u.id,
        name: u.displayName || u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Okänd',
        group: groupName
      });
    }

    // 2) Paginerat: hämta success-leads för perioden (sorterat på lastUpdatedTime)
    const { from, to } = periodToRange(period);
    const pageSize = 100;
    let page = 1;
    let leads = [];

    while (true) {
      const filters = JSON.stringify({
        status: { $eq: 'success' },
        lastUpdatedTime: { $gte: from, $lte: to }
      });
      const params = {
        includeMeta: true,
        page, pageSize,
        sortProperty: 'lastUpdatedTime',
        sortDirection: 'DESC',
        filters
      };
      const data = await adversusGet('/v1/leads', params);
      const batch = Array.isArray(data?.leads) ? data.leads : (Array.isArray(data) ? data : []);
      leads.push(...batch);

      const totalPages = data?.meta?.pageCount || data?.pageCount;
      if (totalPages ? page >= totalPages : batch.length < pageSize) break;
      page++;
      await new Promise(r => setTimeout(r, 150)); // snäll mot rate-limit
    }

    // 3) Summera per agent
    const agg = new Map();
    for (const lead of leads) {
      // "Vem" gjorde dealen
      const userId = lead.lastContactedBy || lead.lastUpdatedBy || lead.userId;
      const user = userMap.get(userId);
      if (!user) continue;

      // Gruppfilter (om satt)
      if (groupsFilter.length && !groupsFilter.includes(user.group)) continue;

      const multideals = parseFloat(getFieldValue(lead, FIELD_IDS.multideals)) || 1;
      const commission = parseFloat(getFieldValue(lead, FIELD_IDS.commission)) || 0;

      if (!agg.has(userId)) {
        agg.set(userId, { id: userId, name: user.name, group: user.group, deals: 0, commission: 0 });
      }
      const row = agg.get(userId);
      row.deals += multideals;
      row.commission += commission;
    }

    // 4) Sortera + toppa
    let items = Array.from(agg.values());
    items.sort((a, b) => metric === 'commission'
      ? (b.commission - a.commission || b.deals - a.deals)
      : (b.deals - a.deals || b.commission - a.commission)
    );
    items = items.slice(0, top);

    const payload = {
      period, metric, top, groups: groupsFilter,
      generatedAt: new Date().toISOString(),
      items
    };
    setCache(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('Leaderboard error:', err?.message, err?.response?.data);
    res.status(500).json({
      error: 'Failed to build leaderboard',
      details: err?.message || err
    });
  }
});

// ===== SPA-fallback =====
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== Start =====
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 Sweet TV server up on', PORT);
  console.log('Proxy     : /api/v1/* → Adversus');
  console.log('Leaderboard: /api/leaderboard');
  console.log('='.repeat(60));
});
