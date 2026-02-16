# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
npm install          # Install all dependencies
npm run dev          # Dev mode: Express on :3001 + Vite on :5173 (proxy to /api)
npm run build        # Build React frontend (vite build → client/dist)
npm start            # Production: Express serves API + built frontend on :3001
```

No test suite or linter is configured.

## Architecture

**Monorepo**: Express backend (`server/index.js`) + React/Vite frontend (`client/`).

### Backend (server/index.js — single file, ~825 lines)

All backend logic lives in one file:
- **Auth**: Google OAuth via Passport.js, sessions stored in SQLite
- **Watchlist API**: CRUD for user-scoped stock watchlists (`/api/watchlist`)
- **Stock Data Proxy**: `/api/proxy/chart/:symbol` fetches from Alpha Vantage (TIME_SERIES_DAILY + SMA), merges price+SMA by date, returns unified response
- **Telegram Alerts**: Config CRUD, test endpoints, alert history (`/api/telegram/*`)
- **Background Job**: `setTimeout`-based scheduler runs daily at 9:30 AM ET, checks all enabled users' watchlists for bearish SMA crossovers, sends Telegram alerts with 7-day duplicate suppression
- **Caching**: In-memory Map with 12-hour TTL for Alpha Vantage responses; rate limiter enforces 12.5s between API calls (5 req/min free tier)

### Frontend (React 19 + Vite + Tailwind)

Three pages via React Router:
- `Watchlist.jsx` — main page, auth-gated, stock grid with add/remove
- `StockDetail.jsx` — price/SMA chart (Recharts), crossover visualization
- `Alerts.jsx` — Telegram bot config, test alerts, alert history

`client/src/lib/stockApi.js` — data fetching layer with 5-minute client-side cache, crossover detection logic.

### Database (SQLite via better-sqlite3, WAL mode)

Tables: `users`, `watchlist` (user_id + symbol unique), `telegram_config`, `alert_history`, `sma_state` (tracks above/below SMA position per user+symbol), `sessions`.

Auto-detects `/data` volume (Railway) or falls back to local `./watchlist.db`.

### Key Behaviors

- **Crossover detection**: Compares consecutive days' price vs SMA — transition from above to below = bearish crossover (alerts only on bearish)
- **OAuth callback URL**: Dynamically resolves from `RAILWAY_PUBLIC_DOMAIN` env var → `CALLBACK_URL` env var → hardcoded fallback
- **Production serving**: Express serves `client/dist` as static files with SPA fallback

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `GOOGLE_CLIENT_ID` | OAuth | — |
| `GOOGLE_CLIENT_SECRET` | OAuth | — |
| `SESSION_SECRET` | Session signing | — |
| `ALPHA_VANTAGE_KEY` | Stock data API | hardcoded fallback |
| `PORT` | Server port | 3001 |
| `NODE_ENV` | Environment | development |
| `RAILWAY_PUBLIC_DOMAIN` | OAuth callback domain | — |
| `DB_PATH` / `SESSION_DB_PATH` | Database locations | auto-detected |
