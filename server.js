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

// ---------- tids-hjälp ----------
function startOfMonth(){ const d=new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; }
function startOfToday(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
function getFirst(obj, keys){ for (const k of keys) if (k in (obj||{})) return obj[k]; return null; }
function getTimeISO(obj, keys){ const v=getFirst(obj,keys); return v?new Date(v).toISOString():null; }

// ---------- API helper ----------
async function api(path, qs = {}) {
  if (!ADV_BASE || !AUTH) throw new Error("Saknar ADV_BASE/ADV_USER/ADV_PASS");
  const url = new URL(path, ADV_BASE);
  for (const [k,v] of Object.entries(qs)) if (v!==undefined && v!==null) url.searchParams.set(k, v);
  const r = await fetch(url, { headers: { Authorization: AUTH } });
  if (!r.ok) throw new Error(`API ${url} -> ${r.status}: ${await r.text()}`);
  const txt = await r.text();
  try { return JSON.parse(txt); } catch { return txt; }
}

// ---------- admin: user groups ----------
let allGroups = [];             // [{id,name}, ...] från /groups
let groupMap = { dentle: [], sinfrid: [] }; // sparade val (groupIds)

// Hämta grupper från Adversus
async function fetchUserGroups(){
  try{
    const res = await api("/groups", {}); // <— om din tenant har annan path: ändra här.
    // Stöd både {data:[...]} och ren array
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

// ---------- autodetektera success-endpoint ----------
let config = {
  endpoint: null,
  timeParam: "updatedSince",
  outcomeParam: "outcome",
  successValue: "Success",
  idField: "id",
  userIdField: "userId",
  campaignField: "campaignName",
  userGroupField: "userGroupName", // kan vara "userGroups"
  timeFields: ["updatedAt","savedAt","createdAt"],
  resultFields: { commissionKey: "Commission", dealsKey: "MultiDeals" },
  container: "data"
};

const CANDS_ENDPOINT = ["/dispositions","/calls","/activities"];
const CANDS_TIME = ["updatedSince","from"];
const CANDS_OUTCOME = [{key:"outcome",value:"Success"},{key:"status",value:"Success"}];

function inferFields(row){
  const userIdField = ["userId","agentId","ownerId"].find(k=>k in row) || "userId";
  const campaignField = ["campaignName","campaign","campaignTitle"].find(k=>k in row)||"campaignName";
  const userGroupField = ["userGroupName","userGroups","groupName","groups"].find(k=>k in row) || "userGroupName";
  const idField = ["id","callId","activityId","dispositionId","leadId"].find(k=>k in row) || "id";
  const timeFields = ["updatedAt","savedAt","createdAt"].filter(k=>k in row);
  const rf = row.resultFields || row.results || {};
  const commissionKey = ["Commission","commission","prov"].find(k=>k in (rf||{})) || "Commission";
  const dealsKey = ["MultiDeals","multiDeals","deals","orders","count"].find(k=>k in (rf||{})) || "MultiDeals";
  return { userIdField, campaignField, userGroupField, idField, timeFields: timeFields.length?timeFields:["updatedAt","savedAt","createdAt"], resultFields:{commissionKey,dealsKey} };
}
function getContainer(res){ if(Array.isArray(res)) return {arr:res,container:null}; if(res && Array.isArray(res.data)) return {arr:res.data,container:"data"}; return {arr:[],container:null}; }

async function tryProbe(endpoint, timeParam, outcomePair, sinceISO){
  const q = {}; q[timeParam]=sinceISO; q[outcomePair.key]=outcomePair.value; q.page=1; q.pageSize=5;
  const res = await api(endpoint,q);
  const {arr,container} = getContainer(res);
  const fields = arr.length? inferFields(arr[0]) : null;
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
          if (pr.fields){
            Object.assign(config, pr.fields);
          }
          return { ok:true, config };
        }catch(e){ /* prova nästa */ }
      }
    }
  }
  return { ok:false, error:"Hittade ingen fungerande kombination." };
}

// ---------- brand-avgörande ----------
function brandFromGroups(row){
  // radialt stöd: id-lista eller namnlista
  const byName = (list, names)=> list.some(id=>{
    const grp = allGroups.find(g=>String(g.id)===String(id));
    return grp ? names.some(n => grp.name.toLowerCase().includes(String(n).toLowerCase())) : false;
  });

  // plocka ev. group ids/names från raden:
  let rowGroupNames = [];
  let rowGroupIds = [];
  const ugField = config.userGroupField;
  const val = row?.[ugField];
  if (Array.isArray(val)) {
    // kan vara array av namn eller id
    for (const x of val){
      if (typeof x === "string") rowGroupNames.push(x.toLowerCase());
      else if (x && typeof x === "object"){
        if (x.id) rowGroupIds.push(String(x.id));
        if (x.name) rowGroupNames.push(String(x.name).toLowerCase());
      }
    }
  } else if (typeof val === "string") {
    rowGroupNames.push(val.toLowerCase());
  }

  // matcha mot admin-valda grupper (groupMap innehåller IDs)
  const hasDentle = rowGroupIds.some(id => groupMap.dentle.includes(String(id))) ||
                    rowGroupNames.some(nm => allGroups.some(g => groupMap.dentle.includes(String(g.id)) && g.name.toLowerCase()===nm));

  const hasSinfrid = rowGroupIds.some(id => groupMap.sinfrid.includes(String(id))) ||
                     rowGroupNames.some(nm => allGroups.some(g => groupMap.sinfrid.includes(String(g.id)) && g.name.toLowerCase()===nm));

  if (hasDentle && !hasSinfrid) return "dentle";
  if (hasSinfrid && !hasDentle) return "sinfrid";

  // fallback kampanj
  const camp = String(row?.[config.campaignField] || "").toLowerCase();
  if (camp.includes("sinfrid")) return "sinfrid";
  if (camp.includes("dentle"))  return "dentle";

  return "dentle";
}

// ---------- leaderboard in-memory ----------
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

// ---------- agent-cache ----------
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

// ---------- datainsamling ----------
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
  const userId = d[config.userIdField] || null;
  const agent = await hydrateAgent(userId);
  const rf = d.resultFields || d.results || {};
  const commission = Number(rf?.[config.resultFields.commissionKey] ?? 0);
  const deals = Number(rf?.[config.resultFields.dealsKey] ?? 1);
  const t = getTimeISO(d, config.timeFields) || new Date().toISOString();
  const brand = brandFromGroups(d);

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

// ---------- ADMIN UI ----------
app.get("/admin", async (req,res)=>{
  await fetchUserGroups(); // hämta senaste listan varje gång sidan öppnas
  const optsDentle = allGroups.map(g=>{
    const checked = groupMap.dentle.includes(String(g.id)) ? "checked" : "";
    return `<label style="display:flex;gap:8px;align-items:center;"><input type="checkbox" name="dentle" value="${g.id}" ${checked}/> ${g.name}</label>`;
  }).join("");
  const optsSinfrid = allGroups.map(g=>{
    const checked = groupMap.sinfrid.includes(String(g.id)) ? "checked" : "";
    return `<label style="display:flex;gap:8px;align-items:center;"><input type="checkbox" name="sinfrid" value="${g.id}" ${checked}/> ${g.name}</label>`;
  }).join("");

  const html = `
  <!doctype html><meta charset="utf-8"/>
  <title>Sweet TV – Admin</title>
  <style>
    body{font-family: system-ui, sans-serif; background:#0b1220; color:#fff; margin:0; padding:20px}
    .wrap{max-width:1000px; margin:auto}
    h1{margin:0 0 12px}
    .grid{display:grid; grid-template-columns: 1fr 1fr; gap:24px}
    .card{background:#111a2b; border:1px solid #24324d; padding:16px; border-radius:12px; margin:14px 0}
    button{background:#3b82f6; border:none; padding:10px 16px; border-radius:10px; color:#fff; font-weight:700; cursor:pointer}
    code{background:#0e1729; padding:2px 6px; border-radius:6px}
    .hint{opacity:.8;font-size:12px}
    form .list{max-height:360px; overflow:auto; border:1px solid #24324d; padding:10px; border-radius:10px; background:#0e1729}
  </style>
  <div class="wrap">
    <h1>Admin</h1>

    <div class="card">
      <h3 style="margin-top:0">1) Autodetektera Adversus-API</h3>
      <form method="POST" action="/admin/probe">
        <button>Testa & spara</button>
      </form>
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
      <h3 style="margin-top:0">2) Koppla user groups → brand</h3>
      <form method="POST" action="/admin/mapping">
        <div class="grid">
          <div>
            <h4>Dentle</h4>
            <div class="list">${optsDentle || "<div class='hint'>Inga grupper hittade. Har API:t rätt behörighet?</div>"}</div>
          </div>
          <div>
            <h4>Sinfrid</h4>
            <div class="list">${optsSinfrid || "<div class='hint'>Inga grupper hittade. Har API:t rätt behörighet?</div>"}</div>
          </div>
        </div>
        <div style="margin-top:12px"><button>Spara</button></div>
      </form>
    </div>

    <div class="card">
      <h3 style="margin-top:0">3) Snabbtest</h3>
      <div class="hint">TV: <code>/tv.html</code></div>
      <div class="hint">Pling: <code>/dev/mock-success?brand=sinfrid&agentName=Anna&commission=1200&deals=1&avatar=https://i.pravatar.cc/160</code></div>
    </div>
  </div>`;
  res.setHeader("content-type","text/html; charset=utf-8");
  res.end(html);
});

app.post("/admin/mapping", (req,res)=>{
  // req.body.{dentle|sinfrid} kan vara string eller array av strings
  const norm = v => !v ? [] : (Array.isArray(v) ? v : [v]).map(x=>String(x));
  groupMap.dentle = norm(req.body.dentle);
  groupMap.sinfrid = norm(req.body.sinfrid);
  res.redirect("/admin");
});

app.post("/admin/probe", async (req,res)=>{
  try{
    const pr = await probeAdversus();
    if (!pr.ok) throw new Error(pr.error || "probe misslyckades");
    // första laddning: backfill månad → sätt cursor till nu → börja poll
    await backfillSince(startOfMonth().toISOString());
    cursorISO = new Date().toISOString();
    res.redirect("/admin");
  }catch(e){
    res.status(500).send(`Probe-fel: ${e.message}`);
  }
});

// ---------- mock (lämnas kvar) ----------
function emitAndScore({ brand="dentle", agentName="Test Agent", commission=250, deals=1, avatar=null }){
  const ev = { type:"success", brand, agentId:null, agentName, avatar, commission:Number(commission)||0, deals:Number(deals)||1, at:new Date().toISOString(), id:"mock-"+Date.now() };
  upsertScore({ brand:ev.brand, agentId:ev.agentId, agentName:ev.agentName, avatar:ev.avatar, deals:ev.deals, commission:ev.commission, at:ev.at });
  io.emit("success_event", ev);
  return ev;
}
app.post("/dev/mock-success",(req,res)=>res.json({ok:true, sent:emitAndScore(req.body||{})}));
app.get("/dev/mock-success",(req,res)=>res.json({ok:true, sent:emitAndScore(req.query||{})}));

// ---------- poller ----------
setInterval(()=> pollTick().catch(()=>{}), Number(process.env.POLL_MS || 8000));

io.on("connection", s => console.log("TV connected:", s.id));
server.listen(PORT, ()=> console.log("Server listening on http://localhost:"+PORT));
