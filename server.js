// ProChain Railway Proxy Server
// v548 -- /angel/optiongreek route added (mirrors /angel/optionchain)
// v549 -- /fii-dii rewritten: was hitting fake NSE JSON endpoint
//         (nseindia.com/api/participant-oi-derivatives, returns HTML 404),
//         now reads the real daily CSV from nsearchives.nseindia.com with
//         6-day lookback for weekends/holidays
//
// Routes handled:
//   POST /angel/login          -> Angel One loginByPassword
//   POST /angel/refresh        -> Angel One generateTokens
//   POST /angel/logout         -> Angel One logout
//   POST /angel/quote          -> Angel One getMarketData
//   POST /angel/optionchain    -> Angel One getOptionChainDetails
//   POST /angel/optiongreek    -> Angel One optionGreek (Delta/Gamma/Theta/Vega/IV)
//   POST /angel/expiry         -> Angel One getExpiryDate
//   POST /angel/order/place    -> Angel One placeOrder
//   POST /angel/order/modify   -> Angel One modifyOrder
//   POST /angel/order/cancel   -> Angel One cancelOrder
//   GET  /angel/order/book     -> Angel One getOrderBook
//   GET  /angel/order/status/:id -> Angel One getOrderStatus
//   GET  /angel/order/history/:id -> Angel One getOrderHistory
//   GET  /angel/position       -> Angel One getPosition
//   GET  /angel/holding        -> Angel One getAllHolding
//   GET  /angel/user/profile   -> Angel One getProfile
//   GET  /angel/user/getfunds  -> Angel One getRMS
//   GET  /angel/trade/book     -> Angel One getTradeBook
//   POST /angel/historical     -> Angel One getCandleData
//   POST /angel/search/scrip   -> Angel One searchScrip
//   POST /angel/margin         -> Angel One getMargin
//   POST /angel/gtt/create     -> Angel One GTT createRule
//   POST /angel/gtt/modify     -> Angel One GTT modifyRule
//   POST /angel/gtt/cancel     -> Angel One GTT cancelRule
//   POST /angel/gtt/list       -> Angel One GTT ruleList
//   GET  /angel/gtt/details/:id -> Angel One GTT ruleDetails
//   POST /angel/position/convert -> Angel One convertPosition
//   GET  /scrip-master         -> margincalculator.angelbroking.com OpenAPIScripMaster.json
//   GET  /fii-dii              -> NSE participant OI (FII/DII data) — daily CSV archive, 6-day lookback
//   GET  /health               -> proxy health check

const express  = require("express");
const fetch    = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
const app      = express();
const PORT     = process.env.PORT || 3000;

// ─── Proxy secret (optional auth) ──────────────────────────────────────────
const PROXY_SECRET = process.env.PROXY_SECRET || "";

// ─── Angel One base URLs ────────────────────────────────────────────────────
const ANGEL_AUTH   = "https://apiconnect.angelone.in/rest/auth/angelbroking";
const ANGEL_SECURE = "https://apiconnect.angelone.in/rest/secure/angelbroking";

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers",
    "Content-Type,Authorization,X-PrivateKey,X-ClientLocalIP,X-ClientPublicIP," +
    "X-MACAddress,X-UserType,X-SourceID,Accept,X-Proxy-Secret");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ─── Optional proxy secret auth ─────────────────────────────────────────────
function checkAuth(req, res) {
  if (!PROXY_SECRET) return true; // no secret set -> open
  const supplied =
    req.headers["x-proxy-secret"] ||
    req.headers["authorization"]?.replace(/^Bearer\s+/i, "");
  if (supplied === PROXY_SECRET) return true;
  res.status(403).json({ status: false, message: "Forbidden: invalid proxy secret" });
  return false;
}

// ─── Generic proxy helper ───────────────────────────────────────────────────
async function proxy(req, res, targetUrl, method) {
  if (!checkAuth(req, res)) return;
  try {
    const headers = { "Content-Type": "application/json", "Accept": "application/json" };
    // Forward relevant Angel One headers
    const fwd = [
      "authorization", "x-privatekey", "x-clientlocalip", "x-clientpublicip",
      "x-macaddress", "x-usertype", "x-sourceid",
    ];
    fwd.forEach(h => { if (req.headers[h]) headers[h] = req.headers[h]; });

    const opts = { method: method || req.method, headers };
    if (["POST","PUT","PATCH"].includes(opts.method) && req.body) {
      opts.body = JSON.stringify(req.body);
    }

    const upstream = await fetch(targetUrl, opts);
    const text     = await upstream.text();

    // Forward status + content-type
    res.status(upstream.status);
    const ct = upstream.headers.get("content-type") || "";
    if (ct.includes("json")) {
      res.setHeader("Content-Type", "application/json");
    }
    res.send(text);
  } catch (err) {
    console.error(`[proxy] ${targetUrl} ->`, err.message);
    res.status(502).json({ status: false, message: `Proxy error: ${err.message}` });
  }
}

// ─── Health check ────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: true, message: "ProChain proxy alive", ts: new Date().toISOString() });
});

// ─── Angel One AUTH routes ───────────────────────────────────────────────────
app.post("/angel/login",   (req, res) => proxy(req, res, `${ANGEL_AUTH}/user/v1/loginByPassword`));
app.post("/angel/refresh", (req, res) => proxy(req, res, `${ANGEL_AUTH}/jwt/v1/generateTokens`));
app.post("/angel/logout",  (req, res) => proxy(req, res, `${ANGEL_SECURE}/user/v1/logout`));

// ─── Angel One MARKET DATA routes ────────────────────────────────────────────
app.post("/angel/quote",       (req, res) => proxy(req, res, `${ANGEL_SECURE}/marketData/v1/quote`));
app.post("/angel/optionchain", (req, res) => proxy(req, res, `${ANGEL_SECURE}/marketData/v1/optionChainDetails`));
app.post("/angel/optiongreek", (req, res) => proxy(req, res, `${ANGEL_SECURE}/marketData/v1/optionGreek`)); // v548
app.post("/angel/expiry",      (req, res) => proxy(req, res, `${ANGEL_SECURE}/marketData/v1/expiryDate`));

// ─── Angel One ORDER routes ───────────────────────────────────────────────────
app.post("/angel/order/place",   (req, res) => proxy(req, res, `${ANGEL_SECURE}/order/v1/placeOrder`));
app.post("/angel/order/modify",  (req, res) => proxy(req, res, `${ANGEL_SECURE}/order/v1/modifyOrder`));
app.post("/angel/order/cancel",  (req, res) => proxy(req, res, `${ANGEL_SECURE}/order/v1/cancelOrder`));
app.get( "/angel/order/book",    (req, res) => proxy(req, res, `${ANGEL_SECURE}/order/v1/getOrderBook`, "GET"));
app.get( "/angel/order/status/:id",  (req, res) => proxy(req, res, `${ANGEL_SECURE}/order/v1/getOrderStatus/${req.params.id}`,  "GET"));
app.get( "/angel/order/history/:id", (req, res) => proxy(req, res, `${ANGEL_SECURE}/order/v1/getOrderHistory/${req.params.id}`, "GET"));

// ─── Angel One PORTFOLIO routes ───────────────────────────────────────────────
app.get("/angel/position", (req, res) => proxy(req, res, `${ANGEL_SECURE}/order/v1/getPosition`,        "GET"));
app.get("/angel/holding",  (req, res) => proxy(req, res, `${ANGEL_SECURE}/portfolio/v1/getAllHolding`,   "GET"));

// ─── Angel One USER routes ────────────────────────────────────────────────────
app.get("/angel/user/profile",   (req, res) => proxy(req, res, `${ANGEL_SECURE}/user/v1/getProfile`, "GET"));
app.get("/angel/user/getfunds",  (req, res) => proxy(req, res, `${ANGEL_SECURE}/user/v1/getRMS`,     "GET"));
app.get("/angel/trade/book",     (req, res) => proxy(req, res, `${ANGEL_SECURE}/order/v1/getTradeBook`, "GET"));

// ─── Angel One OTHER routes ───────────────────────────────────────────────────
app.post("/angel/historical",        (req, res) => proxy(req, res, `${ANGEL_SECURE}/historical/v1/getCandleData`));
app.post("/angel/search/scrip",      (req, res) => proxy(req, res, `${ANGEL_SECURE}/order/v1/searchScrip`));
app.post("/angel/margin",            (req, res) => proxy(req, res, `${ANGEL_SECURE}/order/v1/getMargin`));
app.post("/angel/position/convert",  (req, res) => proxy(req, res, `${ANGEL_SECURE}/order/v1/convertPosition`));

// ─── Angel One GTT routes ─────────────────────────────────────────────────────
app.post("/angel/gtt/create",       (req, res) => proxy(req, res, `${ANGEL_SECURE}/gtt/v1/createRule`));
app.post("/angel/gtt/modify",       (req, res) => proxy(req, res, `${ANGEL_SECURE}/gtt/v1/modifyRule`));
app.post("/angel/gtt/cancel",       (req, res) => proxy(req, res, `${ANGEL_SECURE}/gtt/v1/cancelRule`));
app.post("/angel/gtt/list",         (req, res) => proxy(req, res, `${ANGEL_SECURE}/gtt/v1/ruleList`));
app.get( "/angel/gtt/details/:id",  (req, res) => proxy(req, res, `${ANGEL_SECURE}/gtt/v1/ruleDetails/${req.params.id}`, "GET"));

// ─── Scripmaster (margincalculator) ──────────────────────────────────────────
app.get("/scrip-master", async (req, res) => {
  if (!checkAuth(req, res)) return;
  try {
    const upstream = await fetch(
      "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json",
      { headers: { "Accept": "application/json" }, timeout: 30000 }
    );
    if (!upstream.ok) {
      return res.status(upstream.status).json({ status: false, message: `Upstream HTTP ${upstream.status}` });
    }
    const data = await upstream.json();
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=21600"); // 6h cache
    res.json(data);
  } catch (err) {
    console.error("[scrip-master]", err.message);
    res.status(502).json({ status: false, message: `scrip-master fetch error: ${err.message}` });
  }
});

// ─── NSE FII-DII participant OI ───────────────────────────────────────────────
// v549 FIX: /api/participant-oi-derivatives is NOT a real NSE JSON endpoint --
// NSE returns its HTML error/challenge page for it, which broke JSON.parse
// client-side ("Unexpected token '<'"). Participant-wise OI is published only
// as a daily CSV report under nsearchives.nseindia.com, named by date:
//   https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_DDMMYYYY.csv
// This route now fetches that CSV directly (no cookie dance needed -- archives
// host serves files publicly) and parses it into a clean JSON structure.
// Falls back to previous trading day(s) if today's file isn't published yet
// (weekends/holidays/before ~7-8 PM IST same-day publish time).
const nseCache = { data: null, ts: 0, forDate: null };
const NSE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const ARCHIVE_HEADERS = {
  "Accept":          "text/csv,text/plain,*/*",
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  "Referer":         "https://www.nseindia.com/",
  "Accept-Language": "en-US,en;q=0.9",
};

function ddmmyyyy(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

// Parses the NSE participant-OI CSV text into { asOf, rows: [...] }
// v550 FIX: also attach frontend-expected aliases (futBuyContracts, etc.)
// onto each row -- the ProChain UI's getVal() looks for these specific
// keys, which don't exist in NSE's raw CSV column names. Raw NSE names
// are kept too (used by the "Raw NSE data" toggle in the UI).
function parseParticipantOiCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  // line 0 = title row e.g. "Participant wise Open Interest ... as on May 11,2023"
  const titleMatch = lines[0].match(/as on\s+([A-Za-z]+\s+\d{1,2},\s*\d{4})/i);
  const asOf = titleMatch ? titleMatch[1] : null;

  const header = lines[1].split(",").map(h => h.trim());
  const rows = [];
  for (let i = 2; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = lines[i].split(",").map(c => c.trim());
    if (!cells[0]) continue;
    const row = { clientType: cells[0] };
    for (let c = 1; c < header.length; c++) {
      const key = header[c];
      if (!key) continue;
      const val = parseFloat(cells[c]);
      row[key] = isNaN(val) ? 0 : val;
    }

    // ── Frontend aliases (v550) ──────────────────────────────────────
    // NSE CSV gives futures/options as Index+Stock split; ProChain's UI
    // wants combined Index+Stock totals under these specific keys.
    const fIdxL = row["Future Index Long"]  || 0, fStkL = row["Future Stock Long"]  || 0;
    const fIdxS = row["Future Index Short"] || 0, fStkS = row["Future Stock Short"] || 0;
    const oIdxCL = row["Option Index Call Long"]  || 0, oStkCL = row["Option Stock Call Long"]  || 0;
    const oIdxPL = row["Option Index Put Long"]   || 0, oStkPL = row["Option Stock Put Long"]   || 0;
    const oIdxCS = row["Option Index Call Short"] || 0, oStkCS = row["Option Stock Call Short"] || 0;
    const oIdxPS = row["Option Index Put Short"]  || 0, oStkPS = row["Option Stock Put Short"]  || 0;

    row.futBuyContracts  = fIdxL + fStkL;
    row.futSellContracts = fIdxS + fStkS;
    row.optBuyContracts  = oIdxCL + oStkCL + oIdxPL + oStkPL;
    row.optSellContracts = oIdxCS + oStkCS + oIdxPS + oStkPS;

    // NSE's daily file is a snapshot, not a delta -- no day-over-day
    // change figure is available from this source, so OI-change fields
    // are intentionally left unset (UI shows "—" for these, same as
    // before for any category with no data, rather than a fake 0).
    row.totalOI = (row["Total Long Contracts"] || 0) + (row["Total Short Contracts"] || 0);

    rows.push(row);
  }
  return { asOf, rows };
}

app.get("/fii-dii", async (req, res) => {
  if (!checkAuth(req, res)) return;

  // Cache hit — return immediately
  if (nseCache.data && (Date.now() - nseCache.ts) < NSE_CACHE_TTL) {
    return res.json({ status: true, data: nseCache.data, asOf: nseCache.forDate, cached: true });
  }

  // Try today, then walk back up to 6 days to skip weekends/holidays
  // (file for a given trading day usually publishes same evening ~7-8PM IST)
  const MAX_LOOKBACK_DAYS = 6;
  let lastErr = null;

  for (let back = 0; back <= MAX_LOOKBACK_DAYS; back++) {
    const d = new Date();
    d.setDate(d.getDate() - back);
    const dateStr = ddmmyyyy(d);
    const url = `https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_${dateStr}.csv`;

    try {
      const csvRes = await fetch(url, { headers: ARCHIVE_HEADERS, timeout: 10000 });

      if (!csvRes.ok) {
        lastErr = `HTTP ${csvRes.status} for ${dateStr}`;
        continue; // try previous day
      }

      const text = await csvRes.text();
      // Sanity check — must look like CSV, not an HTML error page
      if (!text || /^\s*<(!doctype|html)/i.test(text)) {
        lastErr = `Non-CSV response for ${dateStr}`;
        continue;
      }

      const parsed = parseParticipantOiCsv(text);
      if (!parsed.rows.length) {
        lastErr = `Empty parsed data for ${dateStr}`;
        continue;
      }

      // Cache update
      nseCache.data    = parsed.rows;
      nseCache.ts      = Date.now();
      nseCache.forDate = parsed.asOf || dateStr;

      return res.json({ status: true, data: parsed.rows, asOf: nseCache.forDate });

    } catch (err) {
      lastErr = err.message;
      continue; // try previous day
    }
  }

  // All lookback attempts failed
  console.error("[fii-dii] all lookback attempts failed:", lastErr);
  res.status(502).json({
    status: false,
    message: `FII-DII fetch error after ${MAX_LOOKBACK_DAYS + 1}-day lookback: ${lastErr}`,
  });
});

// ─── Catch-all: unknown route ─────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    status: false,
    message: `ProChain proxy: route not found -- ${req.method} ${req.path}`,
  });
});

app.listen(PORT, () => {
  console.log(`[ProChain proxy] listening on port ${PORT}`);
});
