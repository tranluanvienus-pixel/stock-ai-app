"use client";

import { useState } from "react";

export default function Home() {
  const [symbol, setSymbol] = useState("");
  const [result, setResult] = useState<any>(null);

  const analyze = async () => {
    const res = await fetch("/api/analyze", {
      method: "POST",
      body: JSON.stringify({ symbol }),
    });

    const data = await res.json();
    setResult(data);
  };

  return (
    <div className="p-10 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">
        Stock AI Advisor (US Market)
      </h1>

      <input
        className="border p-2 w-full"
        placeholder="Enter symbol (AAPL, NVDA...)"
        value={symbol}
        onChange={(e) => setSymbol(e.target.value)}
      />

      <button
        onClick={analyze}
        className="bg-blue-500 text-white p-2 mt-3 w-full"
      >
        Analyze
      </button>

      {result && (
        <div className="mt-5 p-4 border rounded">
          <p>Symbol: {result.symbol}</p>
          <p>Price: {result.price}</p>
          <p>RSI: {result.rsi}</p>
          <p>Score: {result.score}</p>
          <p className="font-bold">Verdict: {result.verdict}</p>
          <p>Entry: {result.entry}</p>
          <p>Stop Loss: {result.stop_loss}</p>
          <p>Target 1: {result.target_1}</p>
          <p>Target 2: {result.target_2}</p>
        </div>
      )}
    </div>
  );
}