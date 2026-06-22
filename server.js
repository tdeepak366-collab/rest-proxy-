// ProChain Railway Proxy Server
// v546 -- Complete rebuild: all Angel One + margincalculator + NSE FII-DII routes
//
// Routes handled:
//   POST /angel/login          -> Angel One loginByPassword
//   POST /angel/refresh        -> Angel One generateTokens
//   POST /angel/logout         -> Angel One logout
//   POST /angel/quote          -> Angel One getMarketData
//   POST /angel/optionchain    -> Angel One getOptionChainDetails
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
//   GET  /fii-dii              -> NSE participant OI (FII/DII data)
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
// APK mein margincalculator.angelbroking.com direct CORS-block hota hai
// Proxy forward karega -- ~8MB JSON, no auth needed
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
// NSE ke participant stats -- CORS blocked in browser/APK
// URL: https://www.nseindia.com/api/equity-stockIndices?index=SECURITIES%20IN%20F%26O
// Alternatively participant stats:
// https://www.nseindia.com/api/participant-oi-derivatives
app.get("/fii-dii", async (req, res) => {
  if (!checkAuth(req, res)) return;
  try {
    const NSE_URL = "https://www.nseindia.com/api/participant-oi-derivatives";
    const upstream = await fetch(NSE_URL, {
      headers: {
        "Accept":          "application/json",
        "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer":         "https://www.nseindia.com/",
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeout: 10000,
    });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ status: false, message: `NSE HTTP ${upstream.status}` });
    }
    const data = await upstream.json();
    res.json({ status: true, data: data?.participantStatsData || data?.data || data });
  } catch (err) {
    console.error("[fii-dii]", err.message);
    res.status(502).json({ status: false, message: `FII-DII fetch error: ${err.message}` });
  }
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
