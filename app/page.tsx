"use client";
import { useState } from "react";

export default function Home() {
  const [symbol, setSymbol] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      setError("Failed to fetch data");
    }
    setLoading(false);
  };

  const verdictBg: Record<string, string> = {
    "STRONG BUY": "bg-green-600",
    "BUY": "bg-green-400",
    "WATCH": "bg-yellow-400",
    "AVOID": "bg-orange-400",
    "STRONG AVOID": "bg-red-600",
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-400">Stock AI Advisor</h1>
          <p className="text-gray-400 mt-1">Day Trade • Swing Trade • Sell Put</p>
        </div>

        <div className="flex gap-2 mb-6">
          <input
            className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-blue-400"
            placeholder="Enter symbol (AAPL, NVDA, TSLA...)"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && analyze()}
          />
          <button
            onClick={analyze}
            disabled={loading}
            className="bg-blue-500 hover:bg-blue-600 px-6 py-3 rounded-lg font-bold disabled:opacity-50"
          >
            {loading ? "..." : "Analyze"}
          </button>
        </div>

        {error && (
          <div className="bg-red-900 border border-red-500 rounded-lg p-4 mb-4">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-4xl font-bold text-white">{result.symbol}</h2>
                  <p className="text-3xl font-bold text-green-400 mt-1">${result.price}</p>
                  <p className="text-gray-400 mt-1">{result.action}</p>
                </div>
                <div className="text-right">
                  <span className={`${verdictBg[result.verdict] || "bg-gray-600"} text-white px-4 py-2 rounded-lg font-bold text-lg`}>
                    {result.verdict}
                  </span>
                  <p className="text-gray-400 mt-2">Score: <span className="text-white font-bold text-xl">{result.score}/100</span></p>
                </div>
              </div>
            </div>

            <div className={`rounded-xl p-5 border ${result.sellPut.safe ? "bg-green-950 border-green-500" : "bg-red-950 border-red-500"}`}>
              <h3 className="font-bold text-lg mb-3">Sell Put Analysis</h3>
              <p className="text-xl font-bold mb-3">{result.sellPut.recommendation}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-black bg-opacity-30 rounded-lg p-3">
                  <p className="text-gray-400 text-sm">Conservative Strike</p>
                  <p className="text-white font-bold text-lg">${result.sellPut.strikeConservative}</p>
                  <p className="text-gray-400 text-xs">5% OTM - Safer</p>
                </div>
                <div className="bg-black bg-opacity-30 rounded-lg p-3">
                  <p className="text-gray-400 text-sm">Aggressive Strike</p>
                  <p className="text-white font-bold text-lg">${result.sellPut.strikeAggressive}</p>
                  <p className="text-gray-400 text-xs">3% OTM - More premium</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 rounded-xl p-5 border border-gray-700">
              <h3 className="font-bold text-lg mb-3">Trading Levels</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-sm">Entry</p>
                  <p className="text-blue-400 font-bold">${result.trading.entry}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-sm">Stop Loss</p>
                  <p className="text-red-400 font-bold">${result.trading.stopLoss}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-sm">Target 1 (+5%)</p>
                  <p className="text-green-400 font-bold">${result.trading.target1}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-sm">Target 2 (+10%)</p>
                  <p className="text-green-400 font-bold">${result.trading.target2}</p>
                </div>