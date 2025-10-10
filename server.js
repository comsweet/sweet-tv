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

const ADV_BASE = process.env.ADV_BASE || "";
const ADV_USER = process.env.ADV_USER || "";
const ADV_PASS = process.env.ADV_PASS || "";
const AUTH = (ADV_USER && ADV_PASS) ? "Basic " + Buffer.from(`${ADV_USER}:${ADV_PASS}`).toString("base64") : null;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.get("/healthz", (_, res) => res.json({ ok: true }));

// -----------------------------
// TID / HJÄLP
// -----------------------------
function startOfToday() { const d = new Date(); d.setHours(0,0,0,0); return d; }
function startOfMonth() { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; }
function iso(d) { return (d instanceof Date ? d : new Date(d)).toISOString(); }

async function api(path, qs = {}) {
  if (!ADV_BASE || !AUTH) throw new Error("Saknar ADV_BASE/ADV_USER/ADV_PASS");
  const url = new URL(path, ADV_BASE);
  for (const [k,v] of Object.entries(qs)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  const r = await fetch(url, { headers: { Authorization: AUTH } });
  if (!r.ok) throw new Error(`API ${url} -> ${r.status}: ${await r.text()}`);
  const text = await r.text();
  try { return JSON.parse(text); } catch { return text; }
}

const processedIds = new Set();

// -----------------------------
// ADMIN: brand mapping via userGroups
// -----------------------------
let groups = { dentle: [], sinfrid: [] }; // admin fyller i via /admin

function resolveBrand({ userGroupName = "", userGroups = [], campaignName = "" }) {
  const all = [
    ...(Array.isArray(userGroups) ? userGroups : []),
    ...(userGroupName ? [userGroupName] : []),
  ].map(s => String(s).toLowerCase());

  const hasAny = (needleList) =>
    needleList.some(g => all.some(name => name.includes(String(g).toLowerCase())));

  const dentleHit = hasAny(groups.dentle);
  const sinfridHit = hasAny(groups.sinfrid);
  if (dentleHit && !sinfridHit) return "dentle";
  if (sinfridHit && !dentleHit) return "sinfrid";

  const camp = (campaignName || "").toLowerCase();
  if (camp.includes("sinfrid")) return "sinfrid";
  if (camp.includes("dentle"))  return "dentle";
  return "dentle";
}

// -----------------------------
// AUTO-DETEKT AV ADVERSUS-ENDPOINT & FÄLT
// -----------------------------
/**
 * config hittas av probe och används i all hämtning
 * - endpoint: t.ex. /dispositions eller /calls eller /activities
 * - timeParam: "updatedSince" | "from"
 * - outcomeParam + successValue: t.ex. ("outcome","Success") eller ("status","Success")
 * - idField, userIdField, campaignField, userGroupField, timeFields[], resultFields {commissionKey, dealsKey}
 * - container: "data" | null (där raderna ligger)
 */
let config = {
  endpoint: null,
  timeParam: "updatedSince",
  outcomeParam: "outcome",
  successValue: "Success",
  idField: "id",
  userIdField: "userId",
  campaignField: "campaignName",
  userGroupField: "userGroupName",  // kan vara "userGroups"
  timeFields: ["updatedAt","savedAt","createdAt"],
  resultFields: { commissionKey: "Commission", dealsKey: "MultiDeals" },
  container: "data"
};

const CANDIDATE_ENDPOINTS = ["/dispositions", "/calls", "/activities"];
const CANDIDATE_TIMEPARAMS = ["updatedSince", "from"];
const CANDIDATE_OUTCOME = [
  { key: "outcome", value: "Success" },
  { key: "status",  value: "Success" }
];

function pick(obj, keys) { for (const k of keys) if (obj && k in obj) return obj[k]; return null; }
function getTime(obj, keys) { const t = pick(obj, keys); return t ? new Date(t).toISOString() : null; }
function getContainer(res) {
  if (Array.isArray(res)) return { arr: res, container: null };
  if (res && Array.isArray(res.data)) return { arr: res.data, container: "data" };
  return { arr: [], container: null };
}

function inferFields(row) {
  // user id
  const userIdField = ["userId","agentId","ownerId"].find(k => k in row) || "userId";
  // campaign
  const campaignField = ["campaignName","campaign","campaignTitle"].find(k => k in row) || "campaignName";
  // groups
  const userGroupField = ["userGroupName","userGroups"].find(k => k in row) || "userGroupName";
  // resultFields
  let rf = row.resultFields || row.results || {};
  const commissionKey = ["Commission","commission","commissions","prov","provion"].find(k => rf && k in rf) || "Commission";
  const dealsKey = ["MultiDeals","multiDeals","deals","orders","count"].find(k => rf && k in rf) || "MultiDeals";
  // time fields
  const timeFields = ["updatedAt","savedAt","createdAt"].filter(k => k in row);
  // id
  const idField = ["id","callId","activityId","dispositionId","leadId"].find(k => k in row) || "id";
  return { userIdField, campaignField, userGroupField, resultFields: { commissionKey, dealsKey }, timeFields: timeFields.length ? timeFields : ["updatedAt","savedAt","createdAt"], idField };
}

async function tryProbe(endpoint, timeParam, outcomePair, sinceISO) {
  const q = {}; q[timeParam] = sinceISO; q[outcomePair.key] = outcomePair.value; q.page = 1; q.pageSize = 5;
  const res = await api(endpoint, q);
  const { arr, container } = getContainer(res);
  if (!Array.isArray(arr)) return null;
  if (arr.length === 0) {
    // tom lista kan ändå vara rätt – returnera baserat på inget fel
    return { endpoint, timeParam, outcomeParam: outcomePair.key, successValue: outcomePair.value, container, fields: null };
  }
  const fields = inferFields(arr[0]);
  return { endpoint, timeParam, outcomeParam: outcomePair.key, successValue: outcomePair.value, container, fields };
}

async function probeAdversus() {
  const since = startOfMonth().toISOString(); // plocka något säkert
  for (const ep of CANDIDATE_ENDPOINTS) {
    for (const tp of CANDIDATE_TIMEPARAMS) {
      for (const oc of CANDIDATE_OUTCOME) {
        try {
          const pr = await tryProbe(ep, tp, oc, since);
          if (pr) {
            // om fields null (tom lista) – behåll default fields; annars ersätt
            config.endpoint    = pr.endpoint;
            config.timeParam   = pr.timeParam;
            config.outcomeParam= pr.outcomeParam;
            config.successValue= pr.successValue;
            if (pr.container)  config.container = pr.container;
            if (pr.fields) {
              config.idField        = pr.fields.idField;
              config.userIdField    = pr.fields.userIdField;
              config.campaignField  = pr.fields.campaignField;
              config.userGroupField = pr.fields.userGroupField;
              config.timeFields     = pr.fields.timeFields;
              config.resultFields   = pr.fields.resultFields;
            }
            return { ok: true, config };
          }
        } catch (e) {
          // prova nästa kandidat
        }
      }
    }
  }
  return { ok:false, error: "Hittade ingen fungerande kombination (endpoint/parametrar)." };
}

// -----------------------------
// BACKFILL & POLLING (drar nytta av config)
// -----------------------------
function buildQuery(sinceISO, page = 1, pageSize = 100) {
  const q = {};
  q[config.timeParam] = sinceISO;
  q[config.outcomeParam] = config.successValue;
  q.page = page; q.pageSize = pageSize;
  return q;
}
function extractRows(res) {
  if (config.container === "data" && res && Array.isArray(res.data)) return res.data;
  if (Array.isArray(res)) return res;
  return [];
}

async function fetchPage(sinceISO, page = 1) {
  const res = await api(config.endpoint, buildQuery(sinceISO, page, 100));
  const rows = extractRows(res);
  const hasNext = !!res?.nextPage; // om svaret har nextPage
  const nextPage = res?.nextPage || page + 1;
  return { rows, hasNext, nextPage };
}

const agentCache = new Map();
async function hydrateAgent(userId) {
  if (!userId) return null;
  if (agentCache.has(userId)) return agentCache.get(userId);
  try {
    const u = await api(`/users/${userId}`);
    const out = { name: u.displayName || u.fullName || u.username || `User ${userId}`, avatar: u.avatarUrl || null };
    agentCache.set(userId, out);
    return out;
  } catch {
    return { name: `User ${userId}`, avatar: null };
  }
}

// buckets: brand:scope:periodKey -> Map(agent -> {name, avatar, deals, commission})
const buckets = new Map();
function periodKey(scope, when = new Date()) {
  if (scope === "today") return `${when.getFullYear()}-${when.getMonth()+1}-${when.getDate()}`;
  if (scope === "month") return `${when.getFullYear()}-${when.getMonth()+1}`;
  return "all";
}
function bucketName(brand, scope, when) { return `${brand}:${scope}:${periodKey(scope, when)}`; }
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

async function processRow(d) {
  const idField = config.idField;
  const userIdField = config.userIdField;
  const campaignField = config.campaignField;
  const userGroupField = config.userGroupField;

  const rf = d.resultFields || d.results || {};
  const commission = Number(rf?.[config.resultFields.commissionKey] ?? 0);
  const deals = Number(rf?.[config.resultFields.dealsKey] ?? 1);

  const t = getTime(d, config.timeFields) || new Date().toISOString();

  const userId = d[userIdField] || null;
  const agent = await hydrateAgent(userId);

  const brand = resolveBrand({
    userGroupName: typeof d[userGroupField] === "string" ? d[userGroupField] : "",
    userGroups: Array.isArray(d[userGroupField]) ? d[userGroupField] : [],
    campaignName: d[campaignField] || ""
  });

  upsertScore({
    brand,
    agentId: userId,
    agentName: agent?.name || d.userDisplayName || d.userName || "Okänd",
    avatar: agent?.avatar || null,
    deals, commission, at: t
  });

  io.emit("success_event", {
    type: "success", brand,
    agentId: userId,
    agentName: agent?.name || d.userDisplayName || d.userName || "Okänd",
    avatar: agent?.avatar || null,
    commission, deals, at: t,
    id: d[idField] || `${d.leadId || ""}-${t}`
  });
}

async function backfillSince(sinceISO) {
  try {
    let page = 1, loop = true;
    while (loop) {
      const { rows, hasNext, nextPage } = await fetchPage(sinceISO, page);
      for (const d of rows) {
        const id = d[config.idField] || `${d.leadId || ""}-${getTime(d, config.timeFields)}`;
        if (processedIds.has(id)) continue;
        processedIds.add(id);
        await processRow(d);
      }
      if (hasNext) page = nextPage; else loop = false;
    }
  } catch (e) {
    console.error("backfillSince error:", e.message);
  }
}

let cursorISO = new Date().toISOString();
async function pollTick() {
  try {
    const since = cursorISO;
    const { rows } = await fetchPage(since, 1);
    let maxTime = since;
    for (const d of rows) {
      const id = d[config.idField] || `${d.leadId || ""}-${getTime(d, config.timeFields)}`;
      if (processedIds.has(id)) continue;
      processedIds.add(id);
      await processRow(d);
      const t = getTime(d, config.timeFields) || since;
      if (t > maxTime) maxTime = t;
    }
    cursorISO = maxTime;
  } catch (e) {
    console.error("pollTick error:", e.message);
  }
}

// -----------------------------
// ADMIN UI
// -----------------------------
app.get("/admin", (req, res) => {
  const html = `
  <!doctype html><meta charset="utf-8"/>
  <title>Sweet TV – Admin</title>
  <style>
    body{font-family: system-ui, sans-serif; background:#0b1220; color:#fff; margin:0; padding:20px}
    .wrap{max-width:920px; margin:auto}
    h1{margin:0 0 12px}
    label{display:block; margin:16px 0 6px; font-weight:700}
    textarea,input{width:100%; border-radius:10px; border:1px solid #32405f; background:#111a2b; color:#fff; padding:10px}
    textarea{height:120px}
    .hint{opacity:.8; font-size:12px}
    .row{display:grid; grid-template-columns: 1fr 1fr; gap:16px}
    .card{background:#111a2b; border:1px solid #24324d; padding:16px; border-radius:12px; margin:12px 0}
    button{background:#3b82f6; border:none; padding:10px 16px; border-radius:10px; color:#fff; font-weight:700; cursor:pointer}
    code{background:#0e1729; padding:2px 6px; border-radius:6px}
  </style>
  <div class="wrap">
    <h1>Admin</h1>

    <div class="card">
      <h3 style="margin-top:0">1) Autodetektera Adversus API</h3>
      <form method="POST" action="/admin/probe">
        <button>Testa & spara Adversus-API</button>
      </form>
      <div style="margin-top:10px" class="hint">Nuvarande konfiguration:
        <div>endpoint: <code>${config.endpoint || "-"}</code></div>
        <div>timeParam: <code>${config.timeParam}</code> • outcome: <code>${config.outcomeParam}=${config.successValue}</code></div>
        <div>idField: <code>${config.idField}</code> • userIdField: <code>${config.userIdField}</code></div>
        <div>campaignField: <code>${config.campaignField}</code> • userGroupField: <code>${config.userGroupField}</code></div>
        <div>timeFields: <code>${config.timeFields.join(", ")}</code></div>
        <div>resultFields: <code>${config.resultFields.dealsKey}</code> / <code>${config.resultFields.commissionKey}</code></div>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-top:0">2) userGroups → brand</h3>
      <form method="POST" action="/admin/mapping">
        <label>Dentle – userGroups (kommaseparerade)</label>
        <textarea name="dentle">${groups.dentle.join(", ")}</textarea>
        <div class="hint">Ex: Dentle Bangkok, Dentle Hua Hin</div>

        <label>Sinfrid – userGroups (kommaseparerade)</label>
        <textarea name="sinfrid">${groups.sinfrid.join(", ")}</textarea>
        <div class="hint">Ex: Sinfrid Bangkok, Sinfrid Hua Hin</div>

        <button>Spara</button>
      </form>
    </div>

    <div class="card">
      <h3 style="margin-top:0">3) Snabbtest</h3>
      <div class="hint">Öppna TV: <code>/tv.html</code></div>
      <div class="hint">Test-pling: <code>/dev/mock-success?brand=sinfrid&agentName=Anna&commission=1200&deals=1&avatar=https://i.pravatar.cc/160</code></div>
    </div>
  </div>`;
  res.setHeader("content-type","text/html; charset=utf-8");
  res.end(html);
});

app.post("/admin/probe", async (req, res) => {
  try {
    const pr = await probeAdversus();
    if (!pr.ok) throw new Error(pr.error || "probe misslyckades");
    // kör backfill efter lyckad probe
    await backfillSince(startOfMonth().toISOString());
    cursorISO = new Date().toISOString(); // börja poll efter "nu"
    res.redirect("/admin");
  } catch (e) {
    res.status(500).send(`Probe-fel: ${e.message}`);
  }
});

app.post("/admin/mapping", (req, res) => {
  const dentle = String(req.body.dentle || "").split(",").map(s => s.trim()).filter(Boolean);
  const sinfrid = String(req.body.sinfrid || "").split(",").map(s => s.trim()).filter(Boolean);
  groups.dentle = dentle;
  groups.sinfrid = sinfrid;
  res.redirect("/admin");
});

// -----------------------------
// MOCK (GET/POST) – uppdaterar även leaderboard + pling
// -----------------------------
function emitAndScore({ brand = "dentle", agentName = "Test Agent", commission = 250, deals = 1, avatar = null }) {
  const ev = {
    type: "success", brand,
    agentId: null, agentName, avatar: avatar || null,
    commission: Number(commission) || 0, deals: Number(deals) || 1,
    at: new Date().toISOString(), id: "mock-" + Date.now()
  };
  upsertScore({ brand: ev.brand, agentId: ev.agentId, agentName: ev.agentName, avatar: ev.avatar, deals: ev.deals, commission: ev.commission, at: ev.at });
  io.emit("success_event", ev);
  return ev;
}
app.post("/dev/mock-success", (req, res) => res.json({ ok: true, sent: emitAndScore(req.body || {}) }));
app.get("/dev/mock-success", (req, res) => res.json({ ok: true, sent: emitAndScore(req.query || {}) }));

io.on("connection", (socket) => console.log("TV connected:", socket.id));

server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
