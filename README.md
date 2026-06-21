# ProChain Proxy

Angel One SmartAPI ke liye CORS proxy server. Railway pe deploy karo.

## Files
- `server.js` — Express proxy server
- `package.json` — dependencies

## Railway Deploy Steps

1. GitHub pe naya repo banao (e.g. `prochain-proxy`)
2. `server.js` aur `package.json` push karo
3. [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
4. Railway automatically `npm start` run karega
5. Settings → Domains → Generate Domain (e.g. `prochain-proxy.up.railway.app`)
6. Woh URL ProChain app mein Proxy Base ke roop mein enter karo

## Routes

| Route | Angel One Endpoint |
|---|---|
| POST /angel/login | loginByPassword |
| POST /angel/refresh | generateTokens |
| GET /angel/profile | getProfile |
| GET /angel/funds | getRMS |
| POST /angel/quote | market/quote |
| GET /angel/optionchain | getCandleData |
| GET /angel/expiry | getExpiryDate |
| POST /angel/search | searchScrip |
| POST /angel/order | placeOrder |
| GET /angel/orders | orderBook |
| GET /angel/trades | getTradeBook |
| GET /angel/positions | getPosition |
| GET /angel/holdings | getHolding |
| POST /angel/cancel | cancelOrder |
| POST /angel/modify | modifyOrder |
| POST /angel/squareoff | convertPosition |
| GET /angel/scripmaster | MarginCalculator JSON |
| GET /health | Health check |
