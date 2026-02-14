import express from "express";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import SqliteStore from "better-sqlite3-session-store";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust proxy - Railway runs behind a proxy
app.set("trust proxy", 1);

app.use(express.json());

// --- Session Setup ---
const SessionStore = SqliteStore(session);
// Use /data if it exists (Railway volume), otherwise use local path
const defaultSessionPath = fs.existsSync("/data") ? "/data/sessions.db" : "./sessions.db";
const sessionDbPath = process.env.SESSION_DB_PATH || defaultSessionPath;
const sessionDbDir = path.dirname(sessionDbPath);
if (!fs.existsSync(sessionDbDir)) fs.mkdirSync(sessionDbDir, { recursive: true });

app.use(
  session({
    store: new SessionStore({
      client: new Database(sessionDbPath),
      expired: { clear: true, intervalMs: 900000 },
    }),
    secret: process.env.SESSION_SECRET || "equity-watchlist-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// --- Database Setup (SQLite) ---
// Use /data if it exists (Railway volume), otherwise use local path
const defaultDbPath = fs.existsSync("/data") ? "/data/watchlist.db" : "./watchlist.db";
const dbPath = process.env.DB_PATH || defaultDbPath;
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT NOT NULL UNIQUE,
    email TEXT,
    name TEXT,
    avatar TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    added_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, symbol)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS telegram_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    bot_token TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS alert_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    cross_type TEXT NOT NULL,
    price REAL NOT NULL,
    sma_value REAL NOT NULL,
    sent_at TEXT DEFAULT (datetime('now')),
    telegram_success INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// Add index for faster duplicate alert lookups
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_alert_history_user_symbol_sent 
  ON alert_history(user_id, symbol, sent_at)
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sma_state (
    user_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    last_position TEXT,
    last_checked TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, symbol),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// --- Passport Google OAuth Strategy ---
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const callbackURL = process.env.RAILWAY_PUBLIC_DOMAIN 
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/api/auth/google/callback`
    : process.env.CALLBACK_URL || `https://equity-watcher-production.up.railway.app/api/auth/google/callback`;

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL,
      },
      (accessToken, refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails?.[0]?.value || null;
          const name = profile.displayName || null;
          const avatar = profile.photos?.[0]?.value || null;

          let user = db.prepare("SELECT * FROM users WHERE google_id = ?").get(googleId);

          if (!user) {
            const result = db
              .prepare("INSERT INTO users (google_id, email, name, avatar) VALUES (?, ?, ?, ?)")
              .run(googleId, email, name, avatar);
            user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
          } else {
            db.prepare(
              "UPDATE users SET email = ?, name = ?, avatar = ? WHERE google_id = ?"
            ).run(email, name, avatar, googleId);
            user = db.prepare("SELECT * FROM users WHERE google_id = ?").get(googleId);
          }

          return done(null, user);
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) => {
    try {
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
}

// --- Auth Middleware ---
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Authentication required" });
}

// --- Auth Routes ---
app.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

app.get(
  "/api/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => res.redirect("/")
);

app.get("/api/auth/logout", (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    res.json({ success: true });
  });
});

app.get("/api/auth/me", (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      avatar: req.user.avatar,
    });
  } else {
    res.json(null);
  }
});

// ============================================================
// Alpha Vantage Stock Data Integration
// Uses API key-based access (works from any IP, including Railway)
// - TIME_SERIES_DAILY (compact): 100 days of OHLCV price data
// - SMA endpoint: pre-calculated 200-day SMA values
// - Aggressive 12-hour caching to stay within 25 calls/day free tier
// ============================================================

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY || "Z022A6E996FA7CC6";
const AV_BASE = "https://www.alphavantage.co/query";

// --- In-memory cache with 12-hour TTL ---
const cache = new Map();
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

function getCached(key) {
  const c = cache.get(key);
  if (c && Date.now() - c.ts < CACHE_TTL) return c.data;
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// Rate limiter: max 5 requests per minute to Alpha Vantage
const requestQueue = [];
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 12500; // 12.5 seconds between requests (safe for 5/min)

async function rateLimitedFetch(url) {
  const now = Date.now();
  const waitTime = Math.max(0, lastRequestTime + MIN_REQUEST_INTERVAL - now);
  if (waitTime > 0) {
    await new Promise((r) => setTimeout(r, waitTime));
  }
  lastRequestTime = Date.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  return res;
}

// --- Fetch daily price data (100 days, compact) ---
async function fetchDailyPrices(symbol) {
  const cacheKey = `daily:${symbol}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[AV] Cache hit for daily prices: ${symbol}`);
    return cached;
  }

  const url = `${AV_BASE}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHA_VANTAGE_KEY}`;
  console.log(`[AV] Fetching daily prices for ${symbol}...`);

  const res = await rateLimitedFetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status}`);

  const json = await res.json();

  // Check for rate limit or error messages
  if (json.Note) throw new Error(`Alpha Vantage rate limit: ${json.Note}`);
  if (json.Information) throw new Error(`Alpha Vantage: ${json.Information}`);
  if (json["Error Message"]) throw new Error(`Alpha Vantage: ${json["Error Message"]}`);

  const timeSeries = json["Time Series (Daily)"];
  if (!timeSeries) throw new Error(`No daily data returned for ${symbol}`);

  const dates = Object.keys(timeSeries).sort();
  const history = dates.map((date) => {
    const d = timeSeries[date];
    return {
      date,
      open: parseFloat(d["1. open"]),
      high: parseFloat(d["2. high"]),
      low: parseFloat(d["3. low"]),
      close: parseFloat(d["4. close"]),
      volume: parseInt(d["5. volume"]) || 0,
    };
  });

  console.log(`[AV] Got ${history.length} daily prices for ${symbol} (${dates[0]} to ${dates[dates.length - 1]})`);
  setCache(cacheKey, history);
  return history;
}

// --- Fetch pre-calculated 200-day SMA from Alpha Vantage ---
async function fetchSMA200(symbol) {
  const cacheKey = `sma200:${symbol}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[AV] Cache hit for SMA200: ${symbol}`);
    return cached;
  }

  const url = `${AV_BASE}?function=SMA&symbol=${encodeURIComponent(symbol)}&interval=daily&time_period=200&series_type=close&apikey=${ALPHA_VANTAGE_KEY}`;
  console.log(`[AV] Fetching 200-day SMA for ${symbol}...`);

  const res = await rateLimitedFetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage SMA HTTP ${res.status}`);

  const json = await res.json();

  if (json.Note) throw new Error(`Alpha Vantage rate limit: ${json.Note}`);
  if (json.Information) throw new Error(`Alpha Vantage: ${json.Information}`);
  if (json["Error Message"]) throw new Error(`Alpha Vantage: ${json["Error Message"]}`);

  const smaData = json["Technical Analysis: SMA"];
  if (!smaData) throw new Error(`No SMA data returned for ${symbol}`);

  // Convert to a date->value map for easy lookup
  const smaMap = {};
  for (const [date, val] of Object.entries(smaData)) {
    smaMap[date] = parseFloat(val.SMA);
  }

  const dates = Object.keys(smaMap).sort();
  console.log(`[AV] Got ${dates.length} SMA data points for ${symbol} (${dates[0]} to ${dates[dates.length - 1]})`);

  setCache(cacheKey, smaMap);
  return smaMap;
}

// --- Combined: fetch prices + SMA and merge ---
async function fetchStockData(symbol) {
  const [history, smaMap] = await Promise.all([
    fetchDailyPrices(symbol),
    fetchSMA200(symbol),
  ]);

  // Merge SMA values into history by date
  const mergedHistory = history.map((day) => ({
    ...day,
    sma200: smaMap[day.date] ?? null,
  }));

  // Get latest values
  const latest = mergedHistory[mergedHistory.length - 1];
  const latestPrice = latest?.close;
  const latestSMA = latest?.sma200;

  return {
    source: "alphavantage",
    meta: {
      shortName: symbol.toUpperCase(),
      exchangeName: "US",
      currency: "USD",
      regularMarketPrice: latestPrice,
    },
    history: mergedHistory,
    latestPrice,
    latestSMA,
  };
}

// ============================================================
// SMA crossover detection (uses the merged data)
// ============================================================
function detectCrossovers(history) {
  const crossovers = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];
    if (prev.sma200 == null || curr.sma200 == null) continue;
    if (prev.close <= prev.sma200 && curr.close > curr.sma200) {
      crossovers.push({ type: "above", index: i, date: curr.date, price: curr.close });
    } else if (prev.close >= prev.sma200 && curr.close < curr.sma200) {
      crossovers.push({ type: "below", index: i, date: curr.date, price: curr.close });
    }
  }
  return crossovers;
}

// ============================================================
// Telegram helper
// ============================================================
async function sendTelegramMessage(botToken, chatId, message) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.description || "Telegram API error");
  }
  return data;
}

// ============================================================
// Proxy endpoint: serves stock data to the frontend
// Returns merged price + SMA data
// ============================================================
app.get("/api/proxy/chart/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const data = await fetchStockData(symbol);
    res.json({
      source: data.source,
      meta: data.meta,
      history: data.history,
    });
  } catch (err) {
    console.error(`[Proxy] /proxy/chart/${symbol} error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Debug endpoint (public, no auth)
app.get("/api/debug/stock/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const data = await fetchStockData(symbol);
    const history = data.history;
    const withSMA = history.filter((d) => d.sma200 != null);
    const crossovers = detectCrossovers(history);

    res.json({
      symbol,
      source: data.source,
      totalDays: history.length,
      daysWithSMA: withSMA.length,
      latestPrice: data.latestPrice,
      latestSMA: data.latestSMA,
      priceAboveSMA: data.latestPrice > data.latestSMA,
      crossovers: crossovers.length,
      recentCrossovers: crossovers.slice(-5),
      sampleData: {
        oldest: history[0],
        newest: history[history.length - 1],
      },
      cacheInfo: {
        dailyCached: cache.has(`daily:${symbol}`),
        smaCached: cache.has(`sma200:${symbol}`),
        cacheTTL: "12 hours",
      },
    });
  } catch (err) {
    res.status(500).json({ symbol, error: err.message });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    dataSource: "Alpha Vantage",
    cacheSize: cache.size,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// Watchlist API Routes (Protected)
// ============================================================
app.get("/api/watchlist", requireAuth, (req, res) => {
  const items = db
    .prepare("SELECT * FROM watchlist WHERE user_id = ? ORDER BY added_at DESC")
    .all(req.user.id);
  res.json(items);
});

app.post("/api/watchlist", requireAuth, (req, res) => {
  const { symbol } = req.body;
  if (!symbol) return res.status(400).json({ error: "Symbol required" });
  const upper = symbol.toUpperCase().trim();
  try {
    const existing = db
      .prepare("SELECT id FROM watchlist WHERE user_id = ? AND symbol = ?")
      .get(req.user.id, upper);
    if (existing) return res.status(409).json({ error: "Already in watchlist" });
    const result = db
      .prepare("INSERT INTO watchlist (user_id, symbol) VALUES (?, ?)")
      .run(req.user.id, upper);
    res.json({ id: result.lastInsertRowid, symbol: upper, user_id: req.user.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/watchlist/:symbol", requireAuth, (req, res) => {
  const { symbol } = req.params;
  db.prepare("DELETE FROM watchlist WHERE user_id = ? AND symbol = ?").run(
    req.user.id,
    symbol.toUpperCase()
  );
  db.prepare("DELETE FROM sma_state WHERE user_id = ? AND symbol = ?").run(
    req.user.id,
    symbol.toUpperCase()
  );
  res.json({ success: true });
});

// ============================================================
// Telegram Config API Routes (Protected)
// ============================================================
app.get("/api/telegram/config", requireAuth, (req, res) => {
  const config = db
    .prepare(
      "SELECT id, user_id, chat_id, enabled, created_at, updated_at FROM telegram_config WHERE user_id = ?"
    )
    .get(req.user.id);
  if (config) {
    const fullToken = db
      .prepare("SELECT bot_token FROM telegram_config WHERE user_id = ?")
      .get(req.user.id);
    config.bot_token_masked = fullToken.bot_token
      ? fullToken.bot_token.slice(0, 6) + "..." + fullToken.bot_token.slice(-4)
      : null;
    config.has_token = !!fullToken.bot_token;
  }
  res.json(config || null);
});

app.post("/api/telegram/config", requireAuth, (req, res) => {
  const { bot_token, chat_id, enabled } = req.body;
  if (!bot_token || !chat_id) {
    return res.status(400).json({ error: "Bot token and chat ID are required" });
  }
  try {
    const existing = db
      .prepare("SELECT id FROM telegram_config WHERE user_id = ?")
      .get(req.user.id);
    if (existing) {
      db.prepare(
        "UPDATE telegram_config SET bot_token = ?, chat_id = ?, enabled = ?, updated_at = datetime('now') WHERE user_id = ?"
      ).run(bot_token, chat_id.toString(), enabled !== false ? 1 : 0, req.user.id);
    } else {
      db.prepare(
        "INSERT INTO telegram_config (user_id, bot_token, chat_id, enabled) VALUES (?, ?, ?, ?)"
      ).run(req.user.id, bot_token, chat_id.toString(), enabled !== false ? 1 : 0);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/telegram/config/toggle", requireAuth, (req, res) => {
  const { enabled } = req.body;
  try {
    db.prepare(
      "UPDATE telegram_config SET enabled = ?, updated_at = datetime('now') WHERE user_id = ?"
    ).run(enabled ? 1 : 0, req.user.id);
    res.json({ success: true, enabled: !!enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/telegram/config", requireAuth, (req, res) => {
  db.prepare("DELETE FROM telegram_config WHERE user_id = ?").run(req.user.id);
  res.json({ success: true });
});

app.post("/api/telegram/test", requireAuth, async (req, res) => {
  const { bot_token, chat_id } = req.body;
  if (!bot_token || !chat_id) {
    return res.status(400).json({ error: "Bot token and chat ID are required" });
  }
  try {
    const message =
      `<b>🔔 EquityWatch Test Alert</b>\n\n` +
      `This is a test message from your EquityWatch alert system.\n` +
      `If you see this, Telegram alerts are configured correctly!\n\n` +
      `<i>Sent at ${new Date().toUTCString()}</i>`;
    await sendTelegramMessage(bot_token, chat_id, message);
    res.json({ success: true, message: "Test message sent successfully" });
  } catch (err) {
    res.status(400).json({ error: `Telegram error: ${err.message}` });
  }
});

app.post("/api/telegram/test-stored", requireAuth, async (req, res) => {
  const config = db
    .prepare("SELECT bot_token, chat_id FROM telegram_config WHERE user_id = ?")
    .get(req.user.id);
  if (!config) {
    return res.status(400).json({ error: "No Telegram configuration found" });
  }
  try {
    const message =
      `<b>🔔 EquityWatch Test Alert</b>\n\n` +
      `This is a test message from your EquityWatch alert system.\n` +
      `If you see this, Telegram alerts are configured correctly!\n\n` +
      `<i>Sent at ${new Date().toUTCString()}</i>`;
    await sendTelegramMessage(config.bot_token, config.chat_id, message);
    res.json({ success: true, message: "Test message sent successfully" });
  } catch (err) {
    res.status(400).json({ error: `Telegram error: ${err.message}` });
  }
});

app.get("/api/telegram/history", requireAuth, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const history = db
    .prepare(
      "SELECT * FROM alert_history WHERE user_id = ? ORDER BY sent_at DESC LIMIT ?"
    )
    .all(req.user.id, limit);
  res.json(history);
});

// ============================================================
// Background Job: Crossover Alert Checker
// Uses Alpha Vantage with caching for reliability
// Runs once daily at 9:30 AM ET (market open)
// ============================================================

async function checkCrossoversForUser(userId) {
  const config = db
    .prepare("SELECT * FROM telegram_config WHERE user_id = ? AND enabled = 1")
    .get(userId);
  if (!config) return;

  const watchlistItems = db
    .prepare("SELECT symbol FROM watchlist WHERE user_id = ?")
    .all(userId);
  if (!watchlistItems.length) return;

  for (const item of watchlistItems) {
    try {
      const data = await fetchStockData(item.symbol);
      const latestPrice = data.latestPrice;
      const latestSMA = data.latestSMA;

      if (!latestSMA || !latestPrice) continue;

      const currentPosition = latestPrice > latestSMA ? "above" : "below";

      const state = db
        .prepare("SELECT last_position FROM sma_state WHERE user_id = ? AND symbol = ?")
        .get(userId, item.symbol);

      const lastPosition = state?.last_position;

      db.prepare(
        `INSERT INTO sma_state (user_id, symbol, last_position, last_checked)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(user_id, symbol) DO UPDATE SET last_position = ?, last_checked = datetime('now')`
      ).run(userId, item.symbol, currentPosition, currentPosition);

      if (lastPosition && lastPosition !== currentPosition) {
        const crossType = currentPosition === "above" ? "bullish" : "bearish";
        
        // ONLY alert on bearish (below) crossovers
        if (crossType !== "bearish") {
          console.log(
            `[Alert] Skipping bullish crossover for ${item.symbol} (user ${userId}) - only bearish alerts enabled`
          );
          continue;
        }

        // Check for duplicate alerts within the last 7 days
        const recentAlert = db
          .prepare(
            `SELECT id, sent_at FROM alert_history 
             WHERE user_id = ? AND symbol = ? AND cross_type = 'bearish'
             AND sent_at > datetime('now', '-7 days')
             ORDER BY sent_at DESC LIMIT 1`
          )
          .get(userId, item.symbol);

        if (recentAlert) {
          console.log(
            `[Alert] Suppressing duplicate alert for ${item.symbol} (user ${userId}) - last alert sent at ${recentAlert.sent_at}`
          );
          continue;
        }

        const emoji = "📉";
        const direction = "BELOW";

        const message =
          `<b>${emoji} SMA Crossover Alert: ${item.symbol}</b>\n\n` +
          `<b>${item.symbol}</b> has crossed <b>${direction}</b> its 200-day SMA\n\n` +
          `• Price: <code>$${latestPrice.toFixed(2)}</code>\n` +
          `• 200-Day SMA: <code>$${latestSMA.toFixed(2)}</code>\n` +
          `• Signal: <b>Bearish 🔴</b>\n\n` +
          `<i>${new Date().toUTCString()}</i>`;

        let telegramSuccess = 0;
        try {
          await sendTelegramMessage(config.bot_token, config.chat_id, message);
          telegramSuccess = 1;
          console.log(
            `[Alert] Sent bearish crossover alert for ${item.symbol} to user ${userId}`
          );
        } catch (err) {
          console.error(
            `[Alert] Failed to send Telegram for ${item.symbol} to user ${userId}:`,
            err.message
          );
        }

        db.prepare(
          `INSERT INTO alert_history (user_id, symbol, cross_type, price, sma_value, telegram_success)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(userId, item.symbol, crossType, latestPrice, latestSMA, telegramSuccess);
      }

      // Rate limit: wait between symbols to respect Alpha Vantage limits
      // Free tier: 5 requests/minute, 25 requests/day
      // With daily checks, we have plenty of headroom, but still space out requests
      await new Promise((r) => setTimeout(r, 3000)); // 3 seconds between symbols
    } catch (err) {
      console.error(
        `[Alert] Error checking ${item.symbol} for user ${userId}:`,
        err.message
      );
    }
  }
}

async function runCrossoverCheck() {
  console.log(`[Alert Job] Running crossover check at ${new Date().toISOString()}`);
  try {
    const configs = db
      .prepare("SELECT DISTINCT user_id FROM telegram_config WHERE enabled = 1")
      .all();

    for (const { user_id } of configs) {
      await checkCrossoversForUser(user_id);
    }
    console.log(`[Alert Job] Completed crossover check for ${configs.length} user(s)`);
  } catch (err) {
    console.error("[Alert Job] Error:", err.message);
  }
}

let alertInterval = null;

function getNextMarketOpenTime() {
  const now = new Date();
  
  // Convert to ET timezone (UTC-5 or UTC-4 depending on DST)
  // Using a simple approach: get current time in ET
  const etOffset = -5 * 60; // ET is UTC-5 (standard time)
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const etTime = new Date(utcTime + (etOffset * 60000));
  
  // Set target time to 9:30 AM ET
  const targetTime = new Date(etTime);
  targetTime.setHours(9, 30, 0, 0);
  
  // If we've already passed 9:30 AM ET today, schedule for tomorrow
  if (etTime >= targetTime) {
    targetTime.setDate(targetTime.getDate() + 1);
  }
  
  // Convert back to local time
  const targetUTC = targetTime.getTime() - (etOffset * 60000);
  const localTarget = new Date(targetUTC - (now.getTimezoneOffset() * 60000));
  
  return localTarget;
}

function scheduleNextCheck() {
  const nextRun = getNextMarketOpenTime();
  const msUntilNext = nextRun.getTime() - Date.now();
  
  console.log(`[Alert Job] Next check scheduled for: ${nextRun.toISOString()} (in ${Math.round(msUntilNext / 1000 / 60)} minutes)`);
  
  alertInterval = setTimeout(() => {
    runCrossoverCheck();
    // Schedule the next check after this one completes
    scheduleNextCheck();
  }, msUntilNext);
}

function startAlertJob() {
  console.log('[Alert Job] Starting daily alert scheduler (9:30 AM ET)');
  
  // Run an initial check 30 seconds after startup (for testing/immediate feedback)
  setTimeout(() => {
    console.log('[Alert Job] Running initial check on startup...');
    runCrossoverCheck();
  }, 30000);
  
  // Schedule the first daily check
  scheduleNextCheck();
}

// ============================================================
// Serve frontend in production
// ============================================================
const clientDist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Data source: Alpha Vantage (API key: ${ALPHA_VANTAGE_KEY.slice(0, 4)}...)`);
  console.log(`Cache TTL: 12 hours`);
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn(
      "[WARNING] Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables."
    );
  }
  startAlertJob();
});
