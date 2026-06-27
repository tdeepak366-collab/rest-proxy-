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
// v547 fix: NSE requires 2-step fetch — homepage se cookies lo, phir API hit karo
// Bina cookies ke NSE 401/403 deta hai
// 5min server-side cache — NSE rate-limit se bachne ke liye
const nseCache = { data: null, ts: 0 };
const NSE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const NSE_HEADERS = {
  "Accept":          "application/json, text/plain, */*",
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  "Referer":         "https://www.nseindia.com/",
  "Accept-Language": "en-US,en;q=0.9",
  "Connection":      "keep-alive",
  "DNT":             "1",
};

app.get("/fii-dii", async (req, res) => {
  if (!checkAuth(req, res)) return;

  // Cache hit — return immediately
  if (nseCache.data && (Date.now() - nseCache.ts) < NSE_CACHE_TTL) {
    return res.json({ status: true, data: nseCache.data, cached: true });
  }

  try {
    // Step 1: NSE homepage hit — session cookies lo
    const homeRes = await fetch("https://www.nseindia.com/", {
      headers: NSE_HEADERS,
      timeout: 10000,
    });

    // node-fetch v2: headers.raw() se set-cookie array milta hai
    const rawCookies = homeRes.headers.raw?.()?.["set-cookie"] || [];
    const cookieStr  = rawCookies.map(c => c.split(";")[0]).join("; ");

    // Step 2: Actual participant OI API — cookies ke saath
    const apiRes = await fetch(
      "https://www.nseindia.com/api/participant-oi-derivatives",
      {
        headers: {
          ...NSE_HEADERS,
          ...(cookieStr ? { "Cookie": cookieStr } : {}),
        },
        timeout: 10000,
      }
    );

    if (!apiRes.ok) {
      return res.status(apiRes.status).json({
        status: false,
        message: `NSE API HTTP ${apiRes.status}`,
      });
    }

    const json = await apiRes.json();
    const data = json?.participantStatsData || json?.data || json;

    // Cache update
    nseCache.data = data;
    nseCache.ts   = Date.now();

    res.json({ status: true, data });

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
