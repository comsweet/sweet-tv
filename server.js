const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Adversus API – credentials via Render env vars
const ADVERSUS_CONFIG = {
  baseUrl: 'https://api.adversus.dk/v1',
  username: process.env.ADVERSUS_USERNAME || 'your_username_here',
  password: process.env.ADVERSUS_PASSWORD || 'your_password_here',
};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Helpers ----------
function adversusClient() {
  return axios.create({
    auth: { username: ADVERSUS_CONFIG.username, password: ADVERSUS_CONFIG.password },
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });
}

function toISO(d) {
  return (d instanceof Date ? d : new Date(d)).toISOString();
}

// ---------- Health ----------
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'sweet-tv', ts: new Date().toISOString() });
});

// ---------- Transparent proxy -> Adversus /v1 ----------
app.use('/api/v1', async (req, res) => {
  const url = `${ADVERSUS_CONFIG.baseUrl}${req.path}`;
  try {
    const resp = await axios({
      method: req.method,
      url,
      params: req.query,
      data: req.body,
      auth: { username: ADVERSUS_CONFIG.username, password: ADVERSUS_CONFIG.password },
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });
    res.status(resp.status).send(resp.data);
  } catch (err) {
    console.error('❌ /api/v1 proxy error:', err.response?.status, err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: 'proxy_failed',
      details: err.response?.data || err.message,
    });
  }
});

// ---------- /api/leaderboard (server-beräkning) ----------
/**
 * Query params:
 *  - period: "today" | "month" | "custom" (default "month")
 *  - from, to: ISO-tider (krävs om period=custom)
 *  - metric: "deals" | "commission" (default "deals")
 *  - size: 1..100 (default 10)
 *  - groups: kommaseparerade gruppnamn att inkludera (valfritt)
 */
app.get('/api/leaderboard', async (req, res) => {
  try {
    const metric = (req.query.metric || 'deals').toLowerCase();         // deals | commission
    const size = Math.max(1, Math.min(parseInt(req.query.size || '10', 10), 100));
    const period = (req.query.period || 'month').toLowerCase();         // today | month | custom
    const groupsFilter = (req.query.groups || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    let from, to;
    if (period === 'today') {
      const now = new Date();
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      to = now;
    } else if (period === 'custom') {
      from = req.query.from ? new Date(req.query.from) : null;
      to = req.query.to ? new Date(req.query.to) : null;
      if (!from || !to) {
        return res.status(400).json({ error: 'bad_request', details: 'from/to krävs med period=custom' });
      }
    } else {
      // month (default)
      const now = new Date();
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = now;
    }

    const fromISO = toISO(from);
    const toISO = toISO(to);

    // Enligt vad som funkar hos dig: använd $gt/$lt på LEADS
    const leadsFilters = {
      status: { $eq: 'success' },
      lastUpdatedTime: { $gt: fromISO, $lt: toISO },
    };

    const http = adversusClient();

    // 1) Hämta alla users (id->namn/grupp)
    const usersResp = await http.get(`${ADVERSUS_CONFIG.baseUrl}/users`);
    const users = Array.isArray(usersResp.data) ? usersResp.data : (usersResp.data?.users || []);
    const userMap = new Map();
    users.forEach(u => {
      userMap.set(u.id, {
        id: u.id,
        name: u.name || u.displayName || `User ${u.id}`,
        group: u.group?.name || (u.memberOf?.[0]?.name) || '-',
      });
    });

    // 2) Hämta LEADS (paginerat) status=success mellan from..to
    const pageSize = 100;
    let page = 1;
    const allLeads = [];

    for (;;) {
      const resp = await http.get(`${ADVERSUS_CONFIG.baseUrl}/leads`, {
        params: {
          filters: JSON.stringify(leadsFilters),
          page,
          pageSize,
          includeMeta: true,
          sortProperty: 'lastUpdatedTime',
          sortDirection: 'DESC',
        },
      });

      const rows = Array.isArray(resp.data) ? resp.data : (resp.data?.leads || []);
      allLeads.push(...rows);

      const meta = resp.data?.meta;
      const totalPages = meta?.pageCount || (rows.length < pageSize ? page : page + 1);
      if (page >= totalPages || rows.length === 0) break;
      page += 1;

      // mild throttling
      await new Promise(r => setTimeout(r, 120));
    }

    // 3) Fält-ID:n
    const COMMISSION_ID = 70163;
    const MULTIDEALS_ID = 74126;
    const ORDERDATE_ID = 71067;

    function getFieldValue(lead, id) {
      const r = Array.isArray(lead.resultData) ? lead.resultData.find(f => f.id === id) : null;
      if (r && r.value != null) return r.value;
      const m = Array.isArray(lead.masterData) ? lead.masterData.find(f => f.id === id) : null;
      if (m && m.value != null) return m.value;
      return null;
    }

    // 4) Aggregera per agent
    const perAgent = new Map(); // userId -> {name, group, deals, commission}
    for (const lead of allLeads) {
      const userId = lead.lastContactedBy || lead.lastUpdatedBy || null;
      if (!userId) continue;

      // ev. filtrera på grupper
      const u = userMap.get(userId);
      const groupName = u?.group || '-';
      if (groupsFilter.length && !groupsFilter.includes(groupName)) continue;

      if (!perAgent.has(userId)) {
        perAgent.set(userId, { id: userId, name: u?.name || `User ${userId}`, group: groupName, deals: 0, commission: 0 });
      }

      // deals
      let deals = parseFloat(getFieldValue(lead, MULTIDEALS_ID));
      if (!Number.isFinite(deals) || deals <= 0) deals = 1;

      // commission
      let commission = parseFloat(getFieldValue(lead, COMMISSION_ID));
      if (!Number.isFinite(commission) || commission < 0) commission = 0;

      const row = perAgent.get(userId);
      row.deals += deals;
      row.commission += commission;
    }

    // 5) Sortering & topp N
    const rows = Array.from(perAgent.values());
    rows.sort((a, b) => {
      if (metric === 'commission') return b.commission - a.commission || b.deals - a.deals;
      return b.deals - a.deals || b.commission - a.commission;
    });
    const top = rows.slice(0, size);

    res.json({
      ok: true,
      period: { from: fromISO, to: toISO },
      metric,
      size,
      totalAgents: rows.length,
      data: top,
    });
  } catch (err) {
    console.error('❌ /api/leaderboard error:', err.response?.status, err.response?.data || err.message);
    res.status(500).json({
      error: 'leaderboard_failed',
      details: err.response?.data || err.message,
    });
  }
});

// ---------- SPA fallback ----------
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`🚀 Sweet TV running on ${PORT}`);
});
