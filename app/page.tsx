"use client";
import { useState, useEffect, useCallback } from "react";

export default function Home() {
  const [symbol, setSymbol] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lang, setLang] = useState<"vi" | "en">("vi");
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<any[]>([]);
  // Watchlist
  const [watchlist, setWatchlist] = useState<string[]>(["AAPL","NVDA","TSLA","MSFT","META"]);
  const [watchlistData, setWatchlistData] = useState<any[]>([]);
  const [watchInput, setWatchInput] = useState("");
  const [showWatchlist, setShowWatchlist] = useState(false);
  // Sector Rotation
  const [sectors, setSectors] = useState<any[]>([]);
  const [showSectors, setShowSectors] = useState(false);
  const [sectorsLoading, setSectorsLoading] = useState(false);
  // Market
  const [marketData, setMarketData] = useState<any>(null);

  const t = (vi: string, en: string) => lang === "vi" ? vi : en;

  // Load watchlist data
  const loadWatchlist = useCallback(async (syms: string[]) => {
    if (!syms.length) return;
    try {
      const res = await fetch(`/api/analyze?action=watchlist&symbols=${syms.join(",")}`);
      const data = await res.json();
      setWatchlistData(data.watchlist || []);
    } catch {}
  }, []);

  // Load sector rotation
  const loadSectors = async () => {
    setSectorsLoading(true);
    try {
      const res = await fetch("/api/analyze?action=sectors");
      const data = await res.json();
      setSectors(data.sectors || []);
    } catch {}
    setSectorsLoading(false);
  };

  // Load market data (VIX, Fear&Greed)
  const loadMarket = useCallback(async () => {
    try {
      const res = await fetch("/api/analyze?action=market");
      const data = await res.json();
      setMarketData(data);
    } catch {}
  }, []);

  useEffect(() => { loadWatchlist(watchlist); loadMarket(); }, []);
  useEffect(() => { if (showWatchlist) loadWatchlist(watchlist); }, [showWatchlist, watchlist]);
  useEffect(() => { if (showSectors && !sectors.length) loadSectors(); }, [showSectors]);

  const analyze = async (sym?: string) => {
    const s = (sym || symbol).toUpperCase();
    if (!s) return;
    if (sym) setSymbol(sym);
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: s }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResult(data);
    } catch { setError(t("Lỗi kết nối", "Connection error")); }
    setLoading(false);
  };

  const runScanner = async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/scanner");
      const data = await res.json();
      setScanResults(data.stocks || []);
    } catch {}
    setScanning(false);
  };

  const addToWatchlist = (sym: string) => {
    const s = sym.toUpperCase().trim();
    if (s && !watchlist.includes(s)) {
      const next = [...watchlist, s];
      setWatchlist(next);
      loadWatchlist(next);
    }
    setWatchInput("");
  };

  const removeFromWatchlist = (sym: string) => {
    const next = watchlist.filter(s => s !== sym);
    setWatchlist(next);
    setWatchlistData(prev => prev.filter(w => w.symbol !== sym));
  };

  const verdictColor: Record<string, string> = {
    "STRONG BUY": "bg-green-700", "BUY": "bg-green-500",
    "WATCH": "bg-yellow-500", "AVOID": "bg-orange-500", "STRONG AVOID": "bg-red-700",
  };

  const scoreColor = (s: number) =>
    s >= 80 ? "text-green-400" : s >= 68 ? "text-green-300" :
    s >= 55 ? "text-yellow-400" : s >= 40 ? "text-orange-400" : "text-red-400";

  const fearGreedColor = (score: number) =>
    score >= 75 ? "text-red-400" : score >= 55 ? "text-orange-400" :
    score >= 45 ? "text-yellow-400" : score >= 25 ? "text-green-400" : "text-green-300";

  const fearGreedLabel = (score: number) =>
    score >= 75 ? t("Cực kỳ tham lam", "Extreme Greed") :
    score >= 55 ? t("Tham lam", "Greed") :
    score >= 45 ? t("Trung lập", "Neutral") :
    score >= 25 ? t("Sợ hãi", "Fear") : t("Cực kỳ sợ hãi", "Extreme Fear");

  return (
    <div className="min-h-screen bg-gray-950 text-white p-3 font-sans">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-medium text-blue-400">Stock AI Advisor Pro</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {t("Phân tích chuyên sâu · Day Trade · Swing Trade · Sell Put", "Professional Analysis · Day Trade · Swing Trade · Sell Put")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Market pulse */}
            {marketData && (
              <div className="flex gap-2 text-xs">
                {marketData.vix && (
                  <div className="bg-gray-800 rounded px-2 py-1 border border-gray-700">
                    <span className="text-gray-500">VIX </span>
                    <span className={marketData.vix.value > 25 ? "text-red-400" : "text-green-400"}>
                      {marketData.vix.value?.toFixed(1)}
                    </span>
                  </div>
                )}
                {marketData.fearGreed && (
                  <div className="bg-gray-800 rounded px-2 py-1 border border-gray-700">
                    <span className="text-gray-500">F&G </span>
                    <span className={fearGreedColor(marketData.fearGreed.score)}>
                      {marketData.fearGreed.score}
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="flex rounded-lg overflow-hidden border border-gray-700">
              <button onClick={() => setLang("vi")} className={`px-4 py-2 text-sm font-bold tracking-wider ${lang === "vi" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-500"}`}>VN</button>
              <button onClick={() => setLang("en")} className={`px-4 py-2 text-sm font-bold tracking-wider ${lang === "en" ? "bg-amber-500 text-gray-900" : "bg-gray-800 text-gray-500"}`}>US</button>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="flex gap-2 mb-4">
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            placeholder={t("Nhập mã cổ phiếu (AAPL, NVDA, TSLA...)", "Enter stock symbol (AAPL, NVDA, TSLA...)")}
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && analyze()}
          />
          <button onClick={() => analyze()} disabled={loading} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-2.5 rounded-lg font-medium">
            {loading ? t("Đang phân tích...", "Analyzing...") : t("Phân tích", "Analyze")}
          </button>
        </div>

        {error && <div className="bg-red-900 border border-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>}

        {/* VIX + Fear & Greed panel */}
        {marketData && marketData.vix && (
          <div className="bg-gray-900 rounded-xl p-3 border border-gray-800 mb-4">
            <div className="text-xs font-medium text-gray-400 mb-2">📊 {t("TÂM LÝ THỊ TRƯỜNG", "MARKET SENTIMENT")}</div>
            <div className="grid grid-cols-2 gap-3">
              {marketData.vix && (
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">VIX — {t("Chỉ số biến động", "Volatility Index")}</div>
                  <div className={`text-2xl font-bold ${marketData.vix.value > 30 ? "text-red-400" : marketData.vix.value > 20 ? "text-yellow-400" : "text-green-400"}`}>
                    {marketData.vix.value?.toFixed(2)}
                  </div>
                  <div className={`text-xs mt-1 ${marketData.vix.changePct >= 0 ? "text-red-400" : "text-green-400"}`}>
                    {marketData.vix.changePct >= 0 ? "+" : ""}{marketData.vix.changePct?.toFixed(2)}%
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {marketData.vix.value > 30 ? t("⚠️ Thị trường sợ hãi cao — thận trọng", "⚠️ High fear — be cautious") :
                     marketData.vix.value > 20 ? t("⚡ Biến động trung bình", "⚡ Moderate volatility") :
                     t("✅ Thị trường ổn định", "✅ Market stable")}
                  </div>
                </div>
              )}
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">
                  Fear & Greed Index
                  {marketData.fearGreed?.source && <span className="ml-1 text-gray-600">({marketData.fearGreed.source})</span>}
                </div>
                {marketData.fearGreed ? (
                  <>
                    <div className={`text-2xl font-bold ${fearGreedColor(marketData.fearGreed.score)}`}>
                      {marketData.fearGreed.score}/100
                    </div>
                    <div className={`text-xs font-medium mt-1 ${fearGreedColor(marketData.fearGreed.score)}`}>
                      {fearGreedLabel(marketData.fearGreed.score)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {marketData.fearGreed.score < 25 ? t("🟢 Cơ hội mua — thị trường đang sợ", "🟢 Good buy — market fearful") :
                       marketData.fearGreed.score > 75 ? t("🔴 Thận trọng — thị trường tham lam", "🔴 Caution — market greedy") :
                       t("⚡ Tâm lý cân bằng", "⚡ Balanced sentiment")}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold text-gray-500">--</div>
                    <div className="text-xs text-gray-600 mt-1">{t("Đang tải...", "Loading...")}</div>
                    <a href="https://edition.cnn.com/markets/fear-and-greed" target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 mt-1 block">
                      → {t("Xem tại CNN", "View on CNN")}
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Watchlist */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 mb-4 overflow-hidden">
          <button onClick={() => setShowWatchlist(!showWatchlist)}
            className="w-full flex justify-between items-center p-3 text-xs font-medium text-gray-400 hover:text-white">
            <span>⭐ {t("DANH MỤC THEO DÕI", "WATCHLIST")} ({watchlist.length})</span>
            <span>{showWatchlist ? "▲" : "▼"}</span>
          </button>
          {showWatchlist && (
            <div className="p-3 pt-0 border-t border-gray-800">
              {/* Add symbol */}
              <div className="flex gap-2 mb-3">
                <input
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                  placeholder={t("Thêm mã...", "Add symbol...")}
                  value={watchInput}
                  onChange={e => setWatchInput(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === "Enter" && addToWatchlist(watchInput)}
                />
                <button onClick={() => addToWatchlist(watchInput)}
                  className="bg-blue-700 hover:bg-blue-600 px-3 py-1.5 rounded text-xs font-medium">
                  + {t("Thêm", "Add")}
                </button>
                <button onClick={() => loadWatchlist(watchlist)}
                  className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded text-xs">
                  🔄
                </button>
              </div>
              {/* Watchlist table */}
              {watchlistData.length > 0 ? (
                <div className="grid grid-cols-5 gap-2">
                  {watchlistData.map((w: any) => (
                    <div key={w.symbol}
                      className="bg-gray-800 rounded-lg p-2 border border-gray-700 hover:border-blue-600 cursor-pointer relative group"
                      onClick={() => analyze(w.symbol)}>
                      <button onClick={e => { e.stopPropagation(); removeFromWatchlist(w.symbol); }}
                        className="absolute top-1 right-1 text-gray-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100">✕</button>
                      <div className="text-sm font-bold text-white">{w.symbol}</div>
                      <div className="text-xs font-medium text-blue-300 mt-0.5">${w.price?.toFixed(2)}</div>
                      <div className={`text-xs mt-0.5 ${w.changePct >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {w.changePct >= 0 ? "+" : ""}{w.changePct?.toFixed(2)}%
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-500 text-center py-2">{t("Đang tải dữ liệu...", "Loading...")}</div>
              )}
            </div>
          )}
        </div>

        {/* Sector Rotation */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 mb-4 overflow-hidden">
          <button onClick={() => setShowSectors(!showSectors)}
            className="w-full flex justify-between items-center p-3 text-xs font-medium text-gray-400 hover:text-white">
            <span>🔄 {t("LUÂN CHUYỂN NGÀNH 2-4 TUẦN TỚI", "SECTOR ROTATION NEXT 2-4 WEEKS")}</span>
            <span>{showSectors ? "▲" : "▼"}</span>
          </button>
          {showSectors && (
            <div className="p-3 pt-0 border-t border-gray-800">
              {sectorsLoading ? (
                <div className="text-xs text-gray-500 text-center py-3">{t("Đang tải dữ liệu ngành...", "Loading sector data...")}</div>
              ) : sectors.length > 0 ? (
                <>
                  {/* AI Sector Rotation advice from result */}
                  {result?.sectorRotationAdvice && (
                    <div className="bg-purple-950 rounded-lg p-3 border border-purple-800 mb-3">
                      <div className="text-xs text-purple-400 font-medium mb-1">🤖 {t("AI DỰ BÁO DÒNG TIỀN", "AI MONEY FLOW FORECAST")}</div>
                      <div className="text-xs text-gray-200 leading-relaxed">{result.sectorRotationAdvice}</div>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {sectors.map((s: any) => (
                      <div key={s.symbol} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          s.trend === "rotating-in" ? "bg-green-400" :
                          s.trend === "rotating-out" ? "bg-red-400" : "bg-gray-500"}`} />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-white">{lang === "vi" ? s.nameVi : s.name}</span>
                          <span className="text-xs text-gray-500 ml-1">({s.symbol})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="hidden sm:flex gap-1">
                            {(s.topStocks || []).map((ts: string) => (
                              <button key={ts} onClick={() => analyze(ts)}
                                className="text-xs text-blue-400 hover:text-blue-300 bg-blue-900/30 px-1.5 py-0.5 rounded">
                                {ts}
                              </button>
                            ))}
                          </div>
                          <span className={`text-xs font-bold w-14 text-right ${s.perf5d >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {s.perf5d >= 0 ? "+" : ""}{s.perf5d?.toFixed(2)}%
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded w-20 text-center ${
                            s.trend === "rotating-in" ? "bg-green-900 text-green-300" :
                            s.trend === "rotating-out" ? "bg-red-900 text-red-300" : "bg-gray-700 text-gray-400"}`}>
                            {s.trend === "rotating-in" ? t("↑ Vào", "↑ Inflow") :
                             s.trend === "rotating-out" ? t("↓ Ra", "↓ Outflow") : t("Ổn định", "Stable")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-gray-600 mt-2 text-center">
                    {t("Dựa trên hiệu suất 5 ngày · Cập nhật theo yêu cầu", "Based on 5-day performance · Updated on demand")}
                  </div>
                </>
              ) : (
                <button onClick={loadSectors} className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-xs text-gray-400">
                  {t("Tải dữ liệu ngành", "Load sector data")}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Scanner */}
        <div className="bg-gray-900 rounded-xl p-3 border border-gray-800 mb-4">
          <div className="flex justify-between items-center mb-2">
            <div className="text-xs font-medium text-gray-400">
              {t("STOCK SCANNER — Cổ phiếu tốt nhất hôm nay (Điểm 75-100)", "STOCK SCANNER — Best stocks today (Score 75-100)")}
            </div>
            <button onClick={runScanner} disabled={scanning} className="bg-blue-800 hover:bg-blue-700 disabled:opacity-50 px-3 py-1 rounded text-xs font-medium">
              {scanning ? t("Đang quét...", "Scanning...") : t("Quét ngay", "Scan Now")}
            </button>
          </div>
          {scanResults.length > 0 ? (
            <div className="grid grid-cols-5 gap-2">
              {scanResults.slice(0, 10).map((s: any) => (
                <button key={s.symbol} onClick={() => analyze(s.symbol)}
                  className="bg-gray-800 hover:bg-gray-700 rounded-lg p-2 text-left border border-gray-700 hover:border-blue-600 transition-colors">
                  <div className="font-medium text-sm">{s.symbol}</div>
                  <div className="text-xs text-green-400">{lang === "vi" ? s.verdictVi : s.verdict}</div>
                  <div className="text-xs mt-1">${s.price}</div>
                  <div className="text-xs text-gray-400">SP: {s.sellPutSafe ? t("An toàn", "Safe") : t("Cẩn thận", "Caution")}</div>
                  <div className="bg-green-800 text-xs px-1.5 py-0.5 rounded mt-1 inline-block font-medium">{s.score}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-500 text-center py-2">
              {t("Bấm 'Quét ngay' để tìm cổ phiếu tốt nhất — mất khoảng 30-60 giây", "Click 'Scan Now' to find best stocks — takes about 30-60 seconds")}
            </div>
          )}
        </div>

        {result && (
          <div className="space-y-3">

            {/* Row 1: Price + Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-3xl font-medium">{result.symbol}</div>
                    {result.companyName && result.companyName !== result.symbol && (
                      <div className="text-xs text-gray-400 mt-0.5">{result.companyName}</div>
                    )}
                    {result.sector && result.sector !== "N/A" && (
                      <div className="text-xs text-gray-600">{result.sector} · {result.industry}</div>
                    )}
                    <div className="text-2xl font-medium text-green-400 mt-1">${result.price}</div>
                    {result.afterHoursPrice && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        <span className="bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded text-xs mr-1">
                          {result.afterHoursLabel || t("Ngoài giờ", "After-hours")}
                        </span>
                        <span className={parseFloat(result.afterHoursPct) >= 0 ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
                          ${result.afterHoursPrice} ({parseFloat(result.afterHoursPct) >= 0 ? "+" : ""}{result.afterHoursPct}%)
                        </span>
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">{result.actionVi || result.action}</div>
                  </div>
                  <div className="text-right">
                    <span className={`${verdictColor[result.verdict] || "bg-gray-700"} text-white px-3 py-1.5 rounded-lg text-sm font-bold`}>
                      {lang === "vi" ? result.verdictVi : result.verdict}
                    </span>
                    <div className="mt-1">
                      <div className={`text-xl font-bold ${scoreColor(result.aiScore || result.score)}`}>{result.aiScore || result.score}/100</div>
                      <div className="text-xs text-gray-500">{t("AI Score", "AI Score")}</div>
                    </div>
                    {result.aiConfidence && (
                      <div className="text-xs text-purple-400 mt-1">🤖 {t("Độ tin:", "Conf:")} {result.aiConfidence}</div>
                    )}
                  </div>
                </div>
                {/* Company quick stats */}
                {result.peRatio && (
                  <div className="grid grid-cols-3 gap-1.5 mb-2">
                    {[
                      ["P/E", result.peRatio],
                      [t("52W Cao", "52W High"), result.week52High ? "$"+result.week52High : "N/A"],
                      [t("52W Thấp", "52W Low"), result.week52Low ? "$"+result.week52Low : "N/A"],
                    ].map(([k,v],i) => (
                      <div key={i} className="bg-gray-800 rounded p-1.5 text-center">
                        <div className="text-xs text-gray-500">{k}</div>
                        <div className="text-xs font-medium">{v}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-800 rounded-lg p-2">
                    <div className="text-xs text-gray-500">{t("5 ngày", "5 days")}</div>
                    <div className={`text-sm font-medium ${parseFloat(result.indicators.perf5d) >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {parseFloat(result.indicators.perf5d) >= 0 ? "+" : ""}{result.indicators.perf5d}%
                    </div>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-2">
                    <div className="text-xs text-gray-500">{t("20 ngày", "20 days")}</div>
                    <div className={`text-sm font-medium ${parseFloat(result.indicators.perf20d) >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {parseFloat(result.indicators.perf20d) >= 0 ? "+" : ""}{result.indicators.perf20d}%
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-900 rounded-xl p-4 border-2 border-blue-800 space-y-2">
                <div className="text-xs font-medium text-blue-400 mb-2">{t("TỔNG KẾT KHUYẾN NGHỊ", "ACTION SUMMARY")}</div>
                {[
                  { labelVi: "MUA CỔ PHIẾU", labelEn: "BUY SHARES", subVi: `Vào $${result.trading.entry} · Stop $${result.trading.stopLoss}`, subEn: `Entry $${result.trading.entry} · Stop $${result.trading.stopLoss}`, ok: (result.aiScore || result.score) >= 68 },
                  { labelVi: "SELL PUT", labelEn: "SELL PUT", subVi: result.sellPutAI || result.sellPut.timing, subEn: result.sellPutAI || result.sellPut.timing, ok: result.sellPut.safe },
                  { labelVi: "SELL CALL", labelEn: "SELL CALL", subVi: result.sellCallAI || "Không nên Sell Call", subEn: result.sellCallAI || "Not recommended", ok: result.sellCall.safe },
                  { labelVi: "SHORT / BÁN KHỐNG", labelEn: "SHORT / SELL SHORT", subVi: "Chỉ khi score < 40", subEn: "Only when score < 40", ok: (result.aiScore || result.score) < 40 },
                ].map((item, i) => (
                  <div key={i} className={`flex justify-between items-center rounded-lg px-3 py-2 ${item.ok ? "bg-green-950 border border-green-800" : "bg-red-950 border border-red-900"}`}>
                    <div>
                      <div className={`text-xs font-bold ${item.ok ? "text-green-400" : "text-red-400"}`}>{lang === "vi" ? item.labelVi : item.labelEn}</div>
                      <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{lang === "vi" ? item.subVi : item.subEn}</div>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded flex-shrink-0 ml-2 ${item.ok ? "bg-green-700 text-white" : "bg-red-900 text-red-300"}`}>
                      {item.ok ? t("NÊN", "YES") : t("KHÔNG", "NO")}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Trading Plan */}
            <div className="bg-gray-900 rounded-xl p-4 border border-blue-900">
              <div className="text-xs font-medium text-blue-400 mb-3">{t("KẾ HOẠCH GIAO DỊCH — Giá vào và mục tiêu", "TRADING PLAN — Entry and targets")}</div>
              <div className="grid grid-cols-6 gap-2">
                {[
                  { labelVi: "Cắt lỗ", labelEn: "Stop Loss", val: "$" + result.trading.stopLoss, sub: (((parseFloat(result.trading.stopLoss) - parseFloat(result.price)) / parseFloat(result.price)) * 100).toFixed(1) + "%", cls: "bg-red-950 border-red-800 text-red-300" },
                  { labelVi: "Vào lệnh", labelEn: "Entry", val: "$" + result.trading.entry, sub: t("Hiện tại", "Current"), cls: "bg-blue-950 border-blue-800 text-blue-300" },
                  { labelVi: "Mục tiêu 1", labelEn: "Target 1", val: "$" + result.trading.target1, sub: "+5% · " + t("Chốt 30%", "Take 30%"), cls: "bg-green-950 border-green-900 text-green-300" },
                  { labelVi: "Mục tiêu 2 ★", labelEn: "Target 2 ★", val: "$" + result.trading.target2, sub: "+10% · " + t("Chốt 40%", "Take 40%"), cls: "bg-green-950 border-green-900 text-green-300" },
                  { labelVi: "Mục tiêu 3", labelEn: "Target 3", val: "$" + result.trading.target3, sub: "+15% · " + t("Chốt 30%", "Take 30%"), cls: "bg-green-950 border-green-900 text-green-300" },
                  { labelVi: "Dài hạn", labelEn: "Long term", val: "$" + result.trading.targetLong, sub: "+30% · 6-12" + t("th", "mo"), cls: "bg-blue-950 border-blue-900 text-blue-300" },
                ].map((item, i) => (
                  <div key={i} className={`${item.cls} border rounded-lg p-2.5 text-center`}>
                    <div className="text-xs opacity-70">{lang === "vi" ? item.labelVi : item.labelEn}</div>
                    <div className="text-sm font-bold mt-1">{item.val}</div>
                    <div className="text-xs opacity-60 mt-0.5">{item.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* GROQ AI — Verdict cuối cùng */}
            {(result.groqSummary || result.groqAdvice || result.groqRisk) && (
              <div className="bg-gradient-to-r from-purple-950 to-blue-950 rounded-xl p-4 border border-purple-700">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-purple-400 text-base">🤖</span>
                  <div className="text-xs font-bold text-purple-300 uppercase tracking-wider">
                    {t("GROQ AI · KẾT LUẬN CUỐI CÙNG (Kỹ thuật + Cơ bản + Tâm lý + Ngành)", "GROQ AI · FINAL VERDICT (Technical + Fundamental + Sentiment + Sector)")}
                  </div>
                  <span className="text-xs bg-purple-800 text-purple-300 px-2 py-0.5 rounded-full ml-auto">Llama 3.3 70B</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {result.groqSummary && (
                    <div className="bg-purple-900/40 rounded-lg p-3 border border-purple-800/50">
                      <div className="text-xs text-purple-400 font-medium mb-1">📊 {t("Phân tích tổng hợp", "Market Summary")}</div>
                      <div className="text-xs text-gray-200 leading-relaxed">{result.groqSummary}</div>
                    </div>
                  )}
                  {result.groqAdvice && (
                    <div className="bg-green-900/30 rounded-lg p-3 border border-green-800/50">
                      <div className="text-xs text-green-400 font-medium mb-1">💡 {t("Lời khuyên hành động", "Action Advice")}</div>
                      <div className="text-xs text-gray-200 leading-relaxed">{result.groqAdvice}</div>
                    </div>
                  )}
                  {result.groqRisk && (
                    <div className="bg-red-900/30 rounded-lg p-3 border border-red-800/50">
                      <div className="text-xs text-red-400 font-medium mb-1">⚠️ {t("Rủi ro chính", "Key Risks")}</div>
                      <div className="text-xs text-gray-200 leading-relaxed">{result.groqRisk}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Buy/Avoid/SellPut */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-950 rounded-xl p-3 border border-green-900">
                <div className="text-xs font-medium text-green-400 mb-2">{t("TẠI SAO NÊN MUA?", "WHY BUY?")}</div>
                <div className="space-y-1.5">
                  {result.reasons_buy.map((r: string, i: number) => (
                    <div key={i} className="flex gap-1.5 items-start">
                      <span className="text-green-400 text-xs flex-shrink-0 mt-0.5">✓</span>
                      <span className="text-xs text-green-100 leading-relaxed">{r}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-red-950 rounded-xl p-3 border border-red-900">
                <div className="text-xs font-medium text-red-400 mb-2">{t("TẠI SAO KHÔNG NÊN MUA?", "WHY NOT BUY?")}</div>
                <div className="space-y-1.5">
                  {result.reasons_avoid.map((r: string, i: number) => (
                    <div key={i} className="flex gap-1.5 items-start">
                      <span className="text-red-400 text-xs flex-shrink-0 mt-0.5">✗</span>
                      <span className="text-xs text-red-100 leading-relaxed">{r}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`rounded-xl p-3 border ${result.sellPut.safe ? "bg-green-950 border-green-800" : "bg-gray-900 border-gray-800"}`}>
                <div className="text-xs font-medium text-green-400 mb-2">SELL PUT {t("CHI TIẾT", "DETAILS")}</div>
                <div className={`text-sm font-bold mb-2 ${result.sellPut.safe ? "text-green-300" : "text-red-400"}`}>{result.sellPut.recommendation}</div>
                <div className="space-y-1 text-xs">
                  {[
                    [t("Thời gian", "Timing"), result.sellPut.timing],
                    [t("Strike thận trọng", "Conservative"), "$" + result.sellPut.strikeConservative],
                    [t("Strike ATR", "ATR strike"), "$" + result.sellPut.strikeATR],
                    ["IV Rank", result.sellPut.ivRank + "%"],
                    [t("Hỗ trợ", "Support"), "$" + result.indicators.support],
                    [t("Kháng cự", "Resistance"), "$" + result.indicators.resistance],
                  ].map(([k, v], i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-gray-400">{k}</span>
                      <span className="text-white font-medium">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Indicators */}
            <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
              <div className="text-xs font-medium text-gray-400 mb-2">{t("CHỈ BÁO KỸ THUẬT ĐẦY ĐỦ (18 chỉ báo)", "FULL TECHNICAL INDICATORS (18)")}</div>
              <div className="grid grid-cols-6 gap-2">
                {[
                  { label: "RSI 14", value: result.indicators.rsi, color: parseFloat(result.indicators.rsi) < 30 ? "text-green-400" : parseFloat(result.indicators.rsi) > 70 ? "text-red-400" : "text-white" },
                  { label: "Stoch RSI", value: result.indicators.stochRSI, color: parseFloat(result.indicators.stochRSI) < 20 ? "text-green-400" : parseFloat(result.indicators.stochRSI) > 80 ? "text-red-400" : "text-white" },
                  { label: "MA20", value: "$" + result.indicators.ma20 },
                  { label: "MA50", value: "$" + result.indicators.ma50 },
                  { label: "MA200", value: result.indicators.ma200 === "N/A" ? "N/A" : "$" + result.indicators.ma200 },
                  { label: "EMA9", value: "$" + result.indicators.ema9 },
                  { label: "EMA21", value: "$" + result.indicators.ema21 },
                  { label: "MACD", value: result.indicators.macd, color: parseFloat(result.indicators.macd) > 0 ? "text-green-400" : "text-red-400" },
                  { label: t("BB Trên", "BB Upper"), value: "$" + result.indicators.bbUpper },
                  { label: t("BB Giữa", "BB Mid"), value: "$" + result.indicators.bbMiddle },
                  { label: t("BB Dưới", "BB Lower"), value: "$" + result.indicators.bbLower },
                  { label: "ATR", value: "$" + result.indicators.atr },
                  { label: "ADX", value: result.indicators.adx, color: parseFloat(result.indicators.adx) > 25 ? "text-green-400" : "text-yellow-400" },
                  { label: "DI+", value: result.indicators.diPlus, color: "text-green-400" },
                  { label: "DI-", value: result.indicators.diMinus, color: "text-red-400" },
                  { label: "OBV", value: result.indicators.obvTrend, color: result.indicators.obvTrend === "bullish" ? "text-green-400" : "text-red-400" },
                  { label: "IV Rank", value: result.indicators.ivRank + "%", color: parseFloat(result.indicators.ivRank) > 50 ? "text-green-400" : "text-yellow-400" },
                  { label: t("Vol Ratio", "Vol Ratio"), value: result.indicators.volumeRatio + "x", color: parseFloat(result.indicators.volumeRatio) > 1.5 ? "text-green-400" : "text-white" },
                ].map((item, i) => (
                  <div key={i} className="bg-gray-800 rounded-lg p-2">
                    <div className="text-xs text-gray-500">{item.label}</div>
                    <div className={`text-xs font-medium mt-0.5 ${item.color || "text-white"}`}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Volume + Signals */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
                <div className="text-xs font-medium text-gray-400 mb-2">{t("VOLUME MUA/BÁN TRONG NGÀY", "BUY/SELL VOLUME TODAY")}</div>
                <div className="space-y-2">
                  <div className="flex gap-2 items-center">
                    <span className="text-xs text-green-400 w-8">{t("Mua", "Buy")}</span>
                    <div className="flex-1 bg-gray-800 rounded h-4 overflow-hidden">
                      <div className="bg-green-700 h-4 rounded flex items-center pl-2" style={{ width: result.indicators.buyPct + "%" }}>
                        <span className="text-xs font-medium">{result.indicators.buyPct}%</span>
                      </div>
                    </div>
                    <span className="text-xs text-green-400 w-16 text-right">{result.indicators.buyVolume}</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="text-xs text-red-400 w-8">{t("Bán", "Sell")}</span>
                    <div className="flex-1 bg-gray-800 rounded h-4 overflow-hidden">
                      <div className="bg-red-800 h-4 rounded flex items-center pl-2" style={{ width: (100 - result.indicators.buyPct) + "%" }}>
                        <span className="text-xs font-medium">{100 - result.indicators.buyPct}%</span>
                      </div>
                    </div>
                    <span className="text-xs text-red-400 w-16 text-right">{result.indicators.sellVolume}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-800 rounded p-2">
                      <div className="text-xs text-gray-500">{t("Tổng vol", "Total vol")}</div>
                      <div className="text-xs font-medium">{result.indicators.volume}</div>
                    </div>
                    <div className="bg-gray-800 rounded p-2">
                      <div className="text-xs text-gray-500">{t("TB 20 ngày", "20D avg")}</div>
                      <div className="text-xs font-medium">{result.indicators.avgVolume}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
                <div className="text-xs font-medium text-gray-400 mb-2">{t("TÍN HIỆU GIAO DỊCH", "TRADING SIGNALS")}</div>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {result.signals.map((signal: string, i: number) => {
                    const isBull = signal.includes("bullish") || signal.includes("above") || signal.includes("golden") || signal.includes("oversold") || signal.includes("strong") || signal.includes("high volume");
                    return (
                      <div key={i} className={`flex items-start gap-1.5 p-1.5 rounded text-xs ${isBull ? "bg-green-950 text-green-300" : "bg-red-950 text-red-300"}`}>
                        <span className="flex-shrink-0">{isBull ? "✓" : "✗"}</span>
                        <span>{signal}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Company Info thật + Targets */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
                <div className="text-xs font-medium text-blue-400 mb-2">{t("THÔNG TIN CÔNG TY THẬT", "REAL COMPANY INFO")}</div>
                {result.companyName ? (
                  <>
                    <div className="text-sm font-medium text-blue-300 mb-0.5">{result.companyName}</div>
                    <div className="text-xs text-gray-500 mb-2">{result.sector} · {result.industry}</div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      {[
                        [t("Vốn hóa", "Market Cap"), result.marketCap ? "$" + (result.marketCap/1e9).toFixed(1) + "B" : "N/A"],
                        ["P/E", result.peRatio || "N/A"],
                        [t("Giá mục tiêu", "Target Price"), result.targetPrice ? "$" + result.targetPrice : "N/A"],
                        [t("Cổ tức", "Dividend"), result.dividendYield ? result.dividendYield + "%" : "0%"],
                      ].map(([k, v], i) => (
                        <div key={i} className="bg-gray-800 rounded p-2">
                          <div className="text-xs text-gray-500">{k}</div>
                          <div className="text-xs font-medium">{v}</div>
                        </div>
                      ))}
                    </div>
                    {result.description && (
                      <div className="bg-gray-800 rounded p-2">
                        <div className="text-xs text-gray-500 mb-1">{t("Về công ty", "About")}</div>
                        <div className="text-xs text-gray-300 leading-relaxed line-clamp-4">{result.description}</div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-xs text-gray-500">{t("Không có dữ liệu công ty", "No company data")}</div>
                )}
              </div>

              <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
                <div className="text-xs font-medium text-gray-400 mb-2">{t("MỤC TIÊU THEO THỜI GIAN", "TARGETS BY TIMEFRAME")}</div>
                <div className="space-y-2 mb-3">
                  {[
                    { labelVi: "Day Trade (1 ngày)", labelEn: "Day Trade (1 day)", target: "$" + (parseFloat(result.price) * 1.02).toFixed(2), pct: "+1% ~ +2%", color: "text-yellow-400", star: false },
                    { labelVi: "Swing Trade (5-15 ngày) ★", labelEn: "Swing Trade (5-15 days) ★", target: "$" + result.trading.target1 + " ~ $" + result.trading.target2, pct: "+5% ~ +10%", color: "text-green-400", star: true },
                    { labelVi: "Ngắn hạn (1-3 tháng)", labelEn: "Short term (1-3 months)", target: "$" + result.trading.target2 + " ~ $" + result.trading.target3, pct: "+10% ~ +15%", color: "text-green-400", star: false },
                    { labelVi: "Dài hạn (6-12 tháng)", labelEn: "Long term (6-12 months)", target: "$" + result.trading.targetLong, pct: "+30%", color: "text-blue-400", star: false },
                  ].map((item, i) => (
                    <div key={i} className={`flex justify-between items-center rounded-lg p-2.5 ${item.star ? "bg-green-950 border border-green-900" : "bg-gray-800"}`}>
                      <div className={`text-xs ${item.star ? "text-green-300 font-medium" : "text-gray-300"}`}>{lang === "vi" ? item.labelVi : item.labelEn}</div>
                      <div className="text-right">
                        <div className={`text-xs font-medium ${item.color}`}>{item.target}</div>
                        <div className="text-xs text-gray-500">{item.pct}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-800 pt-3">
                  <div className="text-xs font-medium text-gray-400 mb-2">{t("PHÂN TÍCH ĐIỂM SỐ", "SCORE BREAKDOWN")}</div>
                  <div className="space-y-1.5">
                    {[
                      [t("Kỹ thuật (18 chỉ báo)", "Technical (18)"), result.score, "#3b82f6"],
                      [t("AI tổng hợp", "AI Combined"), result.aiScore || result.score, "#a855f7"],
                      [t("Thị trường", "Market"), parseFloat(result.indicators.adx) > 25 ? 75 : 55, "#fbbf24"],
                      [t("Momentum", "Momentum"), parseFloat(result.indicators.stochRSI) < 50 ? 80 : 50, "#4ade80"],
                    ].map(([label, val, color], i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <div className="text-xs text-gray-500 w-28">{label as string}</div>
                        <div className="flex-1 bg-gray-800 rounded h-3 overflow-hidden">
                          <div className="h-3 rounded" style={{ width: (val as number) + "%", background: color as string }} />
                        </div>
                        <div className="text-xs font-medium w-8 text-right">{val as number}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Tin tức thật */}
            {result.news && result.news.length > 0 && (
              <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
                <div className="text-xs font-medium text-gray-400 mb-2">
                  📰 {t(`TIN TỨC THẬT — ${result.symbol}`, `REAL NEWS — ${result.symbol}`)}
                </div>
                <div className="space-y-2">
                  {result.news.map((item: any, i: number) => (
                    <a key={i} href={item.url} target="_blank" rel="noopener noreferrer"
                      className={`block bg-gray-800 rounded-lg p-3 border-l-2 hover:bg-gray-700 transition-colors ${
                        item.sentiment === "positive" ? "border-green-500" :
                        item.sentiment === "negative" ? "border-red-500" : "border-yellow-500"}`}>
                      <div className="text-xs font-medium text-gray-100 mb-1 hover:text-white">
                        {lang === "vi" && item.titleVi ? item.titleVi : item.title}
                      </div>
                      {lang === "vi" && item.titleVi && (
                        <div className="text-xs text-gray-600 mt-0.5 italic">{item.title}</div>
                      )}
                      <div className="flex justify-between items-center">
                        <div className="text-xs text-gray-500">{item.source} · {new Date(item.publishedAt).toLocaleDateString()}</div>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          item.sentiment === "positive" ? "bg-green-900 text-green-300" :
                          item.sentiment === "negative" ? "bg-red-900 text-red-300" : "bg-yellow-900 text-yellow-300"}`}>
                          {item.sentiment === "positive" ? t("Tích cực", "Positive") :
                           item.sentiment === "negative" ? t("Tiêu cực", "Negative") : t("Trung lập", "Neutral")}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}