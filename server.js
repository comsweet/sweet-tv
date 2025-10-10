import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fetch from 'node-fetch';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const ADV_BASE = process.env.ADV_BASE;
const ADV_USER = process.env.ADV_USER;
const ADV_PASS = process.env.ADV_PASS;
const AUTH = "Basic " + Buffer.from(`${ADV_USER}:${ADV_PASS}`).toString("base64");

// Simple in-memory state
const processedIds = new Set();
const agentCache = new Map();
let cursor = { dentle: new Date(0).toISOString(), sinfrid: new Date(0).toISOString() };

app.use(express.json());
app.use(express.static("public"));

// --- Helpers ---
function isDentleCampaign(name=""){ return /dentle/i.test(name); }
function isSinfridCampaign(name=""){ return /sinfrid/i.test(name); }

async function api(path, qs={}){
  const url = new URL(path, ADV_BASE);
  Object.entries(qs).forEach(([k,v])=> url.searchParams.set(k, v));
  const r = await fetch(url, { headers: { Authorization: AUTH }});
  if (!r.ok){
    const t = await r.text();
    throw new Error(`API ${url} -> ${r.status}: ${t}`);
  }
  return r.json();
}

async function hydrateAgent(userId){
  if (!userId) return null;
  if (agentCache.has(userId)) return agentCache.get(userId);
  try {
    const u = await api(`/users/${userId}`);
    const out = { name: u.displayName || u.fullName || u.username || `User ${userId}`, avatar: u.avatarUrl || null };
    agentCache.set(userId, out);
    return out;
  } catch (e){
    console.warn("hydrateAgent error:", e.message);
    return { name: `User ${userId}`, avatar: null };
  }
}

async function resolveAgentFast(item){
  if (item.userId) return item.userId;
  // Optional: try lookups around savedAt if your API exposes a calls/dispositions look-up by lead/time window.
  return null;
}

function buildEvent(brand, agent, d){
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

async function fetchNewSuccess(brand){
  const since = cursor[brand];
  let page = 1;
  let newest = since;

  // NOTE: Replace endpoint/params below with your actual Swagger paths.
  while (true){
    let res;
    try {
      res = await api("/dispositions", { outcome: "Success", updatedSince: since, page, pageSize: 100 });
    } catch (e){
      console.warn("fetchNewSuccess API error:", e.message);
      break;
    }

    const rows = res.data || [];
    for (const d of rows){
      const camp = (d.campaignName || "");
      if (brand === "dentle" && !isDentleCampaign(camp)) continue;
      if (brand === "sinfrid" && !isSinfridCampaign(camp)) continue;
      if (processedIds.has(d.id)) continue;

      // mark processed early to avoid duplicates on errors
      processedIds.add(d.id);

      let userId = d.userId || await resolveAgentFast(d);
      const agent = await hydrateAgent(userId);

      const ev = buildEvent(brand, agent, d);
      io.emit("success_event", ev);

      // bump cursor
      const cand = d.updatedAt || d.savedAt || new Date().toISOString();
      if (cand > newest) newest = cand;
    }

    if (!res.nextPage) break;
    page++;
  }
  cursor[brand] = newest;
}

// Pollers
const dentleMs = Number(process.env.POLL_MS_DENTLE || 5000);
const sinfridMs = Number(process.env.POLL_MS_SINFRID || 5000);

setInterval(() => fetchNewSuccess("dentle").catch(console.error), dentleMs);
setInterval(() => fetchNewSuccess("sinfrid").catch(console.error), sinfridMs);

// Simple dev/mock endpoint to test TV pling without Adversus
app.post("/dev/mock-success", (req, res) => {
  const { brand="dentle", agentName="Test Agent", commission=0, deals=1 } = req.body || {};
  const ev = {
    type: "success",
    brand, agentId: null, agentName, avatar:null,
    commission, deals, at: new Date().toISOString(), id: "mock-"+Date.now()
  };
  io.emit("success_event", ev);
  res.json({ ok:true, sent: ev });
});

// health
app.get("/healthz", (_,res)=> res.json({ ok:true }));

server.listen(PORT, () => {
  console.log("Server listening on http://localhost:"+PORT);
});
