import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchStockSummaryCached } from "../lib/stockApi";

function ArrowUp() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="rgba(16,185,129,0.15)" />
      <path d="M10 14V6M10 6L7 9M10 6L13 9" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowDown() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="rgba(239,68,68,0.15)" />
      <path d="M10 6V14M10 14L7 11M10 14L13 11" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StockCard({ item, onRemove }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchStockSummaryCached(item.symbol)
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [item.symbol]);

  const handleClick = () => navigate(`/stock/${item.symbol}`);

  return (
    <div
      onClick={handleClick}
      className={`relative bg-surface-1 border border-surface-3 rounded-lg p-5 cursor-pointer transition-all hover:border-accent-blue/40 hover:bg-surface-2 ${
        data?.recentCrossover ? "alert-glow border-alert/40" : ""
      }`}
    >
      {data?.recentCrossover && (
        <div className="absolute top-3 right-3 bg-alert/20 text-alert text-xs font-semibold px-2 py-0.5 rounded-full">
          SMA Cross
        </div>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(item.symbol);
        }}
        className="absolute top-3 right-3 text-text-secondary hover:text-alert transition-colors"
        style={data?.recentCrossover ? { top: "2.5rem" } : {}}
      >
        Remove
      </button>

      {loading && (
        <div className="flex items-center gap-3 text-text-secondary">
          <div className="w-5 h-5 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
          Loading {item.symbol}...
        </div>
      )}
      {error && <div className="text-alert text-sm">
        <span className="font-mono font-bold text-text-primary mr-2">{item.symbol}</span>
        Error: {error}
      </div>}
      {data && (
        <>
          <div className="flex items-baseline gap-3 mb-3">
            <h3 className="text-2xl font-bold font-mono text-text-primary">{item.symbol}</h3>
            <span className="text-sm text-text-secondary truncate">
              {data.meta.shortName} · {data.meta.exchangeName}
            </span>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <span className="text-3xl font-bold font-mono text-text-primary">
              ${data.currentPrice?.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <div>
              <span className="text-text-secondary">200-DAY SMA</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono font-semibold text-text-primary">
                  ${data.sma200?.toFixed(2) || "N/A"}
                </span>
                {data.priceAboveSMA !== null && (data.priceAboveSMA ? <ArrowUp /> : <ArrowDown />)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Watchlist() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [ticker, setTicker] = useState("");
  const [error, setError] = useState("");

  // Check auth status
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        setUser(data);
        setAuthLoading(false);
      })
      .catch(() => {
        setUser(null);
        setAuthLoading(false);
      });
  }, []);

  // Fetch watchlist when authenticated
  useEffect(() => {
    if (user) {
      setLoading(true);
      fetch("/api/watchlist")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setWatchlist(data);
        })
        .catch((e) => console.error(e))
        .finally(() => setLoading(false));
    }
  }, [user]);

  const handleLogin = () => {
    window.location.href = "/api/auth/google";
  };

  const handleLogout = () => {
    fetch("/api/auth/logout")
      .then(() => {
        setUser(null);
        setWatchlist([]);
      })
      .catch((e) => console.error(e));
  };

  const handleAdd = () => {
    if (!ticker.trim()) return;
    setError("");
    // First validate the ticker by trying to fetch data client-side
    const symbol = ticker.toUpperCase().trim();
    fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setWatchlist([data, ...watchlist]);
          setTicker("");
          setShowDialog(false);
        }
      })
      .catch((e) => setError(e.message));
  };

  const handleRemove = (symbol) => {
    fetch(`/api/watchlist/${symbol}`, { method: "DELETE" })
      .then(() => {
        setWatchlist(watchlist.filter((item) => item.symbol !== symbol));
      })
      .catch((e) => console.error(e));
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="bg-surface-1 border border-surface-3 rounded-xl p-8">
            <div className="w-16 h-16 bg-accent-blue/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-blue">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-text-primary mb-2">EquityWatch</h1>
            <p className="text-text-secondary mb-6">Track stock prices against the 200-day moving average</p>
            <button
              onClick={handleLogin}
              className="w-full bg-white text-gray-800 font-semibold py-3 px-6 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center gap-3"
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-surface-3 bg-surface-1/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent-blue/10 rounded-lg flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-blue">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-text-primary">EquityWatch</h1>
          </div>
          <div className="flex items-center gap-4">
            {user.avatar && <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full" />}
            <span className="text-sm text-text-secondary hidden sm:inline">{user.name || user.email}</span>
            <button
              onClick={() => navigate("/alerts")}
              className="text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              Alerts
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Logout
            </button>
            <button
              onClick={() => setShowDialog(true)}
              className="bg-accent-blue hover:bg-accent-blue/90 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              + Add Ticker
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-text-primary mb-2">Equity Watchlist</h2>
          <p className="text-text-secondary">Track prices against the 200-day moving average</p>
        </div>

        {loading && (
          <div className="flex items-center gap-3 text-text-secondary">
            <div className="w-5 h-5 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
            Loading watchlist...
          </div>
        )}

        {!loading && watchlist.length === 0 && (
          <div className="bg-surface-1 border border-surface-3 rounded-xl p-12 text-center">
            <div className="w-16 h-16 bg-accent-blue/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-blue">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-text-primary mb-2">No equities in your watchlist</h3>
            <p className="text-text-secondary mb-6">
              Add stock tickers to track their price against the 200-day simple moving average and receive crossover alerts.
            </p>
            <button
              onClick={() => setShowDialog(true)}
              className="bg-accent-blue hover:bg-accent-blue/90 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              + Add Your First Ticker
            </button>
          </div>
        )}

        {!loading && watchlist.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {watchlist.map((item) => (
              <StockCard key={item.id} item={item} onRemove={handleRemove} />
            ))}
          </div>
        )}
      </main>

      {/* Add Ticker Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowDialog(false)}>
          <div className="bg-surface-1 border border-surface-3 rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-text-primary">Add Ticker</h3>
              <button onClick={() => setShowDialog(false)} className="text-text-secondary hover:text-text-primary text-2xl">
                ×
              </button>
            </div>
            <input
              type="text"
              placeholder="Enter ticker (e.g. AAPL, META, MSFT)"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="w-full bg-surface-2 border border-surface-3 rounded-lg px-4 py-3 text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent-blue mb-4"
              autoFocus
            />
            {error && <div className="text-alert text-sm mb-4">{error}</div>}
            <button
              onClick={handleAdd}
              className="w-full bg-accent-blue hover:bg-accent-blue/90 text-white px-4 py-3 rounded-lg font-medium transition-colors"
            >
              Add to Watchlist
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
