"use client";
import { useState } from "react";

export default function Home() {
  const [symbol, setSymbol] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lang, setLang] = useState<"vi" | "en">("vi");
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<any[]>([]);

  const t = (vi: string, en: string) => lang === "vi" ? vi : en;

  const analyze = async (sym?: string) => {
    const s = sym || symbol;
    if (!s) return;
    if (sym) setSymbol(sym);
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: s }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResult(data);
    } catch {
      setError(t("Lỗi kết nối", "Connection error"));
    }
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

  const verdictColor: Record<string, string> = {
    "STRONG BUY": "bg-green-700",
    "BUY": "bg-green-500",
    "WATCH": "bg-yellow-500",
    "AVOID": "bg-orange-500",
    "STRONG AVOID": "bg-red-700",
  };

  const scoreColor = (s: number) =>
    s >= 80 ? "text-green-400" : s >= 68 ? "text-green-300" :
    s >= 55 ? "text-yellow-400" : s >= 40 ? "text-orange-400" : "text-red-400";

  const companyInfo: Record<string, any> = {
    NVDA: { name: "NVIDIA Corporation", sector: t("Bán dẫn · AI · Công nghệ", "Semiconductors · AI · Tech"), cap: "$3.2T", pe: "65x", rev: "$96.3B", profit: "$53.0B", desc: t("NVIDIA dẫn đầu chip AI với GPU H100/H200. Doanh thu tăng 122% YoY. Kiến trúc Blackwell tạo động lực tăng trưởng mạnh 2025-2026. Độc quyền thị trường AI datacenter.", "NVIDIA leads AI chips with H100/H200 GPUs. Revenue up 122% YoY. Blackwell architecture drives strong growth 2025-2026. Dominates AI datacenter market."), growth: 5, compete: 4, risk: 3, potential: 5 },
    AAPL: { name: "Apple Inc.", sector: t("Công nghệ · Điện thoại · Dịch vụ", "Technology · Mobile · Services"), cap: "$3.0T", pe: "32x", rev: "$383B", profit: "$97B", desc: t("Apple dẫn đầu thị trường smartphone cao cấp. Mảng Services tăng trưởng mạnh với biên lợi nhuận cao. Hệ sinh thái khép kín tạo khách hàng trung thành.", "Apple leads premium smartphone market. Services segment growing strongly with high margins. Closed ecosystem creates loyal customers."), growth: 4, compete: 5, risk: 2, potential: 4 },
    TSLA: { name: "Tesla Inc.", sector: t("Xe điện · Năng lượng · AI", "EV · Energy · AI"), cap: "$800B", pe: "70x", rev: "$97B", profit: "$7.9B", desc: t("Tesla dẫn đầu thị trường xe điện toàn cầu. FSD và Robotaxi là catalysts tăng trưởng lớn. Cạnh tranh từ BYD và xe điện Trung Quốc ngày càng tăng.", "Tesla leads global EV market. FSD and Robotaxi are major growth catalysts. Competition from BYD and Chinese EVs increasing."), growth: 4, compete: 3, risk: 4, potential: 5 },
    META: { name: "Meta Platforms Inc.", sector: t("Mạng xã hội · Quảng cáo · AI", "Social Media · Advertising · AI"), cap: "$1.6T", pe: "28x", rev: "$134B", profit: "$39B", desc: t("Meta thống trị mạng xã hội với Facebook, Instagram, WhatsApp. AI cải thiện quảng cáo đáng kể. Metaverse vẫn còn rủi ro dài hạn.", "Meta dominates social media with Facebook, Instagram, WhatsApp. AI significantly improving ads. Metaverse still a long-term risk."), growth: 4, compete: 4, risk: 2, potential: 4 },
    MSFT: { name: "Microsoft Corporation", sector: t("Cloud · AI · Phần mềm", "Cloud · AI · Software"), cap: "$3.1T", pe: "35x", rev: "$245B", profit: "$88B", desc: t("Microsoft dẫn đầu cloud với Azure. Tích hợp AI Copilot vào toàn bộ sản phẩm. Quan hệ OpenAI tạo lợi thế cạnh tranh dài hạn.", "Microsoft leads cloud with Azure. AI Copilot integrated across all products. OpenAI relationship creates long-term competitive advantage."), growth: 4, compete: 5, risk: 1, potential: 4 },
    PLTR: { name: "Palantir Technologies", sector: t("AI · Phân tích dữ liệu · Quốc phòng", "AI · Data Analytics · Defense"), cap: "$200B", pe: "280x", rev: "$2.8B", profit: "$450M", desc: t("Palantir dẫn đầu AI cho chính phủ và doanh nghiệp. AIP platform tăng trưởng nhanh. Định giá cao là rủi ro lớn nhất.", "Palantir leads AI for government and enterprise. AIP platform growing rapidly. High valuation is biggest risk."), growth: 5, compete: 4, risk: 4, potential: 5 },
    SPCX: { name: "SpaceX", sector: t("Tên lửa · Vệ tinh · AI · Starlink", "Rockets · Satellites · AI · Starlink"), cap: "$2.1T", pe: "N/A", rev: "$18.7B", profit: "-$4.2B", desc: t("SpaceX IPO tháng 6/2026. Dẫn đầu phóng tên lửa thương mại và Starlink. Starship là game-changer cho du hành vũ trụ. Còn lỗ nhưng tiềm năng rất lớn.", "SpaceX IPO June 2026. Leads commercial rocket launches and Starlink. Starship is a game-changer for space travel. Still losing money but huge potential."), growth: 5, compete: 5, risk: 4, potential: 5 },
  };

  const company = result ? (companyInfo[result.symbol] || null) : null;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-3 font-sans">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-medium text-blue-400">Stock AI Advisor Pro</h1>
            <p className="text-xs text-gray-500 mt-0.5">{t("Phân tích chuyên sâu · Day Trade · Swing Trade · Sell Put", "Professional Analysis · Day Trade · Swing Trade · Sell Put")}</p>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-gray-700">
            <button onClick={() => setLang("vi")} className={`px-4 py-2 text-sm font-bold tracking-wider ${lang === "vi" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-500"}`}>VN</button>
            <button onClick={() => setLang("en")} className={`px-4 py-2 text-sm font-bold tracking-wider ${lang === "en" ? "bg-amber-500 text-gray-900" : "bg-gray-800 text-gray-500"}`}>US</button>
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

        {/* Scanner */}
        <div className="bg-gray-900 rounded-xl p-3 border border-gray-800 mb-4">
          <div className="flex justify-between items-center mb-2">
            <div className="text-xs font-medium text-gray-400">{t("STOCK SCANNER — Cổ phiếu tốt nhất hôm nay (Điểm 80-100)", "STOCK SCANNER — Best stocks today (Score 80-100)")}</div>
            <button onClick={runScanner} disabled={scanning} className="bg-blue-800 hover:bg-blue-700 disabled:opacity-50 px-3 py-1 rounded text-xs font-medium">
              {scanning ? t("Đang quét...", "Scanning...") : t("Quét ngay", "Scan Now")}
            </button>
          </div>
          {scanResults.length > 0 ? (
            <div className="grid grid-cols-5 gap-2">
              {scanResults.slice(0, 10).map((s: any) => (
                <button key={s.symbol} onClick={() => analyze(s.symbol)} className="bg-gray-800 hover:bg-gray-700 rounded-lg p-2 text-left border border-gray-700 hover:border-blue-600 transition-colors">
                  <div className="font-medium text-sm">{s.symbol}</div>
                  <div className="text-xs text-green-400">{t("MUA MẠNH", "STRONG BUY")}</div>
                  <div className="text-xs mt-1">${s.price}</div>
                  <div className="text-xs text-gray-400">SP: {s.sellPutSafe ? t("An toàn", "Safe") : t("Cẩn thận", "Caution")}</div>
                  <div className="bg-green-800 text-xs px-1.5 py-0.5 rounded mt-1 inline-block font-medium">{s.score}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-500 text-center py-2">{t("Bấm 'Quét ngay' để tìm cổ phiếu tốt nhất hôm nay", "Click 'Scan Now' to find best stocks today")}</div>
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
                    <div className="text-2xl font-medium text-green-400 mt-0.5">${result.price}</div>
                    <div className="text-xs text-gray-500 mt-1">{lang === "vi" ? result.actionVi : result.action}</div>
                  </div>
                  <div className="text-right">
                    <span className={`${verdictColor[result.verdict] || "bg-gray-700"} text-white px-3 py-1.5 rounded-lg text-sm font-bold`}>
                      {lang === "vi" ? result.verdictVi : result.verdict}
                    </span>
                    <div className={`text-xl font-bold mt-2 ${scoreColor(result.score)}`}>{result.score}/100</div>
                    <div className="text-xs text-gray-500">{t("Điểm tổng", "Total score")}</div>
                  </div>
                </div>
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
                  { label: t("MUA CỔ PHIẾU", "BUY SHARES"), sub: t(`Vào $${result.trading.entry} · Stop $${result.trading.stopLoss}`, `Entry $${result.trading.entry} · Stop $${result.trading.stopLoss}`), ok: result.score >= 68 },
                  { label: "SELL PUT", sub: result.sellPut.timing, ok: result.sellPut.safe },
                  { label: "SELL CALL", sub: lang === "vi" ? result.sellCall.recommendation : result.sellCall.recommendation, ok: result.sellCall.safe },
                  { label: t("SHORT / BÁN KHỐNG", "SHORT / SELL SHORT"), sub: t("Chỉ khi score < 40", "Only when score < 40"), ok: result.score < 40 },
                ].map((item, i) => (
                  <div key={i} className={`flex justify-between items-center rounded-lg px-3 py-2 ${item.ok ? "bg-green-950 border border-green-800" : "bg-red-950 border border-red-900"}`}>
                    <div>
                      <div className={`text-xs font-bold ${item.ok ? "text-green-400" : "text-red-400"}`}>{item.label}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{item.sub}</div>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded ${item.ok ? "bg-green-700 text-white" : "bg-red-900 text-red-300"}`}>
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
                  { label: t("Cắt lỗ", "Stop Loss"), val: "$" + result.trading.stopLoss, sub: (((parseFloat(result.trading.stopLoss) - parseFloat(result.price)) / parseFloat(result.price)) * 100).toFixed(1) + "%", cls: "bg-red-950 border-red-800 text-red-300" },
                  { label: t("Vào lệnh", "Entry"), val: "$" + result.trading.entry, sub: t("Hiện tại", "Current"), cls: "bg-blue-950 border-blue-800 text-blue-300" },
                  { label: t("Mục tiêu 1", "Target 1"), val: "$" + result.trading.target1, sub: "+5% · " + t("Chốt 30%", "Take 30%"), cls: "bg-green-950 border-green-900 text-green-300" },
                  { label: t("Mục tiêu 2 ★", "Target 2 ★"), val: "$" + result.trading.target2, sub: "+10% · " + t("Chốt 40%", "Take 40%"), cls: "bg-green-950 border-green-900 text-green-300" },
                  { label: t("Mục tiêu 3", "Target 3"), val: "$" + result.trading.target3, sub: "+15% · " + t("Chốt 30%", "Take 30%"), cls: "bg-green-950 border-green-900 text-green-300" },
                  { label: t("Dài hạn", "Long term"), val: "$" + result.trading.targetLong, sub: "+30% · 6-12" + t("th", "mo"), cls: "bg-blue-950 border-blue-900 text-blue-300" },
                ].map((item, i) => (
                  <div key={i} className={`${item.cls} border rounded-lg p-2.5 text-center`}>
                    <div className="text-xs opacity-70">{item.label}</div>
                    <div className="text-sm font-bold mt-1">{item.val}</div>
                    <div className="text-xs opacity-60 mt-0.5">{item.sub}</div>
                  </div>
                ))}
              </div>
            </div>

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
                  {result.reasons_buy.length === 0 && <div className="text-xs text-gray-500">{t("Không có tín hiệu mua", "No buy signals")}</div>}
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
                  {result.reasons_avoid.length === 0 && <div className="text-xs text-gray-500">{t("Không có tín hiệu tránh", "No avoid signals")}</div>}
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
              <div className="text-xs font-medium text-gray-400 mb-2">{t("CHỈ BÁO KỸ THUẬT ĐẦY ĐỦ", "FULL TECHNICAL INDICATORS")}</div>
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
                  { label: "Vol Ratio", value: result.indicators.volumeRatio + "x", color: parseFloat(result.indicators.volumeRatio) > 1.5 ? "text-green-400" : "text-white" },
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
                  <div className="grid grid-cols-2 gap-2 mt-1">
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

            {/* Company Info */}
            {company && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
                  <div className="text-xs font-medium text-blue-400 mb-2">{t("THÔNG TIN CÔNG TY", "COMPANY INFO")}</div>
                  <div className="text-sm font-medium text-blue-300 mb-0.5">{company.name}</div>
                  <div className="text-xs text-gray-500 mb-3">{company.sector}</div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[
                      [t("Vốn hóa", "Market Cap"), company.cap],
                      ["P/E", company.pe],
                      [t("Doanh thu", "Revenue"), company.rev],
                      [t("Lợi nhuận", "Net Income"), company.profit],
                    ].map(([k, v], i) => (
                      <div key={i} className="bg-gray-800 rounded p-2">
                        <div className="text-xs text-gray-500">{k}</div>
                        <div className="text-xs font-medium">{v}</div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-gray-800 rounded p-2 mb-3">
                    <div className="text-xs text-gray-500 mb-1">{t("Phân tích chuyên sâu", "Deep analysis")}</div>
                    <div className="text-xs text-gray-200 leading-relaxed">{company.desc}</div>
                  </div>
                  <div className="space-y-1.5">
                    {[
                      [t("Tăng trưởng doanh thu", "Revenue growth"), company.growth, "green"],
                      [t("Vị thế cạnh tranh", "Competitive position"), company.compete, "green"],
                      [t("Rủi ro định giá", "Valuation risk"), company.risk, "red"],
                      [t("Tiềm năng AI dài hạn", "Long-term AI potential"), company.potential, "green"],
                    ].map(([label, score, color], i) => (
                      <div key={i} className="flex justify-between items-center">
                        <span className="text-xs text-gray-400">{label as string}</span>
                        <div className="flex gap-1">
                          {[1,2,3,4,5].map(n => (
                            <div key={n} className={`w-2 h-2 rounded-sm ${n <= (score as number) ? (color === "green" ? "bg-green-400" : "bg-red-400") : "bg-gray-700"}`} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
                  <div className="text-xs font-medium text-gray-400 mb-2">{t("MỤC TIÊU THEO THỜI GIAN", "TARGETS BY TIMEFRAME")}</div>
                  <div className="space-y-2">
                    {[
                      { label: t("Day Trade (1 ngày)", "Day Trade (1 day)"), target: "$" + (parseFloat(result.price) * 1.02).toFixed(2), pct: "+1% ~ +2%", color: "text-yellow-400", star: false },
                      { label: t("Swing (5-15 ngày) ★", "Swing (5-15 days) ★"), target: "$" + result.trading.target1 + " ~ $" + result.trading.target2, pct: "+5% ~ +10%", color: "text-green-400", star: true },
                      { label: t("Ngắn hạn (1-3 tháng)", "Short term (1-3 months)"), target: "$" + result.trading.target2 + " ~ $" + result.trading.target3, pct: "+10% ~ +15%", color: "text-green-400", star: false },
                      { label: t("Dài hạn (6-12 tháng)", "Long term (6-12 months)"), target: "$" + result.trading.targetLong, pct: "+30%", color: "text-blue-400", star: false },
                    ].map((item, i) => (
                      <div key={i} className={`flex justify-between items-center rounded-lg p-2.5 ${item.star ? "bg-green-950 border border-green-900" : "bg-gray-800"}`}>
                        <div className={`text-xs ${item.star ? "text-green-300 font-medium" : "text-gray-300"}`}>{item.label}</div>
                        <div className="text-right">
                          <div className={`text-xs font-medium ${item.color}`}>{item.target}</div>
                          <div className="text-xs text-gray-500">{item.pct}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 border-t border-gray-800 pt-3">
                    <div className="text-xs font-medium text-gray-400 mb-2">{t("TIỀM NĂNG ĐIỂM SỐ", "SCORE BREAKDOWN")}</div>
                    <div className="space-y-1.5">
                      {[
                        [t("Kỹ thuật", "Technical"), result.score, "#3b82f6"],
                        [t("Cơ bản", "Fundamental"), company ? Math.min(100, company.growth * 15 + company.compete * 5) : 50, "#4ade80"],
                        [t("Thị trường", "Market"), 65, "#fbbf24"],
                        [t("Momentum", "Momentum"), parseFloat(result.indicators.adx) > 25 ? 80 : 50, "#a78bfa"],
                      ].map(([label, val, color], i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <div className="text-xs text-gray-500 w-20">{label as string}</div>
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
            )}

          </div>
        )}
      </div>
    </div>
  );
}