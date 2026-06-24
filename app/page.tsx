"use client";
import { useState } from "react";

export default function Home() {
  const [symbol, setSymbol] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lang, setLang] = useState<"vi" | "en">("vi");

  const t = (vi: string, en: string) => lang === "vi" ? vi : en;

  const analyze = async () => {
    if (!symbol) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResult(data);
    } catch {
      setError(t("Lỗi kết nối", "Connection error"));
    }
    setLoading(false);
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
          <button onClick={analyze} disabled={loading} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-2.5 rounded-lg font-medium">
            {loading ? t("Đang phân tích...", "Analyzing...") : t("Phân tích", "Analyze")}
          </button>
        </div>

        {error && <div className="bg-red-900 border border-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>}

        {result && (
          <div className="space-y-3">

            {/* Row 1: Main info + Summary */}
            <div className="grid grid-cols-2 gap-3">

              {/* Left: Price + Score */}
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

              {/* Right: Action Summary */}
              <div className="bg-gray-900 rounded-xl p-4 border-2 border-blue-800 space-y-2">
                <div className="text-sm font-medium text-blue-400 mb-2">{t("TỔNG KẾT KHUYẾN NGHỊ", "ACTION SUMMARY")}</div>
                {[
                  { label: t("MUA CỔ PHIẾU", "BUY SHARES"), sub: t(`Vào $${result.trading.entry} · Stop $${result.trading.stopLoss}`, `Entry $${result.trading.entry} · Stop $${result.trading.stopLoss}`), ok: result.score >= 68 },
                  { label: "SELL PUT", sub: result.sellPut.timing, ok: result.sellPut.safe },
                  { label: "SELL CALL", sub: t(result.sellCall.recommendation, result.sellCall.recommendation), ok: result.sellCall.safe },
                  { label: t("SHORT / BÁN KHỐNG", "SHORT / SELL SHORT"), sub: t("Chỉ khi score < 40 và xu hướng giảm rõ", "Only when score < 40 and clear downtrend"), ok: result.score < 40 },
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

            {/* Row 2: Trading Plan */}
            <div className="bg-gray-900 rounded-xl p-4 border border-blue-900">
              <div className="text-sm font-medium text-blue-400 mb-3">{t("KẾ HOẠCH GIAO DỊCH — Giá vào và mục tiêu", "TRADING PLAN — Entry and targets")}</div>
              <div className="grid grid-cols-6 gap-2">
                <div className="bg-red-950 border border-red-800 rounded-lg p-2.5 text-center">
                  <div className="text-xs text-red-400">{t("Cắt lỗ", "Stop Loss")}</div>
                  <div className="text-sm font-bold text-red-300 mt-1">${result.trading.stopLoss}</div>
                  <div className="text-xs text-red-500">{(((parseFloat(result.trading.stopLoss) - parseFloat(result.price)) / parseFloat(result.price)) * 100).toFixed(1)}%</div>
                </div>
                <div className="bg-blue-950 border border-blue-800 rounded-lg p-2.5 text-center">
                  <div className="text-xs text-blue-400">{t("Vào lệnh", "Entry")}</div>
                  <div className="text-sm font-bold text-blue-300 mt-1">${result.trading.entry}</div>
                  <div className="text-xs text-blue-500">{t("Hiện tại", "Current")}</div>
                </div>
                <div className="bg-green-950 border border-green-900 rounded-lg p-2.5 text-center">
                  <div className="text-xs text-green-500">{t("Mục tiêu 1", "Target 1")}</div>
                  <div className="text-sm font-bold text-green-300 mt-1">${result.trading.target1}</div>
                  <div className="text-xs text-green-600">+5% · {t("Chốt 30%", "Take 30%")}</div>
                </div>
                <div className="bg-green-950 border border-green-900 rounded-lg p-2.5 text-center">
                  <div className="text-xs text-green-400">{t("Mục tiêu 2 ★", "Target 2 ★")}</div>
                  <div className="text-sm font-bold text-green-300 mt-1">${result.trading.target2}</div>
                  <div className="text-xs text-green-600">+10% · {t("Chốt 40%", "Take 40%")}</div>
                </div>
                <div className="bg-green-950 border border-green-900 rounded-lg p-2.5 text-center">
                  <div className="text-xs text-green-400">{t("Mục tiêu 3", "Target 3")}</div>
                  <div className="text-sm font-bold text-green-300 mt-1">${result.trading.target3}</div>
                  <div className="text-xs text-green-600">+15% · {t("Chốt 30%", "Take 30%")}</div>
                </div>
                <div className="bg-blue-950 border border-blue-900 rounded-lg p-2.5 text-center">
                  <div className="text-xs text-blue-400">{t("Dài hạn", "Long term")}</div>
                  <div className="text-sm font-bold text-blue-300 mt-1">${result.trading.targetLong}</div>
                  <div className="text-xs text-blue-600">+30% · 6-12{t("th", "mo")}</div>
                </div>
              </div>
            </div>

            {/* Row 3: Buy/Avoid reasons + Sell Put */}
            <div className="grid grid-cols-3 gap-3">

              <div className="bg-green-950 rounded-xl p-3 border border-green-900">
                <div className="text-xs font-medium text-green-400 mb-2">{t("TẠI SAO NÊN MUA?", "WHY BUY?")}</div>
                <div className="space-y-1.5">
                  {result.reasons_buy.map((r: string, i: number) => (
                    <div key={i} className="flex gap-1.5 items-start">
                      <span className="text-green-400 text-xs mt-0.5 flex-shrink-0">✓</span>
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
                      <span className="text-red-400 text-xs mt-0.5 flex-shrink-0">✗</span>
                      <span className="text-xs text-red-100 leading-relaxed">{r}</span>
                    </div>
                  ))}
                  {result.reasons_avoid.length === 0 && <div className="text-xs text-gray-500">{t("Không có tín hiệu tránh", "No avoid signals")}</div>}
                </div>
              </div>

              <div className={`rounded-xl p-3 border ${result.sellPut.safe ? "bg-green-950 border-green-800" : "bg-gray-900 border-gray-800"}`}>
                <div className="text-xs font-medium text-green-400 mb-2">SELL PUT {t("CHI TIẾT", "DETAILS")}</div>
                <div className={`text-sm font-bold mb-2 ${result.sellPut.safe ? "text-green-300" : "text-red-400"}`}>{result.sellPut.recommendation}</div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-gray-400">{t("Thời gian", "Timing")}</span><span className="text-white text-right">{result.sellPut.timing}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">{t("Strike thận trọng", "Conservative strike")}</span><span className="text-green-300">${result.sellPut.strikeConservative}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">{t("Strike ATR", "ATR strike")}</span><span className="text-yellow-300">${result.sellPut.strikeATR}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">IV Rank</span><span className={parseFloat(result.sellPut.ivRank) > 50 ? "text-green-300" : "text-yellow-300"}>{result.sellPut.ivRank}%</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">{t("Hỗ trợ", "Support")}</span><span className="text-blue-300">${result.indicators.support}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">{t("Kháng cự", "Resistance")}</span><span className="text-orange-300">${result.indicators.resistance}</span></div>
                </div>
              </div>
            </div>

            {/* Row 4: All indicators */}
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
                  { label: t("Vol Ratio", "Vol Ratio"), value: result.indicators.volumeRatio + "x", color: parseFloat(result.indicators.volumeRatio) > 1.5 ? "text-green-400" : "text-white" },
                ].map((item, i) => (
                  <div key={i} className="bg-gray-800 rounded-lg p-2">
                    <div className="text-xs text-gray-500">{item.label}</div>
                    <div className={`text-xs font-medium mt-0.5 ${item.color || "text-white"}`}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Row 5: Volume + Signals */}
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
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {result.signals.map((signal: string, i: number) => {
                    const isBull = signal.includes("bullish") || signal.includes("above") || signal.includes("golden") || signal.includes("oversold") || signal.includes("strong") || signal.includes("high volume") || signal.includes("OBV bull");
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

          </div>
        )}
      </div>
    </div>
  );
}