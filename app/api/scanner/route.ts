import { NextResponse } from "next/server";

const WATCHLIST = [
  "AAPL","NVDA","TSLA","MSFT","GOOGL","AMZN","META","AMD","IREN",
  "PLTR","COIN","MSTR","RKLB","ASTS","SPCX","ARM","SMCI","MRVL",
  "AVGO","NFLX","UBER","CRWD","NET","DDOG","SQ","SHOP","SOFI",
  "HOOD","RIVN","INTC","MU","QCOM","AMAT","ON","IONQ","RGTI"
];

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
  return prices.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcEMA(prices: number[], period: number) {
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) ema = prices[i] * k + ema * (1 - k);
  return ema;
}

function calcMACD(prices: number[]) {
  return calcEMA(prices, 12) - calcEMA(prices, 26);
}

function calcBollinger(prices: number[], period = 20) {
  const slice = prices.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
  return { upper: mean + 2 * std, middle: mean, lower: mean - 2 * std };
}

function calcStochRSI(prices: number[], rsiPeriod = 14, stochPeriod = 14) {
  const rsiValues: number[] = [];
  for (let i = rsiPeriod; i < prices.length; i++) {
    rsiValues.push(calcRSI(prices.slice(i - rsiPeriod, i + 1)));
  }
  if (rsiValues.length < stochPeriod) return 50;
  const recent = rsiValues.slice(-stochPeriod);
  const minRSI = Math.min(...recent);
  const maxRSI = Math.max(...recent);
  const currentRSI = rsiValues[rsiValues.length - 1];
  return maxRSI === minRSI ? 50 : ((currentRSI - minRSI) / (maxRSI - minRSI)) * 100;
}

async function analyzeStock(symbol: string) {
  try {
    const data = await getStockData(symbol);
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const closes: number[] = result.indicators.quote[0].close.filter((p: number) => p != null);
    const volumes: number[] = result.indicators.quote[0].volume.filter((v: number) => v != null);
    const currentPrice: number = result.meta.regularMarketPrice;

    if (closes.length < 50 || !currentPrice) return null;

    const rsi = calcRSI(closes);
    const stochRSI = calcStochRSI(closes);
    const ma20 = calcMA(closes, 20)!;
    const ma50 = calcMA(closes, 50)!;
    const ma200 = calcMA(closes, Math.min(200, closes.length));
    const ema9 = calcEMA(closes, 9);
    const ema21 = calcEMA(closes, 21);
    const macdLine = calcMACD(closes);
    const bb = calcBollinger(closes);
    const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volRatio = volumes[volumes.length - 1] / avgVol;

    let score = 50;

    if (rsi < 30) score += 15;
    else if (rsi < 45) score += 8;
    else if (rsi > 70) score -= 15;
    else if (rsi > 55 && rsi < 65) score += 5;

    if (stochRSI < 20) score += 10;
    else if (stochRSI < 40) score += 5;
    else if (stochRSI > 80) score -= 10;

    if (currentPrice > ma20) score += 7; else score -= 7;
    if (currentPrice > ma50) score += 7; else score -= 7;
    if (ma200 && currentPrice > ma200) score += 8; else if (ma200) score -= 8;
    if (ema9 > ema21) score += 6; else score -= 4;
    if (ma20 > ma50) score += 6; else score -= 6;
    if (macdLine > 0) score += 7; else score -= 7;
    if (currentPrice < bb.lower) score += 10;
    else if (currentPrice > bb.upper) score -= 10;
    if (volRatio > 1.5) score += 5;

    score = Math.max(0, Math.min(100, score));

    const sellPutSafe = score >= 68 && rsi < 65 && stochRSI < 70 && currentPrice > ma50;

    return {
      symbol,
      price: currentPrice.toFixed(2),
      score,
      rsi: rsi.toFixed(1),
      verdict: score >= 80 ? "STRONG BUY" : score >= 68 ? "BUY" : "WATCH",
      sellPutSafe,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const results = await Promise.all(
    WATCHLIST.map(s => analyzeStock(s))
  );

  const filtered = results
    .filter((r) => r && r.score >= 75)
    .sort((a, b) => b!.score - a!.score)
    .slice(0, 10);

  return NextResponse.json({
    stocks: filtered,
    scanned: WATCHLIST.length,
    timestamp: new Date().toISOString(),
  });
}