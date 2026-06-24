import { NextResponse } from "next/server";

const WATCHLIST = [
  "AAPL","NVDA","TSLA","MSFT","GOOGL","AMZN","META","AMD","IREN",
  "PLTR","COIN","MSTR","RKLB","ASTS","SPCX","ARM","SMCI","MRVL",
  "AVGO","NFLX","UBER","CRWD","NET","DDOG","SQ","SHOP","SOFI",
  "HOOD","RIVN","INTC","MU","QCOM","AMAT","ON","IONQ","RGTI"
];

async function getStockData(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y`;
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

function calcEMA(prices: number[], period: number) {
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) ema = prices[i] * k + ema * (1 - k);
  return ema;
}

function calcMA(prices: number[], period: number) {
  if (prices.length < period) return null;
  return prices.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcMACD(prices: number[]) {
  const ema12 = calcEMA(prices, 12);
  const ema26 = calcEMA(prices, 26);
  return ema12 - ema26;
}

function calcBollinger(prices: number[], period = 20) {
  const slice = prices.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
  return { upper: mean + 2 * std, middle: mean, lower: mean - 2 * std };
}

function calcATR(highs: number[], lows: number[], closes: number[], period = 14) {
  const trs: number[] = [];
  for (let i = 1; i < Math.min(period + 1, closes.length); i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

function calcADX(highs: number[], lows: number[], closes: number[], period = 14) {
  const dms: { plus: number; minus: number }[] = [];
  for (let i = 1; i < closes.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    dms.push({
      plus: upMove > downMove && upMove > 0 ? upMove : 0,
      minus: downMove > upMove && downMove > 0 ? downMove : 0,
    });
  }
  const slice = dms.slice(-period);
  const avgPlus = slice.reduce((a, b) => a + b.plus, 0) / period;
  const avgMinus = slice.reduce((a, b) => a + b.minus, 0) / period;
  const di = avgPlus + avgMinus;
  const dx = di === 0 ? 0 : (Math.abs(avgPlus - avgMinus) / di) * 100;
  return { adx: dx, diPlus: avgPlus, diMinus: avgMinus };
}

function calcOBV(closes: number[], volumes: number[]) {
  let obv = 0;
  const obvValues: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv += volumes[i];
    else if (closes[i] < closes[i - 1]) obv -= volumes[i];
    obvValues.push(obv);
  }
  const recent = obvValues.slice(-5);
  return recent[recent.length - 1] > recent[0] ? "bullish" : "bearish";
}

function calcIVRank(prices: number[]) {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }
  const variance = returns.reduce((a, b) => a + b * b, 0) / returns.length;
  const annualVol = Math.sqrt(variance * 252) * 100;
  const recentReturns = returns.slice(-20);
  const recentVol = Math.sqrt(recentReturns.reduce((a, b) => a + b * b, 0) / recentReturns.length * 252) * 100;
  return Math.min(100, Math.max(0, (recentVol / annualVol) * 50));
}

function calcSupport(closes: number[]) {
  const sorted = [...closes.slice(-50)].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.1)];
}

async function analyzeStock(symbol: string) {
  try {
    const data = await getStockData(symbol);
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const quote = result.indicators.quote[0];
    const closes: number[] = quote.close.filter((p: number) => p != null);
    const highs: number[] = quote.high.filter((p: number) => p != null);
    const lows: number[] = quote.low.filter((p: number) => p != null);
    const volumes: number[] = quote.volume.filter((v: number) => v != null);
    const currentPrice: number = result.meta.regularMarketPrice;

    if (closes.length < 50 || !currentPrice) return null;

    // === CÙNG CÔNG THỨC VỚI ANALYZE ===
    const rsi = calcRSI(closes);
    const stochRSI = calcStochRSI(closes);
    const ma20 = calcMA(closes, 20)!;
    const ma50 = calcMA(closes, 50)!;
    const ma200 = calcMA(closes, Math.min(200, closes.length));
    const ema9 = calcEMA(closes, 9);
    const ema21 = calcEMA(closes, 21);
    const macdLine = calcMACD(closes);
    const bb = calcBollinger(closes);
    const adx = calcADX(highs, lows, closes);
    const obvTrend = calcOBV(closes, volumes);
    const ivRank = calcIVRank(closes);
    const support = calcSupport(closes);
    const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volRatio = volumes[volumes.length - 1] / avgVol;
    const perf5d = ((closes[closes.length - 1] - closes[closes.length - 6]) / closes[closes.length - 6]) * 100;

    let score = 50;

    // RSI
    if (rsi < 30) score += 15;
    else if (rsi < 45) score += 8;
    else if (rsi > 70) score -= 15;
    else if (rsi > 55 && rsi < 65) score += 5;

    // Stoch RSI
    if (stochRSI < 20) score += 10;
    else if (stochRSI < 40) score += 5;
    else if (stochRSI > 80) score -= 10;

    // MA
    if (currentPrice > ma20) score += 7; else score -= 7;
    if (currentPrice > ma50) score += 7; else score -= 7;
    if (ma200 && currentPrice > ma200) score += 8; else if (ma200) score -= 8;

    // EMA
    if (ema9 > ema21) score += 6; else score -= 4;

    // Golden/Death cross
    if (ma20 > ma50) score += 6; else score -= 6;

    // MACD
    if (macdLine > 0) score += 7; else score -= 7;

    // Bollinger
    if (currentPrice < bb.lower) score += 10;
    else if (currentPrice > bb.upper) score -= 10;
    else if (currentPrice < bb.middle) score += 3;

    // ADX
    if (adx.adx > 25 && adx.diPlus > adx.diMinus) score += 8;
    else if (adx.adx > 25 && adx.diMinus > adx.diPlus) score -= 8;

    // OBV
    if (obvTrend === "bullish") score += 6; else score -= 4;

    // Volume
    if (volRatio > 1.5) score += 5;
    else if (volRatio < 0.5) score -= 3;

    // IV Rank
    if (ivRank > 50) score += 3;

    // Support
    if (currentPrice > support) score += 4; else score -= 4;

    // Performance
    if (perf5d > 3) score += 3;
    else if (perf5d < -5) score -= 5;

    score = Math.max(0, Math.min(100, score));

    if (score < 75) return null;

    const sellPutSafe = score >= 68 && rsi < 65 && stochRSI < 70 && currentPrice > ma50 && ivRank > 25;

    return {
      symbol,
      price: currentPrice.toFixed(2),
      score,
      rsi: rsi.toFixed(1),
      verdict: score >= 80 ? "STRONG BUY" : "BUY",
      verdictVi: score >= 80 ? "MUA MẠNH" : "NÊN MUA",
      sellPutSafe,
      perf5d: perf5d.toFixed(1),
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
    .filter((r) => r !== null)
    .sort((a, b) => b!.score - a!.score)
    .slice(0, 10);

  return NextResponse.json({
    stocks: filtered,
    scanned: WATCHLIST.length,
    timestamp: new Date().toISOString(),
  });
}