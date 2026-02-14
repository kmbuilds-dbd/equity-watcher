# Equity Watchlist & Alert System - Deployment Guide

## Overview

This is a full-stack equity watchlist application with:
- **Real-time stock data** via Alpha Vantage API
- **200-day SMA tracking** with crossover detection
- **Telegram alerts** for price/SMA crossovers
- **SQLite database** for watchlists and user settings
- **Node.js + Express backend** with aggressive 12-hour caching
- **React frontend** with Recharts visualization

## ✅ Alpha Vantage Integration (Fixed)

The app now uses **Alpha Vantage API** instead of Yahoo Finance, which fixes the Railway IP blocking issue.

### Data Sources:
- **TIME_SERIES_DAILY** (compact, 100 days) - Price history
- **SMA** endpoint - Pre-calculated 200-day SMA from Alpha Vantage
- **12-hour cache** - Aggressive caching since we only need daily data
- **Rate limiting** - 12.5 seconds between requests (Alpha Vantage free tier: 5 req/min, 25 req/day)

### API Key:
- Default key is hardcoded: `Z022A6E996FA7CC6`
- **Recommended**: Set `ALPHA_VANTAGE_KEY` environment variable with your own free key from https://www.alphavantage.co/support/#api-key

## Prerequisites

- Node.js 18+ (tested with Node 22)
- Railway account (or any Node.js hosting provider)
- Alpha Vantage API key (optional, fallback provided)

## Environment Variables

Required for production:

```bash
# Alpha Vantage API (optional, has fallback)
ALPHA_VANTAGE_KEY=your_alpha_vantage_key_here

# Node environment
NODE_ENV=production

# Port (Railway sets this automatically)
PORT=3001

# Database paths (optional, defaults to /tmp)
DB_PATH=/data/watchlist.db
SESSION_DB_PATH=/data/sessions.db

# Google OAuth (optional, for login feature)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
SESSION_SECRET=random_secret_string_here
```

## Deployment Methods

### Method 1: Railway via GitHub (Recommended)

1. **Push code to GitHub:**
   ```bash
   cd equity-watchlist-railway
   git init
   git add .
   git commit -m "Initial commit with Alpha Vantage integration"
   git remote add origin https://github.com/YOUR_USERNAME/equity-watchlist.git
   git push -u origin master
   ```

2. **Deploy on Railway:**
   - Go to https://railway.app
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your `equity-watchlist` repository
   - Railway will auto-detect the Node.js app and deploy

3. **Add environment variables:**
   - In Railway dashboard, go to your project
   - Click "Variables" tab
   - Add `ALPHA_VANTAGE_KEY` (optional)
   - Add `NODE_ENV=production`

4. **Add persistent volume (optional but recommended):**
   - In Railway dashboard, click "Add Volume"
   - Mount path: `/data`
   - This persists the SQLite database across deployments

5. **Get your domain:**
   - Railway auto-generates a domain like `your-app.up.railway.app`
   - Or add a custom domain in Settings

### Method 2: Railway CLI

**Note:** Railway CLI requires an **Account Token** (not a Project Token). Get it from https://railway.app/account/tokens

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login (opens browser)
railway login

# Link to project (if already created)
railway link

# Or create new project
railway init

# Deploy
railway up

# Set environment variables
railway variables set ALPHA_VANTAGE_KEY=your_key_here
railway variables set NODE_ENV=production
```

### Method 3: Docker Deployment

The project includes a `Dockerfile`:

```bash
# Build image
docker build -t equity-watchlist .

# Run locally
docker run -p 3001:3001 \
  -e ALPHA_VANTAGE_KEY=your_key \
  -e NODE_ENV=production \
  -v $(pwd)/data:/data \
  equity-watchlist

# Push to Docker Hub
docker tag equity-watchlist your-dockerhub-username/equity-watchlist
docker push your-dockerhub-username/equity-watchlist

# Deploy to Railway from Docker image
# In Railway dashboard: New Project → Deploy Docker Image → Enter image URL
```

### Method 4: Other Platforms

The app works on any Node.js hosting platform:

**Render:**
```bash
# Connect GitHub repo in Render dashboard
# Build command: npm install
# Start command: node server/index.js
```

**Fly.io:**
```bash
fly launch
fly deploy
```

**Heroku:**
```bash
heroku create equity-watchlist-app
git push heroku master
heroku config:set ALPHA_VANTAGE_KEY=your_key
```

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Server runs on http://localhost:3000
# Frontend proxies API requests to backend
```

## Testing the Deployment

Once deployed, test these endpoints:

1. **Health check:**
   ```bash
   curl https://your-app.up.railway.app/api/health
   ```

2. **Debug stock data (META):**
   ```bash
   curl https://your-app.up.railway.app/api/debug/stock/META
   ```
   
   Expected response:
   ```json
   {
     "symbol": "META",
     "source": "alphavantage",
     "totalDays": 100,
     "daysWithSMA": 100,
     "latestPrice": 639.77,
     "latestSMA": 688.095,
     "priceAboveSMA": false,
     "crossovers": 5,
     "cacheInfo": {
       "dailyCached": true,
       "smaCached": true,
       "cacheTTL": "12 hours"
     }
   }
   ```

3. **Frontend:**
   - Open `https://your-app.up.railway.app` in browser
   - Should load the watchlist interface
   - Add a stock (e.g., META, AAPL, MSFT)
   - View chart with price + SMA overlay

## Troubleshooting

### "No data available" errors

**Cause:** Alpha Vantage rate limit (5 requests/minute, 25/day on free tier)

**Solution:**
- Wait 15 seconds between stock additions
- Get your own free API key from https://www.alphavantage.co/support/#api-key
- Upgrade to Alpha Vantage premium for higher limits

### Database not persisting

**Cause:** No persistent volume mounted

**Solution:**
- In Railway: Add volume mounted at `/data`
- Set env vars: `DB_PATH=/data/watchlist.db` and `SESSION_DB_PATH=/data/sessions.db`

### Railway CLI "Unauthorized" error

**Cause:** Using a Project Token instead of Account Token

**Solution:**
- Go to https://railway.app/account/tokens
- Create a new **Account Token** (not Project Token)
- Use that token: `RAILWAY_TOKEN=your_account_token railway up`

### Telegram bot frozen

**Cause:** Bot token exposed in public repo

**Solution:**
- Bot tokens are stored in the database (not in code)
- If your bot is frozen, create a new bot via @BotFather on Telegram
- Update the token in the app's Alerts settings

## Architecture

```
client/                 # React frontend
  src/
    pages/             # Watchlist, StockDetail, Alerts
    lib/stockApi.js    # Client-side API wrapper
    components/        # UI components
server/
  index.js            # Express server with Alpha Vantage integration
package.json          # Dependencies
Dockerfile            # Docker build config
nixpacks.toml         # Railway build config
```

## API Endpoints

- `GET /api/proxy/chart/:symbol` - Get price + SMA data (merged)
- `GET /api/debug/stock/:symbol` - Debug endpoint with cache info
- `POST /api/telegram/config` - Save Telegram bot config
- `POST /api/telegram/test` - Test Telegram message
- `GET /api/health` - Health check

## Database Schema

**watchlist** table:
- `id`, `user_id`, `symbol`, `created_at`

**telegram_config** table:
- `id`, `user_id`, `bot_token`, `chat_id`, `enabled`, `last_check`

**sessions** table:
- `sid`, `sess`, `expire`

## Rate Limits

**Alpha Vantage Free Tier:**
- 5 API requests per minute
- 25 API requests per day
- Supports ~12 stocks with 2 calls per stock (price + SMA)

**Caching:**
- 12-hour cache for all stock data
- Reduces API calls to ~2 per day per stock

## Security Notes

1. **Telegram bot tokens** are stored in the database (not in code)
2. **Alpha Vantage API key** should be set via environment variable
3. **Session secrets** should be random and unique per deployment
4. **Google OAuth** credentials should never be committed to git

## Support

- Alpha Vantage API: https://www.alphavantage.co/support/
- Railway Platform: https://railway.app/help
- GitHub Issues: (your repo URL here)

## License

MIT
