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

// === Din tenant använder api.adversus.io/v1 (du bekräftade det) ===
const ADV_BASE = process.env.ADV_BASE || "https://api.adversus.io/v1";
const ADV_USER = process.env.ADV_USER || "";
const ADV_PASS = process.env.ADV_PASS || "";
const AUTH = (ADV_USER && ADV_PASS) ? "Basic " + Buffer.from(`${ADV_USER}:${ADV_PASS}`).toString("base64") : null;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.get("/healthz", (_, res) => res.json({ ok: true }));

// ---------- Helpers ----------
function startOfMonth(){ const d=new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; }
function getFirst(obj,keys){ for(const k of keys) if (k in (obj||{})) return obj[k]; return null; }
function getTimeISO(obj, keys){ const v=getFirst(obj,keys); return v?new Date(v).toISOString():null; }

async function api(path, qs = {}) {
  if (!ADV_BASE || !AUTH) throw new Error("Saknar ADV_BASE/ADV_USER/ADV_PASS");
  const url = new URL(path, ADV_BASE);
  for (const [k,v] of Object.entries(qs)) if (v!==undefined && v!==null) url.searchParams.set(k, v);
  const r = await fetch(url, { headers: { Authorization: AUTH } });
  if (!r.ok) throw new Error(`API ${url} -> ${r.status}: ${await r.text()}`);
  const txt = await r.text();
  try { return JSON.parse(txt); } catch { return txt; }
}

// ---------- Hämta alla user groups och mappa per leaderboard ----------
let allGroups = []; // [{id,name}]
let mapByLeaderboard = {
  dentle: [],   // lista av group IDs som ska räknas till Dentle-leaderboards (idag + månad)
  sinfrid: []   // lista av group IDs som ska räknas till Sinfrid-leaderboards (idag + månad)
};

// Hämtar /groups från din tenant
async function fetchUserGroups(){
  try{
    const res = await api("/groups");
    const arr = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
    allGroups = arr.map(g => ({
      id: g.id ?? g.groupId ?? g._id ?? String(g.name || g.title),
      name: g.name ?? g.title ?? String(g.id || g.groupId || "Group")
    }));
  }catch(e){
    console.error("fetchUserGroups error:", e.message);
    allGroups = [];
  }
}

// Brand utifrån sparade grupper; fallback kampanjenamn
function brandFromRow(row){
  const ugFieldCandidates = ["userGroupName","userGroups","groupName","groups"];
  const ugField = ugFieldCandidates.find(k => k in row) || "userGroupName";
  const val = row[ugField];

  let rowGroupIds = [];
  let rowGroupNames = [];

  if (Array.isArray(val)){
    for (const x of val){
      if (typeof x === "string") rowGroupNames.push(x.toLowerCase());
      else if (x && typeof x === "object"){
        if (x.id) rowGroupIds.push(String(x.id));
        if (x.name) rowGroupNames.push(String(x.name).toLowerCase());
      }
    }
  } else if (typeof val === "string"){
    rowGroupNames.push(val.toLowerCase());
  }

  const has = (ids) =>
    rowGroupIds.some(id => ids.includes(String(id))) ||
    rowGroupNames.some(nm => allGroups.some(g => ids.includes(String(g.id)) && g.name.toLowerCase()===nm));

  const dentleHit = has(mapByLeaderboard.dentle);
  const sinfridHit = has(mapByLeaderboard.sinfrid);

  if (dentleHit && !sinfridHit) return "dentle";
  if (sinfridHit && !dentleHit) return "sinfrid";

  // fallback: kampanjnamn
  const camp = String(row.campaignName || row.campaign || row.campaignTitle || "").toLowerCase();
  if (camp.includes("sinfrid")) return "sinfrid";
  if (camp.includes("dentle"))  return "dentle";
  return "dentle";
}

// ---------- Autodetektera Success-endpoint / fält ----------
let config = {
  endpoint: null,
  timeParam: "updatedSince",
  outcomeParam: "outcome",
  successValue: "Success",
  idField: "id",
  userIdField: "userId",
  campaignField: "campaignName",
  userGroupField: "userGroupName",
  timeFields: ["updatedAt","savedAt","createdAt"],
  resultFields: { commissionKey: "Commission", dealsKey: "MultiDeals" },
  container: "data"
};

const CANDS_ENDPOINT = ["/dispositions","/calls","/activities"];
const CANDS_TIME = ["updatedSince","from"];
const CANDS_OUTCOME = [{key:"outcome",value:"Success"},{key:"status",value:"Success"}];

function inferFields(row){
  const userIdField = ["userId","agentId","ownerId"].find(k=>k in row) || "userId";
  const campaignField = ["campaignName","campaign","campaignTitle"].find(k=>k in row) || "campaignName";
  const userGroupField = ["userGroupName","userGroups","groupName","groups"].find(k=>k in row) || "userGroupName";
  const idField = ["id","callId","activityId","dispositionId","leadId"].find(k=>k in row) || "id";
  const timeFields = ["updatedAt","savedAt","createdAt"].filter(k=>k in row);
  const rf = row.resultFields || row.results || {};
  const commissionKey = ["Commission","commission","prov"].find(k=>k in (rf||{})) || "Commission";
  const dealsKey = ["MultiDeals","multiDeals","deals","orders","count"].find(k=>k in (rf||{})) || "MultiDeals";
  return { userIdField, campaignField, userGroupField, idField, timeFields: timeFields.length?timeFields:["updatedAt","savedAt","createdAt"], resultFields:{commissionKey,dealsKey} };
}
function getContainer(res){ if (Array.isArray(res)) return {arr:res,container:null}; if (res && Array.isArray(res.data)) return {arr:res.data,container:"data"}; return {arr:[],container:null}; }

async function tryProbe(endpoint, timeParam, outcomePair, sinceISO){
  const q = {}; q[timeParam]=sinceISO; q[outcomePair.key]=outcomePair.value; q.page=1; q.pageSize=5;
  const res = await api(endpoint, q);
  const {arr,container} = getContainer(res);
  const fields = arr.length ? inferFields(arr[0]) : null;
  return { endpoint, timeParam, outcomeParam: outcomePair.key, successValue: outcomePair.value, container, fields };
}
async function probeAdversus(){
  const since = startOfMonth().toISOString();
  for (const ep of CANDS_ENDPOINT){
    for (const tp of CANDS_TIME){
      for (const oc of CANDS_OUTCOME){
        try{
          const pr = await tryProbe(ep,tp,oc,since);
          config.endpoint = pr.endpoint;
          config.timeParam = pr.timeParam;
          config.outcomeParam = pr.outcomeParam;
          config.successValue = pr.successValue;
          if (pr.container) config.container = pr.container;
          if (pr.fields) Object.assign(config, pr.fields);
          return { ok:true, config };
        }catch(e){ /* prova nästa */ }
      }
    }
  }
  return { ok:false, error:"Hittade ingen fungerande kombination." };
}

// ---------- Leaderboard in-memory ----------
const buckets = new Map(); // brand:scope:key -> Map(agent -> {name,avatar,deals,commission})
function periodKey(scope, when=new Date()){
  if (scope==="today") return `${when.getFullYear()}-${when.getMonth()+1}-${when.getDate()}`;
  if (scope==="month") return `${when.getFullYear()}-${when.getMonth()+1}`;
  return "all";
}
function bKey(brand,scope,when){ return `${brand}:${scope}:${periodKey(scope,when)}`; }
function upsertScore({ brand, agentId, agentName, avatar, deals, commission, at }){
  const when = at ? new Date(at) : new Date();
  for (const scope of ["today","month"]){
    const key = bKey(brand,scope,when);
    if (!buckets.has(key)) buckets.set(key,new Map());
    const map = buckets.get(key);
    const id = agentId || agentName || "unknown";
    const prev = map.get(id) || { name: agentName||"Okänd", avatar: avatar||null, deals:0, commission:0 };
    prev.deals += Number(deals)||0;
    prev.commission += Number(commission)||0;
    prev.name = agentName || prev.name;
    prev.avatar = avatar || prev.avatar;
    map.set(id, prev);
  }
}
function topN(brand, scope, field, n=10){
  const map = buckets.get(bKey(brand,scope,new Date())) || new Map();
  return [...map.entries()].map(([id,v])=>({id,...v})).sort((a,b)=>(b[field]??0)-(a[field]??0)).slice(0,n);
}
app.get("/leaderboard",(req,res)=>{
  res.json({
    dentle:{ today:{byDeals:topN("dentle","today","deals"), byCommission:topN("dentle","today","commission")},
             month:{byDeals:topN("dentle","month","deals"), byCommission:topN("dentle","month","commission")} },
    sinfrid:{ today:{byDeals:topN("sinfrid","today","deals"), byCommission:topN("sinfrid","today","commission")},
              month:{byDeals:topN("sinfrid","month","deals"), byCommission:topN("sinfrid","month","commission")} }
  });
});

// ---------- Agent cache ----------
const agentCache = new Map();
async function hydrateAgent(userId){
  if (!userId) return null;
  if (agentCache.has(userId)) return agentCache.get(userId);
  try{
    const u = await api(`/users/${userId}`);
    const out = { name: u.displayName || u.fullName || u.username || `User ${userId}`, avatar: u.avatarUrl || null };
    agentCache.set(userId,out);
    return out;
  }catch{ return { name:`User ${userId}`, avatar:null }; }
}

// ---------- Fetching (backfill + polling) ----------
let cursorISO = new Date().toISOString();
const processedIds = new Set();

function extractRows(res){
  if (config.container==="data" && Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res)) return res;
  return [];
}
function buildQuery(sinceISO,page=1,pageSize=100){
  const q={}; q[config.timeParam]=sinceISO; q[config.outcomeParam]=config.successValue; q.page=page; q.pageSize=pageSize; return q;
}
async function fetchPage(sinceISO,page=1){
  const res = await api(config.endpoint, buildQuery(sinceISO,page,100));
  const rows = extractRows(res);
  const hasNext = !!res?.nextPage;
  const nextPage = res?.nextPage || page+1;
  return { rows, hasNext, nextPage };
}
async function processRow(d){
  const rf = d.resultFields || d.results || {};
  const commission = Number(rf?.[config.resultFields.commissionKey] ?? 0);
  const deals = Number(rf?.[config.resultFields.dealsKey] ?? 1);
  const t = getTimeISO(d, config.timeFields) || new Date().toISOString();
  const userId = d[config.userIdField] || null;
  const agent = await hydrateAgent(userId);
  const brand = brandFromRow(d);

  upsertScore({ brand, agentId:userId, agentName: agent?.name || d.userDisplayName || d.userName || "Okänd", avatar: agent?.avatar || null, deals, commission, at: t });

  io.emit("success_event", {
    type:"success", brand,
    agentId:userId, agentName: agent?.name || d.userDisplayName || d.userName || "Okänd",
    avatar: agent?.avatar || null, commission, deals, at: t,
    id: d[config.idField] || `${d.leadId || ""}-${t}`
  });
}
async function backfillSince(sinceISO){
  try{
    let page=1, loop=true;
    while(loop){
      const {rows,hasNext,nextPage} = await fetchPage(sinceISO,page);
      for (const d of rows){
        const id = d[config.idField] || `${d.leadId||""}-${getTimeISO(d,config.timeFields)}`;
        if (processedIds.has(id)) continue;
        processedIds.add(id);
        await processRow(d);
      }
      if (hasNext) page=nextPage; else loop=false;
    }
  }catch(e){ console.error("backfillSince error:", e.message); }
}
async function pollTick(){
  try{
    const since = cursorISO;
    const { rows } = await fetchPage(since,1);
    let maxTime = since;
    for (const d of rows){
      const id = d[config.idField] || `${d.leadId||""}-${getTimeISO(d,config.timeFields)}`;
      if (processedIds.has(id)) continue;
      processedIds.add(id);
      await processRow(d);
      const t = getTimeISO(d,config.timeFields) || since;
      if (t > maxTime) maxTime = t;
    }
    cursorISO = maxTime;
  }catch(e){ console.error("pollTick error:", e.message); }
}

// ---------- ADMIN ----------
app.get("/admin", async (req,res)=>{
  await fetchUserGroups(); // ladda grupp-listan varje gång
  const mkList = (brand) => allGroups.map(g=>{
    const checked = mapByLeaderboard[brand].includes(String(g.id)) ? "checked" : "";
    return `<label style="display:flex;gap:8px;align-items:center;margin:4px 0;">
              <input type="checkbox" name="${brand}" value="${g.id}" ${checked}/> ${g.name}
            </label>`;
  }).join("");

  const html = `
  <!doctype html><meta charset="utf-8"/>
  <title>Sweet TV – Admin</title>
  <style>
    body{font-family: system-ui, sans-serif; background:#0b1220; color:#fff; margin:0; padding:20px}
    .wrap{max-width:1100px; margin:auto}
    .grid{display:grid; grid-template-columns: 1fr 1fr; gap:24px}
    .card{background:#111a2b; border:1px solid #24324d; padding:16px; border-radius:12px; margin:14px 0}
    h1{margin:0 0 12px}
    button{background:#3b82f6; border:none; padding:10px 16px; border-radius:10px; color:#fff; font-weight:700; cursor:pointer}
    code{background:#0e1729; padding:2px 6px; border-radius:6px}
    .list{max-height:360px; overflow:auto; border:1px solid #24324d; padding:10px; border-radius:10px; background:#0e1729}
    .hint{opacity:.8;font-size:12px}
  </style>
  <div class="wrap">
    <h1>Admin</h1>

    <div class="card">
      <h3 style="margin-top:0">1) Autodetektera Adversus-API</h3>
      <form method="POST" action="/admin/probe"><button>Testa & spara</button></form>
      <div class="hint" style="margin-top:8px">
        endpoint: <code>${config.endpoint || "-"}</code> |
        timeParam: <code>${config.timeParam}</code> |
        outcome: <code>${config.outcomeParam}=${config.successValue}</code> |
        idField: <code>${config.idField}</code> |
        userIdField: <code>${config.userIdField}</code> |
        campaignField: <code>${config.campaignField}</code> |
        userGroupField: <code>${config.userGroupField}</code> |
        resultFields: <code>${config.resultFields.dealsKey}</code>/<code>${config.resultFields.commissionKey}</code>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-top:0">2) Koppla user groups → leaderboard</h3>
      <form method="POST" action="/admin/mapping">
        <div class="grid">
          <div>
            <h4>Dentle (Idag + Månad)</h4>
            <div class="list">${mkList("dentle") || "<div class='hint'>Inga grupper hittade</div>"}</div>
          </div>
          <div>
            <h4>Sinfrid (Idag + Månad)</h4>
            <div class="list">${mkList("sinfrid") || "<div class='hint'>Inga grupper hittade</div>"}</div>
          </div>
        </div>
        <div style="margin-top:12px"><button>Spara</button></div>
      </form>
    </div>

    <div class="card">
      <h3 style="margin-top:0">3) Snabbtest</h3>
      <div class="hint">TV: <code>/tv.html</code></div>
      <div class="hint">Mock-pling: <code>/dev/mock-success?brand=sinfrid&agentName=Anna&commission=1200&deals=1&avatar=https://i.pravatar.cc/160</code></div>
    </div>
  </div>`;
  res.setHeader("content-type","text/html; charset=utf-8");
  res.end(html);
});

app.post("/admin/mapping", (req,res)=>{
  const norm = v => !v ? [] : (Array.isArray(v) ? v : [v]).map(x=>String(x));
  mapByLeaderboard.dentle = norm(req.body.dentle);
  mapByLeaderboard.sinfrid = norm(req.body.sinfrid);
  res.redirect("/admin");
});

app.post("/admin/probe", async (req,res)=>{
  try{
    const pr = await probeAdversus();
    if (!pr.ok) throw new Error(pr.error || "probe misslyckades");
    await backfillSince(startOfMonth().toISOString()); // fyll månaden
    cursorISO = new Date().toISOString();             // börja poll från nu
    res.redirect("/admin");
  }catch(e){
    res.status(500).send(`Probe-fel: ${e.message}`);
  }
});

// ---------- Mock (kvar för test) ----------
function emitAndScore({ brand="dentle", agentName="Test Agent", commission=250, deals=1, avatar=null }){
  const ev = { type:"success", brand, agentId:null, agentName, avatar, commission:Number(commission)||0, deals:Number(deals)||1, at:new Date().toISOString(), id:"mock-"+Date.now() };
  upsertScore({ brand:ev.brand, agentId:ev.agentId, agentName:ev.agentName, avatar:ev.avatar, deals:ev.deals, commission:ev.commission, at:ev.at });
  io.emit("success_event", ev);
  return ev;
}
app.post("/dev/mock-success",(req,res)=>res.json({ok:true, sent:emitAndScore(req.body||{})}));
app.get("/dev/mock-success",(req,res)=>res.json({ok:true, sent:emitAndScore(req.query||{})}));

// ---------- Poll loop ----------
setInterval(()=> pollTick().catch(()=>{}), Number(process.env.POLL_MS || 8000));

io.on("connection", s => console.log("TV connected:", s.id));
server.listen(PORT, ()=> console.log("Server listening on http://localhost:"+PORT));
