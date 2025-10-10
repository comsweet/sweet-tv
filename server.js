import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fetch from 'node-fetch';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.set("io", io);

const PORT = process.env.PORT || 3000;

// ==== Adversus API config (byt ENDPOINT/param byggare om er Swagger skiljer sig) ====
const ADV_BASE = process.env.ADV_BASE || "";
const ADV_USER = process.env.ADV_USER || "";
const ADV_PASS = process.env.ADV_PASS || "";
const AUTH = (ADV_USER && ADV_PASS) ? "Basic " + Buffer.from(`${ADV_USER}:${ADV_PASS}`).toString("base64") : null;

// Här kan du byta endpoint till den som i er Swagger returnerar utfall "Success" med userId/kampanj/resultFields.
const SUCCESS_ENDPOINT = "/dispositions"; 
// Bygg query. Om er Swagger heter annat, anpassa här – resten av koden behöver inte ändras.
function buildSuccessQuery({ sinceISO, page = 1, pageSize = 100 }) {
  return { outcome: "Success", updatedSince: sinceISO, page, pageSize };
}

// ====== Helpers ======
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.get("/healthz", (_, res) => res.json({ ok: true }));

async function api(path, qs = {}) {
  if (!ADV_BASE || !AUTH) throw new Error("Missing ADV_BASE/ADV_USER/ADV_PASS");
  const url = new URL(path, ADV_BASE);
  Object.entries(qs).forEach(([k, v]) => (v !== undefined && v !== null) && url.searchParams.set(k, v));
  const r = await fetch(url, { headers: { Authorization: AUTH } });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`API ${url} -> ${r.status}: ${text}`);
  }
  return r.json();
}

function startOfToday() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d;
}
function startOfMonth() {
  const d = new Date();
  d.setDate(1); d.setHours(0,0,0,0);
  return d;
}

// ====== Brand mapping via userGroups (admin-styrt) ======
// Ex: groups.sinfrid = ["Sinfrid Bangkok","Sinfrid Hua Hin"]; groups.dentle = [...]
let groups = {
  sinfrid: [],
  dentle:  []
};
// Enkel util som avgör brand utifrån userGroup-lista, fallback kampanjnamn
function resolveBrand({ userGroupName = "", userGroups = [], campaignName = "" }) {
  const all = [
    ...(Array.isArray(userGroups) ? userGroups : []),
    ...(userGroupName ? [userGroupName] : []),
  ].map(s => String(s).toLowerCase());

  const isIn = (arr, needle) => arr.some(name => name.includes(needle.toLowerCase()));

  // matcha mot admin-konfigurerade grupper
  const dentleHit = groups.dentle.some(g => isIn(all, g.toLowerCase()));
  const sinfridHit = groups.sinfrid.some(g => isIn(all, g.toLowerCase()));

  if (dentleHit && !sinfridHit) return "dentle";
  if (sinfridHit && !dentleHit) return "sinfrid";

  // fallback mot kampanjnamn
  const camp = (campaignName || "").toLowerCase();
  if (camp.includes("sinfrid")) return "sinfrid";
  if (camp.includes("dentle"))  return "dentle";

  // om oklart, defaulta till dentle (går att ändra)
  return "dentle";
}

// ====== Leaderboard in-memory ======
// nyckel: brand:scope:periodKey -> Map(agentKey -> {name, avatar, deals, commission})
const buckets = new Map();
function periodKey(scope, when = new Date()) {
  if (scope === "today") return `${when.getFullYear()}-${when.getMonth()+1}-${when.getDate()}`;
  if (scope === "month") return `${when.getFullYear()}-${when.getMonth()+1}`;
  return "all";
}
function bucketName(brand, scope, when) {
  return `${brand}:${scope}:${periodKey(scope, when)}`;
}
function upsertScore({ brand, agentId, agentName, avatar, deals, commission, at }) {
  const when = at ? new Date(at) : new Date();
  for (const scope of ["today","month"]) {
    const key = bucketName(brand, scope, when);
    if (!buckets.has(key)) buckets.set(key, new Map());
    const map = buckets.get(key);
    const id = agentId || agentName || "unknown";
    const prev = map.get(id) || { name: agentName || "Okänd", avatar: avatar || null, deals: 0, commission: 0 };
    prev.deals += Number(deals) || 0;
    prev.commission += Number(commission) || 0;
    prev.name = agentName || prev.name;
    prev.avatar = avatar || prev.avatar;
    map.set(id, prev);
  }
}
function topN(brand, scope, field, n = 10) {
  const key = bucketName(brand, scope, new Date());
  const map = buckets.get(key) || new Map();
  return [...map.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0))
    .slice(0, n);
}
app.get("/leaderboard", (req, res) => {
  res.json({
    dentle: {
      today: { byDeals: topN("dentle","today","deals"), byCommission: topN("dentle","today","commission") },
      month: { byDeals: topN("dentle","month","deals"), byCommission: topN("dentle","month","commission") }
    },
    sinfrid: {
      today: { byDeals: topN("sinfrid","today","deals"), byCommission: topN("sinfrid","today","commission") },
      month: { byDeals: topN("sinfrid","month","deals"), byCommission: topN("sinfrid","month","commission") }
    }
  });
});

// ====== Agent cache (valfritt – om ni vill hämta displayName/avatar från API) ======
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

// ====== Backfill & Polling ======
const processedIds = new Set();
async function processSuccessRow(d) {
  // Anpassa dessa fält efter er Swagger-respons:
  const userId = d.userId || d.agentId || null;
  const agent = await hydrateAgent(userId);
  const brand = resolveBrand({
    userGroupName: d.userGroupName,
    userGroups: d.userGroups || [],
    campaignName: d.campaignName || ""
  });
  const commission = Number(d.resultFields?.Commission || d.resultFields?.commission || 0);
  const deals = Number(d.resultFields?.MultiDeals || d.resultFields?.multiDeals || 1);
  const at = d.updatedAt || d.savedAt || d.createdAt || new Date().toISOString();

  // uppdatera leaderboard
  upsertScore({
    brand,
    agentId: userId,
    agentName: agent?.name || d.userDisplayName || d.userName || "Okänd",
    avatar: agent?.avatar || null,
    deals,
    commission,
    at
  });

  // pling
  io.emit("success_event", {
    type: "success", brand,
    agentId: userId,
    agentName: agent?.name || d.userDisplayName || d.userName || "Okänd",
    avatar: agent?.avatar || null,
    commission, deals, at, id: d.id || String(Math.random())
  });
}

async function fetchPageSince(sinceISO, page = 1) {
  const q = buildSuccessQuery({ sinceISO, page, pageSize: 100 });
  const res = await api(SUCCESS_ENDPOINT, q);
  const rows = res.data || res || []; // beroende på svarstruktur
  return { rows, hasNext: !!res.nextPage, nextPage: (res.nextPage || page + 1) };
}

// Backfill en period: hämtar alla Success sedan sinceISO
async function backfillSince(sinceISO) {
  try {
    let page = 1, loop = true;
    while (loop) {
      const { rows, hasNext, nextPage } = await fetchPageSince(sinceISO, page);
      for (const d of rows) {
        const id = d.id || `${d.leadId || ""}-${d.updatedAt || ""}`;
        if (processedIds.has(id)) continue;
        processedIds.add(id);
        await processSuccessRow(d);
      }
      if (hasNext) { page = nextPage; } else { loop = false; }
    }
  } catch (e) {
    console.error("backfillSince error:", e.message);
  }
}

// Polling: hämtar ändringar sedan senaste körning
let cursorISO = new Date(0).toISOString();
async function pollTick() {
  try {
    const since = cursorISO;
    const { rows } = await fetchPageSince(since, 1);
    let maxTime = since;
    for (const d of rows) {
      const id = d.id || `${d.leadId || ""}-${d.updatedAt || ""}`;
      if (processedIds.has(id)) continue;
      processedIds.add(id);
      await processSuccessRow(d);
      const t = d.updatedAt || d.savedAt || d.createdAt || new Date().toISOString();
      if (t > maxTime) maxTime = t;
    }
    cursorISO = maxTime;
  } catch (e) {
    console.error("pollTick error:", e.message);
  }
}

// Startsekvens: backfill idag + denna månad, sedan polling
(async () => {
  try {
    const today = startOfToday().toISOString();
    const month = startOfMonth().toISOString();
    await backfillSince(month); // detta fyller både månad och – genom datumen – även dagens bucket
    // bumpa cursorn till nu så vi inte reprocessar hela månaden på första pollet
    cursorISO = new Date().toISOString();
  } catch (e) {
    console.error("initial backfill error:", e.message);
  }
})();
const POLL_MS = Number(process.env.POLL_MS || 8000);
setInterval(pollTick, POLL_MS);

// ====== Admin UI för userGroup → brand ======
app.get("/admin", (req, res) => {
  const html = `
  <!doctype html><meta charset="utf-8"/>
  <title>Sweet TV – Admin</title>
  <style>
    body{font-family: system-ui, sans-serif; background:#0b1220; color:#fff; margin:0; padding:20px}
    .wrap{max-width:760px; margin:auto}
    h1{margin:0 0 12px}
    label{display:block; margin:16px 0 6px; font-weight:700}
    textarea{width:100%; height:120px; border-radius:10px; border:1px solid #32405f; background:#111a2b; color:#fff; padding:10px}
    .hint{opacity:.8; font-size:12px}
    button{background:#3b82f6; border:none; padding:10px 16px; border-radius:10px; color:#fff; font-weight:700; cursor:pointer; margin-top:12px}
    .card{background:#111a2b; border:1px solid #24324d; padding:16px; border-radius:12px}
  </style>
  <div class="wrap">
    <h1>Admin – userGroups mapping</h1>
    <form method="POST" action="/admin/mapping" class="card">
      <label>Dentle – userGroups (kommaseparerade)</label>
      <textarea name="dentle">${groups.dentle.join(", ")}</textarea>
      <div class="hint">Ex: Dentle Bangkok, Dentle Hua Hin</div>

      <label>Sinfrid – userGroups (kommaseparerade)</label>
      <textarea name="sinfrid">${groups.sinfrid.join(", ")}</textarea>
      <div class="hint">Ex: Sinfrid Bangkok, Sinfrid Hua Hin</div>

      <button>Spara</button>
    </form>

    <div style="height:16px"></div>
    <div class="card">
      <strong>Tips:</strong> kör en snabb test-pling:<br/>
      <code>/dev/mock-success?brand=sinfrid&agentName=Anna&commission=1200&deals=1&avatar=https://i.pravatar.cc/160</code>
    </div>
  </div>`;
  res.setHeader("content-type","text/html; charset=utf-8");
  res.end(html);
});
app.post("/admin/mapping", (req, res) => {
  const dentle = String(req.body.dentle || "").split(",").map(s => s.trim()).filter(Boolean);
  const sinfrid = String(req.body.sinfrid || "").split(",").map(s => s.trim()).filter(Boolean);
  groups.dentle = dentle;
  groups.sinfrid = sinfrid;
  res.redirect("/admin");
});

// ====== Mock (GET/POST) – uppdaterar även leaderboard ======
function emitAndScore({ brand = "dentle", agentName = "Test Agent", commission = 250, deals = 1, avatar = null }) {
  const ev = {
    type: "success",
    brand,
    agentId: null,
    agentName,
    avatar: avatar || null,
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
app.post("/dev/mock-success", (req, res) => res.json({ ok: true, sent: emitAndScore(req.body || {}) }));
app.get("/dev/mock-success", (req, res) => res.json({ ok: true, sent: emitAndScore(req.query || {}) }));

io.on("connection", (socket) => {
  console.log("TV connected:", socket.id);
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
