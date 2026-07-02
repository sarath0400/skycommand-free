// skycommand-free — the app engine (Express backend), mirroring skyCommand:
//  - boots, migrates its own database, THEN serves traffic
//  - serves a tiny dashboard of KPIs from Postgres
//  - runs a Python forecast (Node.js + Python, same two-language shape)
//  - asks Google Gemini for a one-line insight
//  - exposes /api/health and /api/health/migrations (same health-check idea)
import express from "express";
import pg from "pg";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "./migrate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;
const PORT = process.env.PORT || 5000;

let migrationStatus = { ran: false, reason: "not started" };

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : null;

const app = express();

// --- Health checks (same as skyCommand) ---
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/health/migrations", (_req, res) => res.json(migrationStatus));

// --- KPIs from the database ---
app.get("/api/kpis", async (_req, res) => {
  if (!pool) return res.json({ kpis: [], note: "no DATABASE_URL — showing empty" });
  try {
    const { rows } = await pool.query("SELECT name, value, unit, month FROM kpis ORDER BY id;");
    res.json({ kpis: rows });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// --- Forecast (calls the Python script — the "predict the future" part) ---
app.get("/api/forecast", (_req, res) => {
  const py = spawn("python", [path.join(__dirname, "forecast.py")]);
  let out = "";
  let err = "";
  py.stdout.on("data", (d) => (out += d));
  py.stderr.on("data", (d) => (err += d));
  py.on("close", (code) => {
    if (code !== 0) return res.status(500).json({ error: err || "python failed" });
    try {
      res.json(JSON.parse(out));
    } catch {
      res.status(500).json({ error: "bad forecast output", raw: out });
    }
  });
});

// --- Gemini insight (the AI, same service as skyCommand, free tier) ---
app.get("/api/insight", async (_req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.json({ insight: "(set GEMINI_API_KEY to enable AI insights)" });
  try {
    const prompt =
      "In one short sentence, give a healthcare operations manager an insight about a readmission rate of 8.4%.";
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "(no response)";
    res.json({ insight: text.trim() });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// --- The dashboard page ---
app.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>skyCommand (free)</title>
<style>
 body{font-family:system-ui,sans-serif;margin:40px;background:#0b1220;color:#e6edf7}
 h1{margin:0 0 4px} .sub{color:#8aa0c0;margin-bottom:24px}
 .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
 .card{background:#131c30;border:1px solid #223052;border-radius:12px;padding:18px}
 .card .n{font-size:13px;color:#8aa0c0} .card .v{font-size:28px;font-weight:700;margin-top:6px}
 .box{margin-top:24px;background:#131c30;border:1px solid #223052;border-radius:12px;padding:18px}
</style></head><body>
<h1>skyCommand — free edition</h1>
<div class="sub">A dashboard demo · Node.js + Python · Postgres · Gemini AI</div>
<div id="kpis" class="grid">loading…</div>
<div class="box"><b>Forecast:</b> <span id="fc">loading…</span></div>
<div class="box"><b>AI insight:</b> <span id="ai">loading…</span></div>
<script>
 fetch('/api/kpis').then(r=>r.json()).then(d=>{
   document.getElementById('kpis').innerHTML = (d.kpis||[]).map(k=>
     '<div class="card"><div class="n">'+k.name+'</div><div class="v">'+k.value+' <small>'+(k.unit||'')+'</small></div></div>'
   ).join('') || 'no data';
 });
 fetch('/api/forecast').then(r=>r.json()).then(d=>{
   document.getElementById('fc').textContent = d.message || JSON.stringify(d);
 }).catch(()=>document.getElementById('fc').textContent='(python not available)');
 fetch('/api/insight').then(r=>r.json()).then(d=>{
   document.getElementById('ai').textContent = d.insight || d.error;
 });
</script>
</body></html>`);
});

// --- Boot sequence: migrate FIRST, then listen (the skyCommand order) ---
async function boot() {
  try {
    migrationStatus = await runMigrations();
    console.log("[boot] migrations:", migrationStatus);
  } catch (e) {
    migrationStatus = { ran: false, reason: "migration error: " + String(e) };
    console.error("[boot] migration failed:", e);
  }
  app.listen(PORT, () => console.log(`[boot] skycommand-free listening on :${PORT}`));
}

boot();
