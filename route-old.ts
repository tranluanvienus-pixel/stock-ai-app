import { NextResponse } from "next/server";

async function getStockData(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  return res.json();
}

async function getQuote(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
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
  const macdLine = ema12 - ema26;
  const signal = macdLine * 0.9;
  return { macdLine, signal, histogram: macdLine - signal };
}

function calcBollinger(prices: number[], period = 20) {
  const slice = prices.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
  return { upper: mean + 2 * std, middle: mean, lower: mean - 2 * std, std };
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
  const obvTrend = recent[recent.length - 1] > recent[0] ? "bullish" : "bearish";
  return { obv, obvTrend };
}

function calcSupRes(closes: number[]) {
  const recent = closes.slice(-50);
  const sorted = [...recent].sort((a, b) => a - b);
  const support = sorted[Math.floor(sorted.length * 0.1)];
  const resistance = sorted[Math.floor(sorted.length * 0.9)];
  return { support, resistance };
}

function calcIVRankEstimate(prices: number[], period = 252) {
  const returns: number[] = [];
  const slice = prices.slice(-Math.min(period, prices.length));
  for (let i = 1; i < slice.length; i++) {
    returns.push(Math.log(slice[i] / slice[i - 1]));
  }
  const variance = returns.reduce((a, b) => a + b * b, 0) / returns.length;
  const annualVol = Math.sqrt(variance * 252) * 100;
  const recentReturns = returns.slice(-20);
  const recentVol = Math.sqrt(recentReturns.reduce((a, b) => a + b * b, 0) / recentReturns.length * 252) * 100;
  const ivRank = Math.min(100, Math.max(0, (recentVol / annualVol) * 50));
  return { ivRank, annualVol, recentVol };
}

function calcSectorStrength(closes: number[]) {
  const perf5d = ((closes[closes.length - 1] - closes[closes.length - 6]) / closes[closes.length - 6]) * 100;
  const perf20d = ((closes[closes.length - 1] - closes[closes.length - 21]) / closes[closes.length - 21]) * 100;
  return { perf5d, perf20d };
}

export async function POST(req: Request) {
  const { symbol } = await req.json();

  const [data] = await Promise.all([getStockData(symbol)]);

  const result = data?.chart?.result?.[0];
  if (!result) return NextResponse.json({ error: "Symbol not found" });

  const quote = result.indicators.quote[0];
  const closes: number[] = quote.close.filter((p: number) => p != null);
  const highs: number[] = quote.high.filter((p: number) => p != null);
  const lows: number[] = quote.low.filter((p: number) => p != null);
  const volumes: number[] = quote.volume.filter((v: number) => v != null);
  const currentPrice: number = result.meta.regularMarketPrice;

  if (closes.length < 50) return NextResponse.json({ error: "Not enough data" });

  const rsi = calcRSI(closes);
  const stochRSI = calcStochRSI(closes);
  const ma20 = calcMA(closes, 20)!;
  const ma50 = calcMA(closes, 50)!;
  const ma200 = calcMA(closes, Math.min(200, closes.length));
  const ema9 = calcEMA(closes, 9);
  const ema21 = calcEMA(closes, 21);
  const macd = calcMACD(closes);
  const bb = calcBollinger(closes);
  const atr = calcATR(highs, lows, closes);
  const adx = calcADX(highs, lows, closes);
  const obv = calcOBV(closes, volumes);
  const supRes = calcSupRes(closes);
  const ivData = calcIVRankEstimate(closes);
  const perf = calcSectorStrength(closes);

  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const currentVol = volumes[volumes.length - 1];
  const volRatio = currentVol / avgVol;

  const buyVolumeEst = Math.round(currentVol * (rsi > 50 ? 0.6 : 0.4));
  const sellVolumeEst = currentVol - buyVolumeEst;
  const buyPct = Math.round((buyVolumeEst / currentVol) * 100);

  let score = 50;
  const signals: string[] = [];
  const reasons_buy: string[] = [];
  const reasons_avoid: string[] = [];

  // RSI
  if (rsi < 30) { score += 15; signals.push("RSI oversold - bullish"); reasons_buy.push("RSI " + rsi.toFixed(1) + " — vùng oversold, xác suất bật lên cao"); }
  else if (rsi < 45) { score += 8; signals.push("RSI approaching oversold"); reasons_buy.push("RSI " + rsi.toFixed(1) + " — chưa overbought, còn dư địa tăng"); }
  else if (rsi > 70) { score -= 15; signals.push("RSI overbought - bearish"); reasons_avoid.push("RSI " + rsi.toFixed(1) + " — overbought, rủi ro điều chỉnh cao"); }
  else if (rsi > 55 && rsi < 65) { score += 5; signals.push("RSI healthy bullish range"); reasons_buy.push("RSI " + rsi.toFixed(1) + " — vùng tăng khỏe mạnh"); }

  // Stochastic RSI
  if (stochRSI < 20) { score += 10; signals.push("Stoch RSI oversold - strong buy"); reasons_buy.push("Stoch RSI " + stochRSI.toFixed(1) + " — oversold mạnh, điểm vào tốt"); }
  else if (stochRSI < 40) { score += 5; signals.push("Stoch RSI bullish zone"); reasons_buy.push("Stoch RSI " + stochRSI.toFixed(1) + " — vùng bullish"); }
  else if (stochRSI > 80) { score -= 10; signals.push("Stoch RSI overbought"); reasons_avoid.push("Stoch RSI " + stochRSI.toFixed(1) + " — overbought, cẩn thận"); }

  // MA
  if (currentPrice > ma20) { score += 7; signals.push("Price above MA20 - bullish"); reasons_buy.push("Giá trên MA20 $" + ma20.toFixed(2) + " — xu hướng ngắn hạn tăng"); }
  else { score -= 7; signals.push("Price below MA20 - bearish"); reasons_avoid.push("Giá dưới MA20 — xu hướng ngắn hạn yếu"); }

  if (currentPrice > ma50) { score += 7; signals.push("Price above MA50 - bullish"); reasons_buy.push("Giá trên MA50 $" + ma50.toFixed(2) + " — xu hướng trung hạn tăng"); }
  else { score -= 7; signals.push("Price below MA50 - bearish"); reasons_avoid.push("Giá dưới MA50 — xu hướng trung hạn yếu"); }

  if (ma200 && currentPrice > ma200) { score += 8; signals.push("Price above MA200 - strong uptrend"); reasons_buy.push("Giá trên MA200 — xu hướng dài hạn tăng rất mạnh"); }
  else if (ma200) { score -= 8; signals.push("Price below MA200 - downtrend"); reasons_avoid.push("Giá dưới MA200 — xu hướng dài hạn giảm"); }

  // EMA 9/21
  if (ema9 > ema21) { score += 6; signals.push("EMA9 above EMA21 - bullish"); reasons_buy.push("EMA9 cắt lên EMA21 — momentum tăng ngắn hạn"); }
  else { score -= 4; signals.push("EMA9 below EMA21 - bearish"); reasons_avoid.push("EMA9 dưới EMA21 — momentum yếu"); }

  // Golden/Death Cross
  if (ma20 > ma50) { score += 6; signals.push("MA20 > MA50 - golden cross zone"); reasons_buy.push("MA20 trên MA50 — vùng golden cross bullish"); }
  else { score -= 6; signals.push("MA20 < MA50 - death cross zone"); reasons_avoid.push("MA20 dưới MA50 — vùng death cross bearish"); }

  // MACD
  if (macd.macdLine > macd.signal) { score += 7; signals.push("MACD bullish crossover"); reasons_buy.push("MACD cắt lên signal — momentum tăng xác nhận"); }
  else { score -= 7; signals.push("MACD bearish crossover"); reasons_avoid.push("MACD dưới signal — momentum yếu"); }

  // Bollinger Bands
  if (currentPrice < bb.lower) { score += 10; signals.push("Price below BB lower - oversold bounce"); reasons_buy.push("Giá dưới BB Lower — khả năng bật lên mạnh"); }
  else if (currentPrice > bb.upper) { score -= 10; signals.push("Price above BB upper - overbought"); reasons_avoid.push("Giá trên BB Upper — overbought, rủi ro giảm"); }
  else if (currentPrice < bb.middle) { score += 3; signals.push("Price below BB middle - recovery zone"); }

  // ADX
  if (adx.adx > 25 && adx.diPlus > adx.diMinus) { score += 8; signals.push("ADX " + adx.adx.toFixed(0) + " strong uptrend"); reasons_buy.push("ADX " + adx.adx.toFixed(0) + " — xu hướng tăng mạnh, có momentum"); }
  else if (adx.adx > 25 && adx.diMinus > adx.diPlus) { score -= 8; signals.push("ADX strong downtrend"); reasons_avoid.push("ADX " + adx.adx.toFixed(0) + " — xu hướng giảm mạnh"); }
  else if (adx.adx < 20) { signals.push("ADX weak - no clear trend"); }

  // OBV
  if (obv.obvTrend === "bullish") { score += 6; signals.push("OBV bullish - smart money buying"); reasons_buy.push("OBV tăng — dòng tiền thực đang vào mạnh"); }
  else { score -= 4; signals.push("OBV bearish - selling pressure"); reasons_avoid.push("OBV giảm — dòng tiền đang rút ra"); }

  // Volume
  if (volRatio > 1.5) { score += 5; signals.push("High volume " + volRatio.toFixed(1) + "x - strong move"); reasons_buy.push("Volume " + volRatio.toFixed(1) + "x trung bình — xác nhận xu hướng mạnh"); }
  else if (volRatio < 0.5) { score -= 3; signals.push("Low volume - weak conviction"); reasons_avoid.push("Volume thấp — thiếu xác nhận"); }

  // IV Rank
  if (ivData.ivRank > 50) { score += 3; signals.push("IV Rank high - good for sell options"); reasons_buy.push("IV Rank " + ivData.ivRank.toFixed(0) + "% — premium đắt, tốt để sell put"); }
  else if (ivData.ivRank < 25) { signals.push("IV Rank low - options cheap"); reasons_avoid.push("IV Rank thấp — premium rẻ, không lý tưởng để sell put"); }

  // ATR-based support
  const atrSupport = currentPrice - 1.5 * atr;
  if (currentPrice > supRes.support) { score += 4; signals.push("Price above key support"); reasons_buy.push("Giá trên vùng hỗ trợ $" + supRes.support.toFixed(2) + " — có đệm bảo vệ"); }
  else { score -= 4; signals.push("Price below key support"); reasons_avoid.push("Giá phá vỡ hỗ trợ — rủi ro giảm tiếp"); }

  // 5-day performance
  if (perf.perf5d > 3) { score += 3; signals.push("Strong 5-day momentum +" + perf.perf5d.toFixed(1) + "%"); reasons_buy.push("Momentum 5 ngày +" + perf.perf5d.toFixed(1) + "% — đà tăng ngắn hạn mạnh"); }
  else if (perf.perf5d < -5) { score -= 5; signals.push("Weak 5-day " + perf.perf5d.toFixed(1) + "%"); reasons_avoid.push("Giảm " + Math.abs(perf.perf5d).toFixed(1) + "% trong 5 ngày — đà giảm"); }

  score = Math.max(0, Math.min(100, score));

  let verdict = "WATCH";
  let verdictVi = "THEO DÕI";
  let action = "Wait for clearer signal";
  let actionVi = "Chờ tín hiệu rõ hơn";

  if (score >= 80) { verdict = "STRONG BUY"; verdictVi = "MUA MẠNH"; action = "Strong entry - Buy shares & Sell Put"; actionVi = "Vào lệnh mạnh — Mua cổ & Bán Put"; }
  else if (score >= 68) { verdict = "BUY"; verdictVi = "NÊN MUA"; action = "Good entry - confirm with volume"; actionVi = "Vào lệnh tốt — xác nhận bằng volume"; }
  else if (score >= 55) { verdict = "WATCH"; verdictVi = "THEO DÕI"; action = "Wait for better setup"; actionVi = "Chờ setup tốt hơn"; }
  else if (score >= 40) { verdict = "AVOID"; verdictVi = "TRÁNH"; action = "Risk too high - wait"; actionVi = "Rủi ro cao — chờ đợi"; }
  else { verdict = "STRONG AVOID"; verdictVi = "TRÁNH MẠNH"; action = "High risk - do not trade"; actionVi = "Rủi ro rất cao — không vào lệnh"; }

  const sellPutSafe = score >= 68 && rsi < 65 && stochRSI < 70 && currentPrice > ma50 && ivData.ivRank > 25;
  const sellCallSafe = score <= 40 && rsi > 65 && currentPrice < ma20 && obv.obvTrend === "bearish";

  const sellPutDays = score >= 80 ? "7-14 ngày tốt nhất" : score >= 68 ? "14-21 ngày phù hợp" : "Không nên sell put lúc này";
  const strikeConservative = (currentPrice * 0.95).toFixed(2);
  const strikeAggressive = (currentPrice - 1.5 * atr).toFixed(2);
  const strikeATR = (currentPrice - 2 * atr).toFixed(2);

  const stopLoss = (currentPrice - 1.5 * atr).toFixed(2);
  const target1 = (currentPrice * 1.05).toFixed(2);
  const target2 = (currentPrice * 1.10).toFixed(2);
  const target3 = (currentPrice * 1.15).toFixed(2);
  const targetLong = (currentPrice * 1.30).toFixed(2);

  return NextResponse.json({
    symbol: symbol.toUpperCase(),
    price: currentPrice.toFixed(2),
    score,
    verdict,
    verdictVi,
    action,
    actionVi,
    indicators: {
      rsi: rsi.toFixed(2),
      stochRSI: stochRSI.toFixed(2),
      ma20: ma20.toFixed(2),
      ma50: ma50.toFixed(2),
      ma200: ma200 ? ma200.toFixed(2) : "N/A",
      ema9: ema9.toFixed(2),
      ema21: ema21.toFixed(2),
      macd: macd.macdLine.toFixed(3),
      macdSignal: macd.signal.toFixed(3),
      macdHistogram: macd.histogram.toFixed(3),
      bbUpper: bb.upper.toFixed(2),
      bbMiddle: bb.middle.toFixed(2),
      bbLower: bb.lower.toFixed(2),
      atr: atr.toFixed(2),
      adx: adx.adx.toFixed(1),
      diPlus: adx.diPlus.toFixed(1),
      diMinus: adx.diMinus.toFixed(1),
      obvTrend: obv.obvTrend,
      ivRank: ivData.ivRank.toFixed(0),
      annualVol: ivData.annualVol.toFixed(1),
      volume: currentVol.toLocaleString(),
      avgVolume: Math.round(avgVol).toLocaleString(),
      volumeRatio: volRatio.toFixed(2),
      buyVolume: buyVolumeEst.toLocaleString(),
      sellVolume: sellVolumeEst.toLocaleString(),
      buyPct,
      support: supRes.support.toFixed(2),
      resistance: supRes.resistance.toFixed(2),
      perf5d: perf.perf5d.toFixed(2),
      perf20d: perf.perf20d.toFixed(2),
    },
    trading: {
      entry: currentPrice.toFixed(2),
      stopLoss,
      stopLossATR: (currentPrice - 1.5 * atr).toFixed(2),
      target1,
      target2,
      target3,
      targetLong,
    },
    sellPut: {
      safe: sellPutSafe,
      recommendation: sellPutSafe ? "An toàn để Sell Put" : "Chưa an toàn để Sell Put",
      timing: sellPutDays,
      strikeConservative,
      strikeAggressive,
      strikeATR,
      ivRank: ivData.ivRank.toFixed(0),
    },
    sellCall: {
      safe: sellCallSafe,
      recommendation: sellCallSafe ? "An toàn để Sell Call" : "Không nên Sell Call",
    },
    reasons_buy: reasons_buy.slice(0, 5),
    reasons_avoid: reasons_avoid.slice(0, 4),
    signals,
  });
}