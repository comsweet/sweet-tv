// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// ---- Adversus API config (lägg i Render env vars) ----
const ADV = {
  baseUrl: 'https://api.adversus.dk/v1',
  username: process.env.ADVERSUS_USERNAME || 'your_username_here',
  password: process.env.ADVERSUS_PASSWORD || 'your_password_here'
};

// Fält-ID:n (kan ändras i admin vid behov, men default här)
const FIELD_IDS = {
  commission: 70163,  // "Commission"
  multideals: 74126,  // "MultiDeals"
  orderDate: 71067    // "Order date"
};

// ---- Middleware ----
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Logger ----
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ---- Health ----
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'sweet-tv', ts: new Date().toISOString() });
});

// ---- Adversus proxy: /api/v1/* -> https://api.adversus.dk/v1/* ----
app.use('/api/v1', async (req, res) => {
  const url = `${ADV.baseUrl}${req.path}`;
  try {
    const r = await axios({
      method: req.method,
      url,
      params: req.query,
      data: req.body,
      auth: { username: ADV.username, password: ADV.password },
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    res.status(r.status).send(r.data);
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).send({
      error: err.message,
      details: err.response?.data || null
    });
  }
});

// ------ Helpers ------
const advGet = async (p, params = {}) => {
  const url = `${ADV.baseUrl}${p}`;
  const r = await axios.get(url, {
    params,
    auth: { username: ADV.username, password: ADV.password },
    timeout: 30000
  });
  return r.data;
};

// robust paginering för leads
async function fetchAllLeads(filters, sortProperty = 'lastUpdatedTime', sortDirection = 'DESC', pageSize = 200) {
  let page = 1;
  const all = [];
  while (true) {
    const params = {
      filters: JSON.stringify(filters),
      page,
      pageSize,
      sortProperty,
      sortDirection
    };
    const chunk = await advGet('/leads', params);
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    page += 1;
    // liten backoff för att undvika 429
    await new Promise(r => setTimeout(r, 250));
  }
  return all;
}

function isoStartOfToday() {
  const d = new Date(); d.setHours(0,0,0,0); return d.toISOString();
}
function isoEndOfToday() {
  const d = new Date(); d.setHours(23,59,59,999); return d.toISOString();
}
function isoStartOfMonth() {
  const now = new Date(); const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0,0,0));
  return d.toISOString();
}
function isoNow() { return new Date().toISOString(); }

function readFieldFromLead(lead, idOrName) {
  const idStr = String(idOrName).trim();
  const from = (lead.resultData && Array.isArray(lead.resultData)) ? lead.resultData
             : (lead.resultFields && Array.isArray(lead.resultFields)) ? lead.resultFields
             : [];
  let item = from.find(f => String(f.id) === idStr || String(f.label).toLowerCase() === String(idOrName).toLowerCase());
  if (item) return item.value;

  const md = Array.isArray(lead.masterData) ? lead.masterData : [];
  item = md.find(f => String(f.id) === idStr || String(f.label).toLowerCase() === String(idOrName).toLowerCase());
  return item ? item.value : undefined;
}

function parseNumber(v, fallback = 0) {
  if (v == null) return fallback;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

// ---- /api/leaderboard ----
// query:
//  period=(today|month|custom) & from & to
//  metric=(deals|commission)  default: deals
//  size=10
//  groups=comma,separated,groupNames  (valfritt)
//  includeRecent=true|false           (returnera senaste 15 affärer)
app.get('/api/leaderboard', async (req, res) => {
  try {
    const {
      period = 'month',
      from,
      to,
      metric = 'deals',
      size = '10',
      groups = '',
      includeRecent = 'true'
    } = req.query;

    let startISO, endISO;
    if (period === 'today') {
      startISO = isoStartOfToday();
      endISO = isoEndOfToday();
    } else if (period === 'custom' && from && to) {
      startISO = new Date(from).toISOString();
      endISO = new Date(to).toISOString();
    } else {
      startISO = isoStartOfMonth();
      endISO = isoNow();
    }

    // hämta users för namn + grupp
    const users = await advGet('/users');
    const userById = new Map();
    for (const u of Array.isArray(users) ? users : []) {
      // gruppnamn kan ligga i u.group?.name, fallback till first memberOf?.name
      const g = (u.group && u.group.name) || (Array.isArray(u.memberOf) && u.memberOf[0]?.name) || '';
      userById.set(u.id, { id: u.id, name: u.displayName || u.name || 'Okänd', group: g });
    }

    // bygg filter: success + tidsintervall (på lastUpdatedTime)
    const filters = {
      status: { $eq: 'success' },
      lastUpdatedTime: { $gte: startISO, $lte: endISO }
    };

    const leads = await fetchAllLeads(filters, 'lastUpdatedTime', 'DESC', 200);

    // om admin angett gruppfilter
    const allowedGroups = groups
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const useGroupFilter = allowedGroups.length > 0;

    // aggregat per user
    const agg = new Map();
    const recent = [];

    for (const lead of leads) {
      // agent via lastContactedBy
      const uid = lead.lastContactedBy || 0;
      const u = userById.get(uid) || { id: uid, name: 'Okänd', group: '' };

      // gruppfilter (om satt)
      if (useGroupFilter && !allowedGroups.includes(u.group)) continue;

      const commission = parseNumber(readFieldFromLead(lead, FIELD_IDS.commission), 0);
      const multi = parseNumber(readFieldFromLead(lead, FIELD_IDS.multideals), 1) || 1;
      const orderDate = readFieldFromLead(lead, FIELD_IDS.orderDate) || lead.lastUpdatedTime || lead.updated;

      if (!agg.has(uid)) {
        agg.set(uid, { userId: uid, name: u.name, group: u.group, deals: 0, commission: 0 });
      }
      const row = agg.get(uid);
      row.deals += multi;
      row.commission += commission * multi;

      // senaste affärer (visa max 15)
      if (recent.length < 15) {
        recent.push({
          time: orderDate,
          agent: u.name,
          group: u.group,
          commission: commission * multi
        });
      }
    }

    const items = Array.from(agg.values());
    items.sort((a, b) => {
      if (metric === 'commission') return b.commission - a.commission;
      return b.deals - a.deals;
    });

    res.json({
      meta: {
        period: { from: startISO, to: endISO },
        metric,
        size: Number(size),
        fields: FIELD_IDS,
        leads: leads.length
      },
      top: items.slice(0, Number(size)),
      recent: includeRecent === 'true' ? recent : []
    });
  } catch (err) {
    console.error('LEADERBOARD ERROR:', err.message, err.response?.data || '');
    res.status(500).json({ error: 'leaderboard_failed', details: err.message });
  }
});

// ---- SPA fallback ----
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---- Start ----
app.listen(PORT, () => {
  console.log(`🚀 sweet-tv listening on :${PORT}`);
});
