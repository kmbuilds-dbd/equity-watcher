# Equity Watcher

A full-stack equity watchlist application that tracks stocks against their 200-day Simple Moving Average (SMA) and sends Telegram alerts when bearish crossovers occur.

## Features

- **Stock Watchlist** — Add and track stocks with real-time prices and 200-day SMA values
- **Crossover Detection** — Identifies when a stock's price crosses below its 200-day SMA (bearish signal)
- **Interactive Charts** — Price and SMA overlaid with crossover points highlighted
- **Telegram Alerts** — Automated daily notifications at market open (9:30 AM ET) for bearish crossovers, with 7-day duplicate suppression
- **Google OAuth** — User-scoped watchlists with Google sign-in
- **Dark Theme UI** — Built with React, Tailwind CSS, and Recharts

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Tailwind CSS, Recharts |
| Backend | Node.js 22, Express |
| Database | SQLite (better-sqlite3, WAL mode) |
| Auth | Passport.js (Google OAuth 2.0) |
| Stock Data | Alpha Vantage API |
| Alerts | Telegram Bot API |

## Quick Start

### Prerequisites

- Node.js 18+
- Alpha Vantage API key (free at [alphavantage.co](https://www.alphavantage.co/support/#api-key)) — optional, a fallback key is included
- Google OAuth credentials (optional, for login)

### Run Locally

```bash
git clone <repo-url>
cd equity-watcher
npm install
npm run dev
```

This starts both the Express server (`:3001`) and Vite dev server (`:5173`, proxies `/api` to `:3001`).

### Production Build

```bash
npm run build    # Builds React frontend to client/dist
npm start        # Express serves API + static frontend on :3001
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ALPHA_VANTAGE_KEY` | No | Stock data API key (has fallback) |
| `GOOGLE_CLIENT_ID` | For auth | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For auth | Google OAuth client secret |
| `SESSION_SECRET` | For auth | Random string for session signing |
| `PORT` | No | Server port (default: `3001`) |
| `NODE_ENV` | No | `production` or `development` |
| `RAILWAY_PUBLIC_DOMAIN` | No | Auto-set by Railway for OAuth callback |

## Deployment

### Docker

```bash
docker build -t equity-watcher .
docker run -p 3001:3001 -v $(pwd)/data:/data -e NODE_ENV=production equity-watcher
```

Mount a volume at `/data` for persistent storage. The app auto-detects `/data` and stores databases there; without it, falls back to local `./watchlist.db`.

### Railway

1. Deploy from GitHub — Railway auto-detects the Node.js app
2. Add a persistent volume mounted at `/data` (required for data persistence across deploys)
3. Set environment variables in the Railway dashboard

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions across Railway, Docker, Render, Fly.io, and Heroku.

## API Endpoints

### Stock Data
- `GET /api/proxy/chart/:symbol` — Price + SMA data (merged, cached 12h)
- `GET /api/debug/stock/:symbol` — Debug info with cache status
- `GET /api/health` — Health check

### Watchlist (auth required)
- `GET /api/watchlist` — User's watchlist
- `POST /api/watchlist` — Add stock `{ symbol }`
- `DELETE /api/watchlist/:symbol` — Remove stock

### Telegram Alerts (auth required)
- `GET /api/telegram/config` — Get config
- `POST /api/telegram/config` — Save config `{ botToken, chatId }`
- `PUT /api/telegram/config/toggle` — Enable/disable alerts
- `DELETE /api/telegram/config` — Remove config
- `POST /api/telegram/test` — Send test alert
- `GET /api/telegram/history` — Alert history

### Auth
- `POST /api/auth/google` — Start OAuth flow
- `GET /api/auth/google/callback` — OAuth callback
- `GET /api/auth/me` — Current user
- `GET /api/auth/logout` — Logout

## Rate Limits

Alpha Vantage free tier allows 5 requests/minute and 25 requests/day. The app handles this with:
- 12-hour server-side cache for all stock data
- 12.5-second minimum interval between API calls
- 5-minute client-side cache

This supports roughly 12 stocks per day (2 API calls each: price + SMA).

## License

MIT
