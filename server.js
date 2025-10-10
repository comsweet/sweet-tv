import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fetch from 'node-fetch';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.set("io", io); // så vi kan nå io i GET-mocken

const PORT = process.env.PORT || 3000;
const ADV_BASE = process.env.ADV_BASE;
const ADV_USER = process.env.ADV_USER;
const ADV_PASS = process.env.ADV_PASS;
const AUTH = (ADV_USER && ADV_PASS)
  ? "Basic " + Buffer.from(`${ADV_USER}:${ADV_PASS}`).toString("base64")
  : null;

app.use(express.json());
app.use(express.static("public"));

// -----------------------------
// Hälsa
// -----------------------------
app.get("/healthz", (_, res) => res.json({ ok: true }));

// -----------------------------
// Hjälpare
// -----------------------------
function isDentleCampaign(name = "") { return /dentle/i.test(name); }
function isSinfridCampaign(name = "") { return /sinfrid/i.test(name); }

async function api(path, qs = {}) {
  if (!ADV_BASE || !AUTH) throw new Error("Missing ADV_BASE/ADV_USER/ADV_PASS");
  const url = new URL(path, ADV_BASE);
  Object.entries(qs).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url, { headers: { Authorization: AUTH } });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`API ${url} -> ${r.status}: ${text}`);
  }
  return r.json();
}

// -----------------------------
// In-memory leaderboard
// -----------------------------
// bucketKey("today"|"month") → Map(agentId -> {name, avatar, deals, commission})
const buckets = new Map();

function bucketKey(brand, scope, date = new Date()) {
  if (scope === "today") return `${brand}:today:${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;
  return `${brand}:month:${date.getFullYear()}-${date.getMonth()+1}`;
}

function upsertScore({ brand, agentId, agentName, avatar, deals, commission, at }) {
  const when = at ? new Date(at) : new Date();
  const todayKey = bucketKey(brand, "today", when);
  const monthKey = bucketKey(brand, "month", when);

  for (const key of [todayKey, monthKey]) {
    if (!buckets.has(key)) buckets.set(key, new Map());
    const map = buckets.get(key);
    const prev = map.get(agentId || agentName) || { name: agentName || "Okänd", avatar: avatar || null, deals: 0, commission: 0 };
    prev.deals += Number(deals) || 0;
    prev.commission += Number(commission) || 0;
    map.set(agentId || agentName, prev);
  }
}

function topN(brand, scope, field, n = 10) {
  const key = bucketKey(brand, scope, new Date());
  const map = buckets.get(key) || new Map();
  return [...map.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0))
    .slice(0, n);
}

// API för TV att hämta listan
app.get("/leaderboard", (req, res) => {
  res.json({
    dentle: {
      today: { byDeals: topN("dentle", "today", "deals"), byCommission: topN("dentle", "today", "commission") },
      month: { byDeals: topN("dentle", "month", "deals"), byCommission: topN("dentle", "month", "commission") },
    },
    sinfrid: {
      today: { byDeals: topN("sinfrid", "today", "deals"), byCommission: topN("sinfrid", "today", "commission") },
      month: { byDeals: topN("sinfrid", "month", "deals"), byCommission: topN("sinfrid", "month", "commission") },
    }
  });
});

// -----------------------------
// Agent-cache (om ni hämtar user-profiler sen)
// -----------------------------
const agentCache = new Map();
async function hydrateAgent(userId) {
  if (!userId) return null;
  if (agentCache.has(userId)) return agentCache.get(userId);
  try {
    const u = await api(`/users/${userId}`);
    const out = { name: u.displayName || u.fullName || u.username || `User ${userId}`, avatar: u.avatarUrl || null };
    agentCache.set(userId, out);
    return out;
  } catch (e) {
    console.warn("hydrateAgent error:", e.message);
    return { name: `User ${userId}`, avatar: null };
  }
}

// -----------------------------
// Polling mot Adversus (kan justeras senare)
// -----------------------------
const processedIds = new Set();
let cursor = { dentle: new Date(0).toISOString(), sinfrid: new Date(0).toISOString() };

function buildEvent(brand, agent, d) {
  return {
    type: "success",
    brand,
    agentId: d.userId || null,
    agentName: agent?.name || "Okänd",
    avatar: agent?.avatar || null,
    commission: Number(d.resultFields?.Commission || 0),
    deals: Number(d.resultFields?.MultiDeals || 1),
    at: d.savedAt || d.updatedAt || new Date().toISOString(),
    id: d.id
  };
}

async function fetchNewSuccess(brand) {
  const since = cursor[brand];
  let newest = since;

  // OBS: Byt endpoint/parametrar till de som finns i er Swagger (exemplet kan ge 500).
  try {
    const res = await api("/dispositions", { outcome: "Success", updatedSince: since, page: 1, pageSize: 100 });
    const rows = res.data || [];
    for (const d of rows) {
      const camp = d.campaignName || "";
      if (brand === "dentle" && !isDentleCampaign(camp)) continue;
      if (brand === "sinfrid" && !isSinfridCampaign(camp)) continue;
      if (processedIds.has(d.id)) continue;
      processedIds.add(d.id);

      const agent = await hydrateAgent(d.userId);
      const ev = buildEvent(brand, agent, d);

      // uppdatera leaderboard
      upsertScore({
        brand: ev.brand,
        agentId: ev.agentId,
        agentName: ev.agentName,
        avatar: ev.avatar,
        deals: ev.deals,
        commission: ev.commission,
        at: ev.at
      });

      io.emit("success_event", ev);

      const cand = d.updatedAt || d.savedAt || new Date().toISOString();
      if (cand > newest) newest = cand;
    }
  } catch (e) {
    console.error("fetchNewSuccess API error:", e.message);
  }

  cursor[brand] = newest;
}

const dentleMs = Number(process.env.POLL_MS_DENTLE || 10000);
const sinfridMs = Number(process.env.POLL_MS_SINFRID || 10000);
setInterval(() => fetchNewSuccess("dentle").catch(console.error), dentleMs);
setInterval(() => fetchNewSuccess("sinfrid").catch(console.error), sinfridMs);

// -----------------------------
// Mock (POST + GET)
// -----------------------------
function emitAndScore({ brand = "dentle", agentName = "Test Agent", commission = 250, deals = 1 }) {
  const ev = {
    type: "success",
    brand,
    agentId: null,
    agentName,
    avatar: null,
    commission: Number(commission) || 0,
    deals: Number(deals) || 1,
    at: new Date().toISOString(),
    id: "mock-" + Date.now()
  };
  upsertScore({
    brand: ev.brand, agentId: ev.agentId, agentName: ev.agentName, avatar: ev.avatar,
    deals: ev.deals, commission: ev.commission, at: ev.at
  });
  io.emit("success_event", ev);
  return ev;
}

app.post("/dev/mock-success", (req, res) => {
  const ev = emitAndScore(req.body || {});
  res.json({ ok: true, sent: ev });
});

app.get("/dev/mock-success", (req, res) => {
  const ev = emitAndScore(req.query || {});
  res.json({ ok: true, sent: ev });
});

io.on("connection", (socket) => {
  console.log("TV connected:", socket.id);
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
