import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

function TelegramIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"
        fill="#29B6F6"
      />
    </svg>
  );
}

function StatusBadge({ enabled }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
        enabled
          ? "bg-bullish/15 text-bullish"
          : "bg-surface-3 text-text-secondary"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          enabled ? "bg-bullish animate-pulse" : "bg-text-secondary"
        }`}
      />
      {enabled ? "Active" : "Paused"}
    </span>
  );
}

export default function Alerts() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Telegram config state
  const [config, setConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Alert history
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Check auth
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

  // Fetch Telegram config
  useEffect(() => {
    if (user) {
      fetch("/api/telegram/config")
        .then((r) => r.json())
        .then((data) => {
          setConfig(data);
          if (data) {
            setChatId(data.chat_id || "");
          }
          setConfigLoading(false);
        })
        .catch(() => setConfigLoading(false));

      // Fetch alert history
      setHistoryLoading(true);
      fetch("/api/telegram/history?limit=20")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setHistory(data);
          setHistoryLoading(false);
        })
        .catch(() => setHistoryLoading(false));
    }
  }, [user]);

  const handleSave = async () => {
    if (!botToken.trim() || !chatId.trim()) {
      setError("Both Bot Token and Chat ID are required");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/telegram/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_token: botToken, chat_id: chatId, enabled: true }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSuccess("Telegram configuration saved successfully");
      setShowForm(false);
      setBotToken("");
      // Refresh config
      const cfgRes = await fetch("/api/telegram/config");
      setConfig(await cfgRes.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    const tokenToTest = botToken.trim() || null;
    const chatToTest = chatId.trim() || config?.chat_id;

    if (!chatToTest) {
      setTestResult({ success: false, message: "Chat ID is required" });
      return;
    }

    // If editing, use the form values; otherwise fetch the stored token
    let finalToken = tokenToTest;
    if (!finalToken && config?.has_token) {
      // We need the stored token — send a test request that uses stored config
      setTesting(true);
      setTestResult(null);
      try {
        // Use a special endpoint that uses stored config
        const res = await fetch("/api/telegram/test-stored", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();
        setTestResult(data);
      } catch (err) {
        setTestResult({ success: false, message: err.message });
      } finally {
        setTesting(false);
      }
      return;
    }

    if (!finalToken) {
      setTestResult({ success: false, message: "Bot Token is required for testing" });
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_token: finalToken, chat_id: chatToTest }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleToggle = async () => {
    if (!config) return;
    try {
      const res = await fetch("/api/telegram/config/toggle", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !config.enabled }),
      });
      const data = await res.json();
      if (data.success) {
        setConfig({ ...config, enabled: data.enabled ? 1 : 0 });
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Remove Telegram configuration? You will stop receiving alerts.")) return;
    try {
      await fetch("/api/telegram/config", { method: "DELETE" });
      setConfig(null);
      setBotToken("");
      setChatId("");
      setShowForm(false);
    } catch (err) {
      setError(err.message);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-text-secondary">Loading...</div>
      </div>
    );
  }

  if (!user) {
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-surface-3 bg-surface-1/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="w-10 h-10 bg-accent-blue/10 rounded-lg flex items-center justify-center hover:bg-accent-blue/20 transition-colors"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-blue">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-text-primary">EquityWatch</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              ← Watchlist
            </button>
            {user.avatar && (
              <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full" />
            )}
            <span className="text-sm text-text-secondary">{user.name || user.email}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8 max-w-3xl">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-text-primary mb-2">Alert Settings</h2>
          <p className="text-text-secondary">
            Configure Telegram alerts for 200-day SMA crossovers on your watchlist stocks.
          </p>
        </div>

        {/* Telegram Configuration Card */}
        <div className="bg-surface-1 border border-surface-3 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <TelegramIcon />
              <h3 className="text-lg font-semibold text-text-primary">Telegram Alerts</h3>
            </div>
            {config && <StatusBadge enabled={config.enabled} />}
          </div>

          {configLoading ? (
            <div className="text-text-secondary py-4">Loading configuration...</div>
          ) : config && !showForm ? (
            /* Existing config display */
            <div>
              <div className="bg-surface-2 rounded-lg p-4 mb-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">
                      Bot Token
                    </div>
                    <div className="font-mono text-sm text-text-primary">
                      {config.bot_token_masked || "••••••"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">
                      Chat ID
                    </div>
                    <div className="font-mono text-sm text-text-primary">
                      {config.chat_id}
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-text-secondary">
                  Last updated: {config.updated_at || config.created_at || "Unknown"}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleToggle}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    config.enabled
                      ? "bg-alert/15 text-alert hover:bg-alert/25"
                      : "bg-bullish/15 text-bullish hover:bg-bullish/25"
                  }`}
                >
                  {config.enabled ? "Pause Alerts" : "Resume Alerts"}
                </button>
                <button
                  onClick={() => {
                    setShowForm(true);
                    setChatId(config.chat_id || "");
                    setBotToken("");
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-surface-2 text-text-primary hover:bg-surface-3 transition-colors"
                >
                  Edit Configuration
                </button>
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25 transition-colors disabled:opacity-50"
                >
                  {testing ? "Sending..." : "Send Test Alert"}
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-bearish/70 hover:text-bearish hover:bg-bearish/10 transition-colors"
                >
                  Remove
                </button>
              </div>

              {testResult && (
                <div
                  className={`mt-4 p-3 rounded-lg text-sm ${
                    testResult.success
                      ? "bg-bullish/10 text-bullish border border-bullish/20"
                      : "bg-bearish/10 text-bearish border border-bearish/20"
                  }`}
                >
                  {testResult.success
                    ? "✓ Test message sent successfully! Check your Telegram."
                    : `✗ ${testResult.error || testResult.message || "Failed to send test message"}`}
                </div>
              )}
            </div>
          ) : (
            /* Setup / Edit form */
            <div>
              <p className="text-text-secondary text-sm mb-4">
                {config
                  ? "Update your Telegram bot configuration below."
                  : "Connect a Telegram bot to receive real-time SMA crossover alerts."}
              </p>

              {/* Setup instructions */}
              {!config && (
                <div className="bg-surface-2 rounded-lg p-4 mb-4 text-sm">
                  <h4 className="font-semibold text-text-primary mb-2">
                    How to set up a Telegram bot:
                  </h4>
                  <ol className="list-decimal list-inside space-y-1.5 text-text-secondary">
                    <li>
                      Open Telegram and search for{" "}
                      <code className="bg-surface-3 px-1.5 py-0.5 rounded text-accent-blue">
                        @BotFather
                      </code>
                    </li>
                    <li>
                      Send{" "}
                      <code className="bg-surface-3 px-1.5 py-0.5 rounded text-accent-blue">
                        /newbot
                      </code>{" "}
                      and follow the prompts to create a bot
                    </li>
                    <li>Copy the Bot Token you receive</li>
                    <li>
                      Add your bot to a channel/group, or get your personal chat ID from{" "}
                      <code className="bg-surface-3 px-1.5 py-0.5 rounded text-accent-blue">
                        @userinfobot
                      </code>
                    </li>
                  </ol>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Bot Token {config && <span className="text-text-secondary/50">(enter new token to update)</span>}
                  </label>
                  <input
                    type="password"
                    placeholder={config ? "Enter new bot token to update..." : "e.g. 123456789:ABCdefGHIjklMNO..."}
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    className="w-full bg-surface-2 border border-surface-3 rounded-lg px-4 py-3 text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-blue font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Chat ID / Channel ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. -1001234567890 or 123456789"
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    className="w-full bg-surface-2 border border-surface-3 rounded-lg px-4 py-3 text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-blue font-mono text-sm"
                  />
                  <p className="text-xs text-text-secondary mt-1">
                    For channels, use the channel ID (starts with -100). For personal messages, use your user ID.
                  </p>
                </div>

                {error && (
                  <div className="p-3 rounded-lg text-sm bg-bearish/10 text-bearish border border-bearish/20">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="p-3 rounded-lg text-sm bg-bullish/10 text-bullish border border-bullish/20">
                    {success}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={handleTest}
                    disabled={testing || (!botToken.trim() && !config?.has_token)}
                    className="px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-2 text-text-primary hover:bg-surface-3 transition-colors disabled:opacity-50"
                  >
                    {testing ? "Sending..." : "Send Test Message"}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !botToken.trim() || !chatId.trim()}
                    className="px-6 py-2.5 rounded-lg text-sm font-medium bg-accent-blue hover:bg-accent-blue/90 text-white transition-colors disabled:opacity-50"
                  >
                    {saving ? "Saving..." : config ? "Update Configuration" : "Save & Enable Alerts"}
                  </button>
                  {config && (
                    <button
                      onClick={() => setShowForm(false)}
                      className="px-4 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {testResult && (
                  <div
                    className={`p-3 rounded-lg text-sm ${
                      testResult.success
                        ? "bg-bullish/10 text-bullish border border-bullish/20"
                        : "bg-bearish/10 text-bearish border border-bearish/20"
                    }`}
                  >
                    {testResult.success
                      ? "✓ Test message sent! Check your Telegram."
                      : `✗ ${testResult.error || testResult.message || "Failed to send"}`}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* How Alerts Work */}
        <div className="bg-surface-1 border border-surface-3 rounded-xl p-6 mb-6">
          <h3 className="text-lg font-semibold text-text-primary mb-3">How Alerts Work</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-surface-2 rounded-lg p-4">
              <div className="text-2xl mb-2">📊</div>
              <h4 className="font-semibold text-text-primary text-sm mb-1">Periodic Checks</h4>
              <p className="text-xs text-text-secondary">
                Every 15 minutes, the system checks each stock in your watchlist against its 200-day SMA.
              </p>
            </div>
            <div className="bg-surface-2 rounded-lg p-4">
              <div className="text-2xl mb-2">🔄</div>
              <h4 className="font-semibold text-text-primary text-sm mb-1">Crossover Detection</h4>
              <p className="text-xs text-text-secondary">
                When a stock's price crosses above or below its 200-day SMA, a crossover event is triggered.
              </p>
            </div>
            <div className="bg-surface-2 rounded-lg p-4">
              <div className="text-2xl mb-2">📱</div>
              <h4 className="font-semibold text-text-primary text-sm mb-1">Instant Telegram Alert</h4>
              <p className="text-xs text-text-secondary">
                You receive a Telegram message with the stock symbol, price, SMA value, and signal direction.
              </p>
            </div>
          </div>
        </div>

        {/* Alert History */}
        <div className="bg-surface-1 border border-surface-3 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Alert History</h3>

          {historyLoading ? (
            <div className="text-text-secondary py-4">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">🔕</div>
              <p className="text-text-secondary text-sm">
                No alerts sent yet. Alerts will appear here when a stock crosses its 200-day SMA.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between bg-surface-2 rounded-lg px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-lg ${
                        alert.cross_type === "bullish" ? "" : ""
                      }`}
                    >
                      {alert.cross_type === "bullish" ? "📈" : "📉"}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-text-primary">
                          {alert.symbol}
                        </span>
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            alert.cross_type === "bullish"
                              ? "bg-bullish/15 text-bullish"
                              : "bg-bearish/15 text-bearish"
                          }`}
                        >
                          {alert.cross_type === "bullish" ? "Bullish" : "Bearish"}
                        </span>
                        {alert.telegram_success ? (
                          <span className="text-xs text-bullish">✓ Sent</span>
                        ) : (
                          <span className="text-xs text-bearish">✗ Failed</span>
                        )}
                      </div>
                      <div className="text-xs text-text-secondary mt-0.5">
                        Price: ${alert.price?.toFixed(2)} · SMA: ${alert.sma_value?.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-text-secondary">{alert.sent_at}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
