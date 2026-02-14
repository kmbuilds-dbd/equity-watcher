import { Routes, Route } from "react-router-dom";
import Watchlist from "./pages/Watchlist";
import StockDetail from "./pages/StockDetail";
import Alerts from "./pages/Alerts";

export default function App() {
  return (
    <div className="min-h-screen bg-surface">
      <Routes>
        <Route path="/" element={<Watchlist />} />
        <Route path="/stock/:symbol" element={<StockDetail />} />
        <Route path="/alerts" element={<Alerts />} />
      </Routes>
    </div>
  );
}
