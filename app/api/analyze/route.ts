import { NextResponse } from "next/server";
import axios from "axios";

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

  const apiKey = process.env.ALPHA_VANTAGE_KEY;

  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${apiKey}`;

  const res = await axios.get(url);

  const data = res.data["Time Series (Daily)"];
  if (!data) {
    return NextResponse.json({ error: "No data" });
  }

  const closes = Object.values(data)
    .map((d: any) => parseFloat(d["4. close"]))
    .slice(0, 50)
    .reverse();

  const rsi = calculateRSI(closes);

  let score = 50;

  if (rsi < 30) score += 20;
  if (rsi > 70) score -= 20;
  if (rsi > 50 && rsi < 65) score += 10;

  let verdict = "WATCH";
  if (score >= 75) verdict = "BUY";
  else if (score < 60) verdict = "AVOID";

  const currentPrice = closes[closes.length - 1];

  return NextResponse.json({
    symbol,
    price: currentPrice,
    rsi,
    score,
    verdict,
    entry: currentPrice,
    stop_loss: currentPrice * 0.97,
    target_1: currentPrice * 1.05,
    target_2: currentPrice * 1.1,
  });
}