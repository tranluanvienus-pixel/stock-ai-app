import { NextResponse } from "next/server";
import { calculateMarketRegime } from "@/lib/marketRegime";

// ─── Các hàm fetch dữ liệu (giữ nguyên pattern như route-v2.ts, không sửa file cũ) ───

async function getSpyChartData() {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=1y`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  return res.json();
}

async function getVIX() {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((c: number) => c != null) || [];
    return closes.length ? closes[closes.length - 1] : null;
  } catch {
    return null;
  }
}

async function getFearGreed() {
  try {
    const res = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://www.cnn.com/markets/fear-and-greed",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": "https://www.cnn.com",
      },
    });
    if (!res.ok) {
      console.error("DEBUG Fear&Greed: response not ok, status =", res.status);
      return null;
    }
    const json = await res.json();
    const score = Math.round(json?.fear_and_greed?.score || 50);
    const rating = json?.fear_and_greed?.rating || "neutral";
    return { score, rating };
  } catch (err) {
    console.error("DEBUG Fear&Greed error:", err);
    return null;
  }
}

// ─── FALLBACK NỘI BỘ: ước tính Fear & Greed khi CNN không truy cập được ───
function estimateFearGreedFallback(
  vix: number | null,
  currentClose: number,
  ema50: number,
  ema200: number
): { score: number; rating: string } {
  let score = 50;

  if (currentClose > ema50 && currentClose > ema200) score += 15;
  else if (currentClose < ema50 && currentClose < ema200) score -= 15;

  if (vix !== null) {
    if (vix < 15) score += 15;
    else if (vix < 20) score += 5;
    else if (vix < 25) score -= 5;
    else score -= 20;
  }

  score = Math.max(0, Math.min(100, score));

  let rating = "neutral";
  if (score >= 75) rating = "extreme greed";
  else if (score >= 55) rating = "greed";
  else if (score >= 45) rating = "neutral";
  else if (score >= 25) rating = "fear";
  else rating = "extreme fear";

  return { score, rating };
}

function calcEMA(prices: number[], period: number) {
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) ema = prices[i] * k + ema * (1 - k);
  return ema;
}

// ─── API ENDPOINT ───────────────────────────────────────────────────────

export async function GET() {
  try {
    const [spyJson, vixValue, fearGreedRaw] = await Promise.all([
      getSpyChartData(),
      getVIX(),
      getFearGreed(),
    ]);

    const result = spyJson?.chart?.result?.[0];
    if (!result) {
      return NextResponse.json({ error: "Không lấy được dữ liệu SPY" }, { status: 500 });
    }

    const quote = result.indicators.quote[0];
    const closes: number[] = quote.close.filter((p: number) => p != null);

    if (closes.length < 200) {
      return NextResponse.json({ error: "Không đủ dữ liệu SPY để tính EMA200" }, { status: 500 });
    }

    const currentClose = closes[closes.length - 1];
    const ema20 = calcEMA(closes.slice(-100), 20);
    const ema50 = calcEMA(closes.slice(-150), 50);
    const ema200 = calcEMA(closes, 200);

    // Dùng dữ liệu thật từ CNN nếu có, nếu không thì fallback nội bộ
    let fearGreedData = fearGreedRaw;
    let isFallback = false;
    let fearGreedSource = "cnn";

    if (!fearGreedData) {
      fearGreedData = estimateFearGreedFallback(vixValue, currentClose, ema50, ema200);
      isFallback = true;
      fearGreedSource = "internal_fallback";
      console.warn("Market Regime: dùng Fear&Greed fallback nội bộ vì CNN không truy cập được");
    }

    const fearGreedValue = fearGreedData?.score ?? 50;
    const fearGreedLabel = fearGreedData?.rating ?? "neutral";

    const regimeResult = calculateMarketRegime({
      spyData: {
        close: currentClose,
        ema20,
        ema50,
        ema200,
      },
      fearGreedValue,
      fearGreedLabel,
      vix: vixValue,
    });

    return NextResponse.json({
      ...regimeResult,
      dataQuality: {
        fearGreedSource,
        isFallback,
      },
    });
  } catch (error) {
    console.error("Market Regime API error:", error);
    return NextResponse.json({ error: "Lỗi khi tính Market Regime" }, { status: 500 });
  }
}