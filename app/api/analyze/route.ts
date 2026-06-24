import { NextResponse } from "next/server";

async function getStockData(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=3mo`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });
  const data = await res.json();
  return data;
}

function calculateRSI(prices: number[], period = 14) {
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const rs = gains / (losses || 1);
  return 100 - 100 / (1 + rs);
}

export async function POST(req: Request) {
  const { symbol } = await req.json();

  const data = await getStockData(symbol);

  const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
  const currentPrice = data?.chart?.result?.[0]?.meta?.regularMarketPrice;

  if (!closes || !currentPrice) {
    return NextResponse.json({ error: "No data found for this symbol" });
  }

  const validCloses = closes.filter((p: number) => p != null);
  const rsi = calculateRSI(validCloses);

  let score = 50;
  if (rsi < 30) score += 20;
  if (rsi > 70) score -= 20;
  if (rsi > 50 && rsi < 65) score += 10;

  let verdict = "WATCH";
  if (score >= 75) verdict = "BUY";
  else if (score < 60) verdict = "AVOID";

  return NextResponse.json({
    symbol: symbol.toUpperCase(),
    price: currentPrice.toFixed(2),
    rsi: rsi.toFixed(2),
    score,
    verdict,
    entry: currentPrice.toFixed(2),
    stop_loss: (currentPrice * 0.97).toFixed(2),
    target_1: (currentPrice * 1.05).toFixed(2),
    target_2: (currentPrice * 1.1).toFixed(2),
  });
}