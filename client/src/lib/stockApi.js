/**
 * Client-side stock data module.
 * Fetches data from our server proxy endpoint which uses Alpha Vantage API.
 * The server returns merged price + SMA data, so we just format it for display.
 */

/**
 * Fetch raw price + SMA history from our server proxy
 * @param {string} symbol - Stock ticker (e.g., "AAPL", "META")
 * @returns {Promise<{meta: object, history: Array}>}
 */
async function fetchRawData(symbol) {
  const res = await fetch(`/api/proxy/chart/${encodeURIComponent(symbol)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Failed to fetch data for ${symbol}`);
  }
  return res.json();
}

/**
 * Detect crossovers from merged price+SMA data
 */
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

/**
 * Fetch stock chart data with SMA overlay
 * @param {string} symbol - Stock ticker (e.g., "AAPL")
 * @param {string} range - Time range: "3mo", "6mo", "1y", "2y"
 * @returns {Promise<object>} Chart data with prices, SMA, and crossovers
 */
export async function fetchStockChart(symbol, range = "1y") {
  const raw = await fetchRawData(symbol);
  const history = raw.history || [];

  if (history.length === 0) {
    throw new Error(`No historical data for ${symbol}`);
  }

  // Detect crossovers from the merged data
  const crossovers = detectCrossovers(history);

  // Filter to requested range
  const rangeDays = { "3mo": 90, "6mo": 180, "1y": 365, "2y": 730 };
  const filterDays = rangeDays[range] || 365;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - filterDays);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  // Build chart data - the server already provides sma200 merged into history
  const chartData = history
    .map((h, i) => ({
      date: h.date,
      price: h.close,
      sma200: h.sma200,
      isCrossover: crossovers.some((c) => c.index === i),
    }))
    .filter((d) => d.date >= cutoffStr);

  // 52-week range
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearStr = oneYearAgo.toISOString().split("T")[0];
  const yearData = history.filter((h) => h.date >= oneYearStr);
  const fiftyTwoWeekHigh = yearData.length
    ? Math.max(...yearData.map((h) => h.high))
    : null;
  const fiftyTwoWeekLow = yearData.length
    ? Math.min(...yearData.map((h) => h.low))
    : null;

  const latestPrice = history[history.length - 1]?.close;
  const latestSMA = history[history.length - 1]?.sma200;
  const todayData = history[history.length - 1];

  return {
    meta: {
      symbol: symbol.toUpperCase(),
      shortName: raw.meta?.shortName || symbol.toUpperCase(),
      exchangeName: raw.meta?.exchangeName || "US",
      currency: raw.meta?.currency || "USD",
      regularMarketPrice: raw.meta?.regularMarketPrice || latestPrice,
      regularMarketDayHigh: todayData?.high,
      regularMarketDayLow: todayData?.low,
      fiftyTwoWeekHigh,
      fiftyTwoWeekLow,
    },
    currentPrice: latestPrice,
    sma200: latestSMA,
    priceAboveSMA: latestSMA ? latestPrice > latestSMA : null,
    recentCrossover:
      crossovers.length > 0 &&
      crossovers[crossovers.length - 1].index >= history.length - 10
        ? crossovers[crossovers.length - 1]
        : null,
    chartData,
    crossovers: crossovers
      .filter((c) => history[c.index]?.date >= cutoffStr)
      .map((c) => ({
        type: c.type,
        date: c.date,
        price: c.price,
      })),
  };
}

/**
 * Fetch stock summary (lighter version for watchlist cards)
 */
export async function fetchStockSummary(symbol) {
  const data = await fetchStockChart(symbol, "1y");
  return {
    meta: data.meta,
    currentPrice: data.currentPrice,
    sma200: data.sma200,
    priceAboveSMA: data.priceAboveSMA,
    recentCrossover: data.recentCrossover,
  };
}

// Simple in-memory cache for the browser session
const clientCache = new Map();
const CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes (server has 12h cache)

export async function fetchStockSummaryCached(symbol) {
  const key = `summary:${symbol}`;
  const cached = clientCache.get(key);
  if (cached && Date.now() - cached.ts < CLIENT_CACHE_TTL) return cached.data;
  const data = await fetchStockSummary(symbol);
  clientCache.set(key, { data, ts: Date.now() });
  return data;
}

export async function fetchStockChartCached(symbol, range) {
  const key = `chart:${symbol}:${range}`;
  const cached = clientCache.get(key);
  if (cached && Date.now() - cached.ts < CLIENT_CACHE_TTL) return cached.data;
  const data = await fetchStockChart(symbol, range);
  clientCache.set(key, { data, ts: Date.now() });
  return data;
}
