import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceDot, ComposedChart,
} from "recharts";
import { fetchStockChartCached } from "../lib/stockApi";

const RANGES = ["3mo", "6mo", "1y", "2y"];
const RANGE_LABELS = { "3mo": "3M", "6mo": "6M", "1y": "1Y", "2y": "2Y" };

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-surface-2 border border-surface-3 rounded-lg p-3 shadow-xl">
      <p className="text-xs text-gray-400 mb-1">{d?.date}</p>
      <p className="text-sm font-mono text-white">
        Price: <span className="text-accent-blue">${d?.price?.toFixed(2)}</span>
      </p>
      {d?.sma200 != null && (
        <p className="text-sm font-mono text-gray-400">
          SMA: <span className="text-gray-300">${d.sma200.toFixed(2)}</span>
        </p>
      )}
    </div>
  );
}

export default function StockDetail() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const [range, setRange] = useState("1y");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchStockChartCached(symbol, range)
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [symbol, range]);

  const latestPrice = data?.chartData?.[data.chartData.length - 1]?.price;
  const latestSMA = data?.chartData?.[data.chartData.length - 1]?.sma200;
  const priceAboveSMA = latestPrice && latestSMA ? latestPrice > latestSMA : null;

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="border-b border-surface-3 bg-surface-1/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="text-gray-400 hover:text-white transition-colors flex items-center gap-1 text-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white font-mono">{symbol}</h1>
            {data?.meta && (
              <p className="text-sm text-gray-500">
                {data.meta.shortName} · {data.meta.exchangeName} · {data.meta.currency}
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-surface-1 border border-surface-3 rounded-lg p-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Current Price</p>
              <p className="text-xl font-mono font-bold text-white">${latestPrice?.toFixed(2)}</p>
            </div>
            <div className="bg-surface-1 border border-surface-3 rounded-lg p-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">200-Day SMA</p>
              <p className="text-xl font-mono font-bold text-white">
                {latestSMA != null ? `$${latestSMA.toFixed(2)}` : "N/A"}
              </p>
              {priceAboveSMA !== null && (
                <p className={`text-xs font-medium mt-0.5 ${priceAboveSMA ? "text-bullish" : "text-bearish"}`}>
                  Price {priceAboveSMA ? "Above" : "Below"} SMA
                </p>
              )}
            </div>
            <div className="bg-surface-1 border border-surface-3 rounded-lg p-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Day Range</p>
              <p className="text-lg font-mono font-semibold text-white">
                {data.meta?.regularMarketDayLow && data.meta?.regularMarketDayHigh
                  ? `$${data.meta.regularMarketDayLow.toFixed(2)} - $${data.meta.regularMarketDayHigh.toFixed(2)}`
                  : "N/A"}
              </p>
            </div>
            <div className="bg-surface-1 border border-surface-3 rounded-lg p-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">52-Week Range</p>
              <p className="text-lg font-mono font-semibold text-white">
                {data.meta?.fiftyTwoWeekLow && data.meta?.fiftyTwoWeekHigh
                  ? `$${data.meta.fiftyTwoWeekLow.toFixed(2)} - $${data.meta.fiftyTwoWeekHigh.toFixed(2)}`
                  : "N/A"}
              </p>
            </div>
          </div>
        )}

        {/* Chart */}
        <div className="bg-surface-1 border border-surface-3 rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-white">Price & 200-Day SMA</h2>
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-accent-blue rounded" /> Price
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-gray-500 rounded border-dashed" style={{ borderTop: "1px dashed #6b7280" }} /> 200-Day SMA
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-alert rounded-full" /> Crossover
                </span>
              </div>
            </div>
            <div className="flex gap-1 bg-surface-2 rounded-lg p-1">
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    range === r
                      ? "bg-accent-blue text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {RANGE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="h-80 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="h-80 flex items-center justify-center text-bearish">
              {error}
            </div>
          ) : data?.chartData ? (
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={data.chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4F8EF7" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#4F8EF7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1A1F2E" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "#222839" }}
                  tickFormatter={(v) => {
                    const d = new Date(v);
                    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  }}
                  interval="preserveStartEnd"
                  minTickGap={60}
                />
                <YAxis
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v}`}
                  domain={["auto", "auto"]}
                  width={60}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#4F8EF7"
                  strokeWidth={1.5}
                  fill="url(#priceGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#4F8EF7" }}
                />
                <Line
                  type="monotone"
                  dataKey="sma200"
                  stroke="#6b7280"
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  dot={false}
                  activeDot={false}
                  connectNulls
                />
                {data.chartData
                  .filter((d) => d.isCrossover)
                  .map((d, i) => (
                    <ReferenceDot
                      key={i}
                      x={d.date}
                      y={d.price}
                      r={5}
                      fill="#F59E0B"
                      stroke="#F59E0B"
                      strokeWidth={2}
                    />
                  ))}
              </ComposedChart>
            </ResponsiveContainer>
          ) : null}
        </div>

        {/* Crossover History */}
        {data?.crossovers && data.crossovers.length > 0 && (
          <div className="bg-surface-1 border border-surface-3 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">SMA Crossover History</h2>
            <div className="space-y-3">
              {data.crossovers
                .slice()
                .reverse()
                .map((c, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-surface-3 last:border-0">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        c.type === "above" ? "bg-bullish/10" : "bg-bearish/10"
                      }`}
                    >
                      {c.type === "above" ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 19V5M5 12l7-7 7 7" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 5V19M5 12l7 7 7-7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">
                        Crossed {c.type === "above" ? "Above" : "Below"} 200-Day SMA
                      </p>
                      <p className="text-xs text-gray-500">{c.date}</p>
                    </div>
                    <p className="font-mono text-sm text-gray-300">${c.price?.toFixed(2)}</p>
                  </div>
                ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
