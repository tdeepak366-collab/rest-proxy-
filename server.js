// ProChain Railway Proxy Server
// Angel One SmartAPI ke liye CORS proxy
// Deploy on Railway: https://railway.app

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// Angel One base URLs
const ANGEL_BASE    = "https://apiconnect.angelone.in";
const ANGEL_FEED    = "https://smartapi.angelone.in";

app.use(cors({ origin: "*" }));
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", server: "ProChain Proxy", ts: Date.now() });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", ts: Date.now() });
});

// ─── Helper: forward headers ──────────────────────────────────
function angelHeaders(req) {
  const h = {
    "Content-Type":  "application/json",
    "Accept":        "application/json",
    "X-UserType":    "USER",
    "X-SourceID":    "WEB",
    "X-ClientLocalIP": "127.0.0.1",
    "X-ClientPublicIP": "127.0.0.1",
    "X-MACAddress":  "00:00:00:00:00:00",
  };
  if (req.headers["authorization"])  h["Authorization"]  = req.headers["authorization"];
  if (req.headers["x-api-key"])      h["X-API-KEY"]      = req.headers["x-api-key"];
  if (req.headers["x-api-key"])      h["X-PrivateKey"]   = req.headers["x-api-key"];
  return h;
}

// ─── Generic proxy handler ────────────────────────────────────
async function proxyTo(targetUrl, req, res) {
  try {
    const method  = req.method;
    const options = {
      method,
      headers: angelHeaders(req),
    };
    if (method !== "GET" && method !== "HEAD") {
      options.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, options);
    const contentType = response.headers.get("content-type") || "";

    // Always return JSON to client
    if (contentType.includes("application/json")) {
      const data = await response.json();
      return res.status(response.status).json(data);
    } else {
      // Angel returned HTML (token expired / gateway error)
      const text = await response.text();
      return res.status(response.status).json({
        status: false,
        message: "Angel returned non-JSON (token expired?)",
        raw: text.slice(0, 200),
      });
    }
  } catch (err) {
    return res.status(502).json({
      status: false,
      message: "Proxy fetch error",
      error: err.message,
    });
  }
}

// ─── Routes ───────────────────────────────────────────────────

// Login
app.post("/angel/login", (req, res) =>
  proxyTo(`${ANGEL_BASE}/rest/auth/angelbroking/user/v1/loginByPassword`, req, res)
);

// Token refresh (generateToken)
app.post("/angel/refresh", (req, res) =>
  proxyTo(`${ANGEL_BASE}/rest/auth/angelbroking/jwt/v1/generateTokens`, req, res)
);

// Profile
app.get("/angel/profile", (req, res) =>
  proxyTo(`${ANGEL_BASE}/rest/secure/angelbroking/user/v1/getProfile`, req, res)
);

// RMS / Funds
app.get("/angel/funds", (req, res) =>
  proxyTo(`${ANGEL_BASE}/rest/secure/angelbroking/user/v1/getRMS`, req, res)
);

// LTP quote
app.post("/angel/quote", (req, res) =>
  proxyTo(`${ANGEL_BASE}/rest/secure/angelbroking/market/v1/quote/`, req, res)
);

// Option chain
app.get("/angel/optionchain", (req, res) => {
  const { name, expirydate } = req.query;
  const url = `${ANGEL_BASE}/rest/secure/angelbroking/market/v1/getCandleData?name=${encodeURIComponent(name)}&expirydate=${encodeURIComponent(expirydate)}`;
  proxyTo(url, req, res);
});

// Expiry dates
app.get("/angel/expiry", (req, res) => {
  const { name } = req.query;
  const url = `${ANGEL_BASE}/rest/secure/angelbroking/market/v1/getExpiryDate?name=${encodeURIComponent(name)}`;
  proxyTo(url, req, res);
});

// Search scrip (scripmaster token lookup)
app.post("/angel/search", (req, res) =>
  proxyTo(`${ANGEL_BASE}/rest/secure/angelbroking/order/v1/searchScrip`, req, res)
);

// Place order
app.post("/angel/order", (req, res) =>
  proxyTo(`${ANGEL_BASE}/rest/secure/angelbroking/order/v2/placeOrder`, req, res)
);

// Order book
app.get("/angel/orders", (req, res) =>
  proxyTo(`${ANGEL_BASE}/rest/secure/angelbroking/order/v2/orderBook`, req, res)
);

// Trade book
app.get("/angel/trades", (req, res) =>
  proxyTo(`${ANGEL_BASE}/rest/secure/angelbroking/order/v1/getTradeBook`, req, res)
);

// Position
app.get("/angel/positions", (req, res) =>
  proxyTo(`${ANGEL_BASE}/rest/secure/angelbroking/order/v1/getPosition`, req, res)
);

// Holdings
app.get("/angel/holdings", (req, res) =>
  proxyTo(`${ANGEL_BASE}/rest/secure/angelbroking/portfolio/v1/getHolding`, req, res)
);

// Cancel order
app.post("/angel/cancel", (req, res) =>
  proxyTo(`${ANGEL_BASE}/rest/secure/angelbroking/order/v2/cancelOrder`, req, res)
);

// Modify order
app.post("/angel/modify", (req, res) =>
  proxyTo(`${ANGEL_BASE}/rest/secure/angelbroking/order/v2/modifyOrder`, req, res)
);

// Square off (convert position)
app.post("/angel/squareoff", (req, res) =>
  proxyTo(`${ANGEL_BASE}/rest/secure/angelbroking/order/v1/convertPosition`, req, res)
);

// MarginCalculator (scripmaster NFO/BFO token lookup)
app.get("/angel/scripmaster", async (req, res) => {
  const { exchange } = req.query; // NFO or BFO
  const exch = (exchange || "NFO").toUpperCase();
  const url  = `https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json`;
  // This is a public URL -- no auth needed, direct fetch
  try {
    const r    = await fetch(url);
    const data = await r.json();
    // Filter to requested exchange only to reduce payload
    const filtered = data.filter(s => s.exch_seg === exch);
    return res.json(filtered);
  } catch (err) {
    return res.status(502).json({ status: false, error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`ProChain proxy listening on port ${PORT}`);
});
