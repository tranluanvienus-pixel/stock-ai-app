import { NextResponse } from "next/server";

async function getStockData(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=6mo`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  return res.json();
}

function calcRSI(prices: number[], period = 14) {
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const rs = gains / (losses || 1);
  return 100 - 100 / (1 + rs);
}

function calcMA(prices: number[], period: number) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcMACD(prices: number[]) {
  function ema(data: number[], period: number) {
    const k = 2 / (period + 1);
    let emaVal = data[0];
    for (let i = 1; i < data.length; i++) {
      emaVal = data[i] * k + emaVal * (1 - k);
    }
    return emaVal;
  }
  const ema12 = ema(prices, 12);
  const ema26 = ema(prices, 26);
  const macdLine = ema12 - ema26;
  return { macdLine, signal: macdLine * 0.9, histogram: macdLine * 0.1 };
}

function calcBollinger(prices: number[], period = 20) {
  const slice = prices.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const std = Math.sqrt(variance);
  return { upper: mean + 2 * std, middle: mean, lower: mean - 2 * std };
}

function calcVolume(volumes: number[], period = 20) {
  const slice = volumes.slice(-period);
  const avgVol = slice.reduce((a, b) => a + b, 0) / period;
  const currentVol = volumes[volumes.length - 1];
  return { avgVol, currentVol, ratio: currentVol / avgVol };
}

export async function POST(req: Request) {
  const { symbol } = await req.json();
  const data = await getStockData(symbol);

  const result = data?.chart?.result?.[0];
  if (!result) return NextResponse.json({ error: "Symbol not found" });

  const closes: number[] = result.indicators.quote[0].close.filter((p: number) => p != null);
  const volumes: number[] = result.indicators.quote[0].volume.filter((v: number) => v != null);
  const currentPrice: number = result.meta.regularMarketPrice;

  if (closes.length < 50) return NextResponse.json({ error: "Not enough data" });

  // Indicators
  const rsi = calcRSI(closes);
  const ma20 = calcMA(closes, 20)!;
  const ma50 = calcMA(closes, 50)!;
  const ma200 = calcMA(closes, Math.min(200, closes.length));
  const macd = calcMACD(closes);
  const bb = calcBollinger(closes);
  const vol = calcVolume(volumes);

  // Scoring system (0-100)
  let score = 50;
  let signals: string[] = [];

  // RSI signals
  if (rsi < 30) { score += 15; signals.push("RSI oversold - bullish"); }
  else if (rsi < 45) { score += 8; signals.push("RSI approaching oversold"); }
  else if (rsi > 70) { score -= 15; signals.push("RSI overbought - bearish"); }
  else if (rsi > 55 && rsi < 65) { score += 5; signals.push("RSI healthy bullish range"); }

  // MA signals
  if (currentPrice > ma20) { score += 8; signals.push("Price above MA20 - bullish"); }
  else { score -= 8; signals.push("Price below MA20 - bearish"); }

  if (currentPrice > ma50) { score += 8; signals.push("Price above MA50 - bullish"); }
  else { score -= 8; signals.push("Price below MA50 - bearish"); }

  if (ma200 && currentPrice > ma200) { score += 10; signals.push("Price above MA200 - strong uptrend"); }
  else if (ma200) { score -= 10; signals.push("Price below MA200 - downtrend"); }

  if (ma20 > ma50) { score += 7; signals.push("MA20 > MA50 - golden cross"); }
  else { score -= 7; signals.push("MA20 < MA50 - death cross"); }

  // MACD signals
  if (macd.macdLine > macd.signal) { score += 8; signals.push("MACD bullish crossover"); }
  else { score -= 8; signals.push("MACD bearish crossover"); }

  // Bollinger Bands
  if (currentPrice < bb.lower) { score += 10; signals.push("Price below BB lower - oversold bounce"); }
  else if (currentPrice > bb.upper) { score -= 10; signals.push("Price above BB upper - overbought"); }
  else if (currentPrice < bb.middle) { score += 3; signals.push("Price below BB middle"); }

  // Volume
  if (vol.ratio > 1.5) { score += 5; signals.push(`High volume (${vol.ratio.toFixed(1)}x avg) - strong move`); }
  else if (vol.ratio < 0.5) { score -= 3; signals.push("Low volume - weak move"); }

  score = Math.max(0, Math.min(100, score));

  // Verdict
  let verdict = "WATCH";
  let verdictColor = "yellow";
  let action = "Wait for clearer signal";

  if (score >= 75) {
    verdict = "STRONG BUY";
    verdictColor = "green";
    action = "Good entry for Buy Shares & Sell Put";
  } else if (score >= 63) {
    verdict = "BUY";
    verdictColor = "lightgreen";
    action = "Consider entry, confirm with volume";
  } else if (score >= 50) {
    verdict = "WATCH";
    verdictColor = "yellow";
    action = "Wait for better setup";
  } else if (score >= 38) {
    verdict = "AVOID";
    verdictColor = "orange";
    action = "Not safe for sell put";
  } else {
    verdict = "STRONG AVOID";
    verdictColor = "red";
    action = "High risk - do not sell put";
  }

  // Sell Put recommendation
  const sellPutSafe = score >= 63 && rsi < 65 && currentPrice > ma50;
  const suggestedStrike = (currentPrice * 0.95).toFixed(2);
  const suggestedStrikeAggressive = (currentPrice * 0.97).toFixed(2);

  return NextResponse.json({
    symbol: symbol.toUpperCase(),
    price: currentPrice.toFixed(2),
    score,
    verdict,
    verdictColor,
    action,
    indicators: {
      rsi: rsi.toFixed(2),
      ma20: ma20.toFixed(2),
      ma50: ma50.toFixed(2),
      ma200: ma200 ? ma200.toFixed(2) : "N/A",
      macd: macd.macdLine.toFixed(3),
      macdSignal: macd.signal.toFixed(3),
      bbUpper: bb.upper.toFixed(2),
      bbMiddle: bb.middle.toFixed(2),
      bbLower: bb.lower.toFixed(2),
      volume: vol.currentVol.toLocaleString(),
      avgVolume: vol.avgVol.toFixed(0),
      volumeRatio: vol.ratio.toFixed(2),
    },
    trading: {
      entry: currentPrice.toFixed(2),
      stopLoss: (currentPrice * 0.97).toFixed(2),
      target1: (currentPrice * 1.05).toFixed(2),
      target2: (currentPrice * 1.10).toFixed(2),
      target3: (currentPrice * 1.15).toFixed(2),
    },
    sellPut: {
      safe: sellPutSafe,
      recommendation: sellPutSafe ? "✅ Safe to Sell Put" : "❌ Not recommended",
      strikeConservative: suggestedStrike,
      strikeAggressive: suggestedStrikeAggressive,
    },
    signals,
  });
}