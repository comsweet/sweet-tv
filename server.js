// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// ====== Adversus API-uppgifter ======
const ADVERSUS_CONFIG = {
  baseUrl: 'https://api.adversus.dk/v1',
  username: process.env.ADVERSUS_USERNAME || 'your_username_here',
  password: process.env.ADVERSUS_PASSWORD || 'your_password_here'
};

// ====== Fält-ID:n (justera om ni byter fält i Adversus) ======
const FIELD_IDS = {
  commission: 70163,  // "Commission"
  multideals: 74126,  // "MultiDeals"
  orderDate: 71067,   // "Order date"
};

// ====== Middleware ======
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ====== Logger ======
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ====== Health ======
app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    message: 'Adversus Dashboard v2.0'
  });
});

// ====== Hjälp: datumintervall i UTC ======
function startOfUTC(unit) {
  const d = new Date();
  if (unit === 'day') {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  }
  if (unit === 'week') {
    // ISO-vecka: måndag = 1
    const day = d.getUTCDay() || 7;
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (day - 1)));
    return new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate(), 0, 0, 0, 0));
  }
  // month
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function endOfUTC(unit) {
  const d = new Date();
  if (unit === 'day') {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
  }
  if (unit === 'week') {
    const day = d.getUTCDay() || 7;
    const sunday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (7 - day)));
    return new Date(Date.UTC(sunday.getUTCFullYear(), sunday.getUTCMonth(), sunday.getUTCDate(), 23, 59, 59, 999));
  }
  // month
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return new Date(Date.UTC(lastDay.getUTCFullYear(), lastDay.getUTCMonth(), lastDay.getUTCDate(), 23, 59, 59, 999));
}

function getPeriodRange(period) {
  const p = (period || 'month').toLowerCase();
  if (p === 'today') return [startOfUTC('day'), endOfUTC('day')];
  if (p === 'week') return [startOfUTC('week'), endOfUTC('week')];
  return [startOfUTC('month'), endOfUTC('month')];
}

// ====== Hjälp: GET mot Adversus ======
async function adversusGet(path, params = {}) {
  const url = `${ADVERSUS_CONFIG.baseUrl}${path}`;
  const res = await axios.get(url, {
    params,
    auth: {
      username: ADVERSUS_CONFIG.username,
      password: ADVERSUS_CONFIG.password
    },
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000
  });
  return res.data;
}

// ====== Hjälp: hämta alla paginerade sidor (lugn takt + retry) ======
async function getAllPages(path, baseParams = {}, pageSize = 100, maxPages = 50) {
  let page = 1;
  let items = [];
  for (; page <= maxPages; page++) {
    const params = { ...baseParams, page, pageSize, includeMeta: true };
    let data;
    try {
      data = await adversusGet(path, params);
    } catch (err) {
      if (err.response && (err.response.status === 429 || err.response.status >= 500)) {
        await new Promise(r => setTimeout(r, 1200));
        data = await adversusGet(path, params);
      } else {
        throw err;
      }
    }
    const pageItems = Array.isArray(data) ? data : (data.items || data.leads || data.sessions || data.users || []);
    items = items.concat(pageItems);

    if (pageItems.length < pageSize) break;
    await new Promise(r => setTimeout(r, 250));
  }
  return items;
}

// ====== Proxy: /api/v1/* => Adversus ======
app.use('/api/v1', async (req, res) => {
  const adversusUrl = `${ADVERSUS_CONFIG.baseUrl}${req.path}`;
  console.log(`📡 Proxying to: ${adversusUrl}`);
  try {
    const response = await axios({
      method: req.method,
      url: adversusUrl,
      data: req.body,
      params: req.query,
      auth: {
        username: ADVERSUS_CONFIG.username,
        password: ADVERSUS_CONFIG.password
      },
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    res.json(response.data);
  } catch (error) {
    console.error('❌ API Error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data || 'No details available'
    });
  }
});

// ====== /api/leaderboard ======
app.get('/api/leaderboard', async (req, res) => {
  try {
    const period = (req.query.period || 'month').toLowerCase();   // today|week|month
    const metric = (req.query.metric || 'deals').toLowerCase();   // deals|commission
    const size = Math.max(1, Math.min(parseInt(req.query.size || '10', 10), 100));
    const groupsFilter = (req.query.groups || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const [fromDt, toDt] = getPeriodRange(period);
    const fromISO = fromDt.toISOString();
    const toISO = toDt.toISOString();

    // 1) Users (för att mappa agent-id -> namn + grupp)
    const users = await getAllPages('/users', { pageSize: 200 });
    const userById = new Map();
    users.forEach(u => {
      userById.set(u.id, {
        id: u.id,
        name: u.name || u.displayName || 'Okänd',
        group: u.group?.name || u.memberOf?.[0]?.name || (Array.isArray(u.teams) ? u.teams[0] : '') || '-'
      });
    });

    // 2) Leads med status = "success" och lastUpdatedTime i intervallet
    const filters = JSON.stringify({
      status: { "$eq": "success" },
      lastUpdatedTime: { "$gte": fromISO, "$lte": toISO }
    });

    const leads = await getAllPages('/leads', {
      filters,
      sortProperty: 'lastUpdatedTime',
      sortDirection: 'DESC',
    }, 100, 50);

    // 3) Aggregation per agent
    const leaders = new Map();

    const pickField = (src, id) => {
      if (!src) return undefined;
      if (Array.isArray(src)) {
        const f = src.find(x => x.id === id || `${x.id}` === `${id}`);
        return f?.value;
      }
      return src[id] ?? src[`${id}`];
    };

    for (const lead of leads) {
      const agentId = lead.lastContactedBy || lead.userId || null;
      if (!agentId) continue;

      const agent = userById.get(agentId);
      const agentGroup = agent?.group || '-';

      if (groupsFilter.length > 0 && !groupsFilter.includes(agentGroup)) continue;

      const commissionRaw =
        pickField(lead.resultData, FIELD_IDS.commission) ??
        pickField(lead.resultFields, FIELD_IDS.commission) ??
        pickField(lead.masterData, FIELD_IDS.commission);

      const multidealsRaw =
        pickField(lead.resultData, FIELD_IDS.multideals) ??
        pickField(lead.resultFields, FIELD_IDS.multideals) ??
        pickField(lead.masterData, FIELD_IDS.multideals) ?? 1;

      const commission = Number(commissionRaw) || 0;
      const multideals = Number(multidealsRaw) || 1;

      if (!leaders.has(agentId)) {
        leaders.set(agentId, {
          agentId,
          name: agent?.name || `User ${agentId}`,
          group: agentGroup,
          deals: 0,
          commission: 0
        });
      }
      const row = leaders.get(agentId);
      row.deals += multideals;
      row.commission += commission;
    }

    let arr = Array.from(leaders.values());
    if (metric === 'commission') {
      arr.sort((a, b) => b.commission - a.commission || b.deals - a.deals);
    } else {
      arr.sort((a, b) => b.deals - a.deals || b.commission - a.commission);
    }
    arr = arr.slice(0, size);

    res.json({
      period, metric, size,
      from: fromISO, to: toISO,
      totalLeads: leads.length,
      leaders: arr
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({
      error: 'leaderboard_failed',
      details: error?.message || 'Unknown error'
    });
  }
});

// ====== Fallback SPA ======
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ====== Start ======
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Adversus Dashboard Server');
  console.log('='.repeat(60));
  console.log(`📍 Port: ${PORT}`);
  console.log(`💚 Health: /health`);
  console.log(`🔧 API Proxy: /api/v1/*  |  Leaderboard: /api/leaderboard`);
  console.log('='.repeat(60) + '\n');
});
