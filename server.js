// server.js
// Minimal Node/Express backend som:
// - Proxar Adversus /v1/* (så din frontend aldrig läcker credentials)
// - Bygger ett "leaderboard" från leads med status=success
// - Serverar statiska filer (index.html, admin.html)

import express from "express";
import fetch from "node-fetch";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const __dirname = path.resolve();

// ---- Konfig ----
const ADVERSUS_API = "https://api.adversus.dk/v1";
const PORT = process.env.PORT || 3000;

// Miljövariabler (måste vara satta i Render)
const AV_USER = process.env.ADVERSUS_USER; // ditt API-username
const AV_PASS = process.env.ADVERSUS_PASS; // ditt API-password

if (!AV_USER || !AV_PASS) {
  console.warn(
    "[WARN] Saknar ADVERSUS_USER/ADVERSUS_PASS. Sätt dessa i Render → Environment."
  );
}

const AUTH_HEADER = {
  Authorization: `Basic ${Buffer.from(`${AV_USER}:${AV_PASS}`).toString(
    "base64"
  )}`,
};

// ---- Hjälpare ----

// Vänta
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Hämta alla users (för att mappa email → namn och grupp)
async function fetchUsers() {
  const url = `${ADVERSUS_API}/users?pageSize=1000&includeMeta=true`;
  const r = await fetch(url, { headers: AUTH_HEADER });
  if (!r.ok) throw new Error(`users ${r.status}`);
  const data = await r.json();

  const users = Array.isArray(data) ? data : data.users || [];
  // gör en lookup: email -> {name, group}
  const byEmail = {};
  users.forEach((u) => {
    const groupName =
      (u.group && u.group.name) ||
      (u.teams && u.teams.length ? u.teams[0] : null) ||
      "";
    byEmail[(u.email || "").toLowerCase()] = {
      name: u.displayName || u.name || "",
      group: groupName || "",
    };
  });

  return { list: users, byEmail };
}

// Hämta leads med status=success under perioden, paginerat.
// Vi undviker $gte/$lte (stöd saknas) → filtrerar datums i Node istället.
async function fetchSuccessLeadsWithin({
  fromDate, // Date
  toDate, // Date
  pageSize = 1000,
  maxPages = 20, // skydd mot överdrift
}) {
  const baseFilters = JSON.stringify({ status: "success" });
  let page = 1;
  const all = [];

  for (; page <= maxPages; page++) {
    const url = `${ADVERSUS_API}/leads?filters=${encodeURIComponent(
      baseFilters
    )}&page=${page}&pageSize=${pageSize}&sortProperty=lastUpdatedTime&sortDirection=DESC`;
    const r = await fetch(url, { headers: AUTH_HEADER });

    // Rate-limit fallback
    if (r.status === 429) {
      await sleep(1200);
      page--;
      continue;
    }

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`leads ${r.status}: ${txt || r.statusText}`);
    }

    const data = await r.json();
    const leads = Array.isArray(data) ? data : data.leads || [];

    // stop villkor om tom sida
    if (!leads.length) break;

    // filtrera datum i local kod
    const inRange = leads.filter((lead) => {
      // välj "Order date" om den finns, annars lastUpdatedTime
      const order = (lead.resultData || []).find(
        (f) =>
          f.label === "Order date" ||
          f.Label === "Order date" ||
          f.name === "Order date"
      );
      const ts = order?.value || lead.lastUpdatedTime;
      if (!ts) return false;
      const t = new Date(ts);
      return t >= fromDate && t <= toDate;
    });

    all.push(...inRange);

    // Om den sista leaden på sidan är äldre än fromDate → vi kan sluta
    const last = leads[leads.length - 1];
    const lastTs = new Date(last.lastUpdatedTime || 0);
    if (lastTs < fromDate) break;

    // Liten paus mellan sidor (snäll mot API)
    await sleep(150);
  }

  return all;
}

// Summera på agent (lastContactedBy). Slå upp "Commission" ur resultData.
function buildLeaderboard(leads, usersLookup, metric = "deals") {
  const grouped = new Map();

  leads.forEach((lead) => {
    const email = (lead.lastContactedBy || "").toLowerCase();
    const who = usersLookup[email] || {
      name: lead.lastContactedBy || "Okänd",
      group: "",
    };

    const commissionField = (lead.resultData || []).find(
      (f) =>
        f.label === "Commission" ||
        f.Label === "Commission" ||
        f.name === "Commission"
    );
    const commission = parseFloat(commissionField?.value || 0) || 0;

    const key = `${who.name}__${who.group}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        user: who.name,
        group: who.group,
        deals: 0,
        commission: 0,
      });
    }
    const row = grouped.get(key);
    row.deals += 1;
    row.commission += commission;
  });

  const arr = Array.from(grouped.values()).sort((a, b) => {
    if (metric === "commission") return b.commission - a.commission;
    return b.deals - a.deals;
  });

  return arr;
}

// Senaste X affärer (för admin “senaste affärer”)
function buildLatest(leads, usersLookup, limit = 15) {
  const items = leads
    .map((lead) => {
      const email = (lead.lastContactedBy || "").toLowerCase();
      const who = usersLookup[email] || {
        name: lead.lastContactedBy || "Okänd",
        group: "",
      };
      const orderDate =
        (lead.resultData || []).find(
          (f) =>
            f.label === "Order date" ||
            f.Label === "Order date" ||
            f.name === "Order date"
        )?.value || lead.lastUpdatedTime;

      const commission =
        (lead.resultData || []).find(
          (f) =>
            f.label === "Commission" ||
            f.Label === "Commission" ||
            f.name === "Commission"
        )?.value || 0;

      return {
        time: orderDate,
        user: who.name,
        group: who.group,
        commission: Number(commission) || 0,
      };
    })
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, limit);

  return items;
}

// ---- API-routes ----

// Hälsa
app.get("/api/health", (_, res) => res.json({ ok: true }));

// Proxy för Adversus: /api/v1/*
app.get("/api/v1/:endpoint*", async (req, res) => {
  try {
    const target = `${ADVERSUS_API}/${req.params.endpoint}${
      req.params[0] || ""
    }${req._parsedUrl.search || ""}`;

    const r = await fetch(target, { headers: AUTH_HEADER });
    const text = await r.text();
    res.status(r.status).send(text);
  } catch (err) {
    res.status(500).json({ error: "proxy_failed", details: err.message });
  }
});

// Leaderboard API (period=today|month, metric=deals|commission, size=1..100)
app.get("/api/leaderboard", async (req, res) => {
  try {
    const period = (req.query.period || "month").toLowerCase();
    const metric = (req.query.metric || "deals").toLowerCase();
    const size = Math.max(1, Math.min(100, parseInt(req.query.size || "10", 10)));

    const now = new Date();
    const start =
      period === "today"
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
        : new Date(now.getFullYear(), now.getMonth(), 1);
    const end =
      period === "today"
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
        : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // 1) users (lookup)
    const users = await fetchUsers();

    // 2) leads (success), filtrera lokalt på datum
    const leads = await fetchSuccessLeadsWithin({
      fromDate: start,
      toDate: end,
      pageSize: 1000,
      maxPages: 20,
    });

    // 3) bygga svar
    const leaderboard = buildLeaderboard(leads, users.byEmail, metric).slice(
      0,
      size
    );
    const latest = buildLatest(leads, users.byEmail, 15);

    res.json({
      ok: true,
      period,
      metric,
      size,
      totals: {
        deals: leads.length,
        commission: leads
          .map(
            (l) =>
              parseFloat(
                (l.resultData || []).find(
                  (f) =>
                    f.label === "Commission" ||
                    f.Label === "Commission" ||
                    f.name === "Commission"
                )?.value || 0
              ) || 0
          )
          .reduce((a, b) => a + b, 0),
        uniqueAgents: new Set(
          leads.map((x) => (x.lastContactedBy || "").toLowerCase())
        ).size,
      },
      leaderboard,
      latest,
    });
  } catch (err) {
    console.error("Leaderboard error:", err);
    res
      .status(500)
      .json({ error: "leaderboard_failed", details: err.message || String(err) });
  }
});

// Statiska filer (index.html & admin.html)
app.use(express.static(__dirname));
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/admin.html", (_, res) =>
  res.sendFile(path.join(__dirname, "admin.html"))
);

app.listen(PORT, () =>
  console.log(`✅ Server up on http://localhost:${PORT}`)
);
