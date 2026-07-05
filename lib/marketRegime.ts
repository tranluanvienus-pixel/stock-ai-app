// lib/marketRegime.ts

export type MarketRegimeLabel = 
  | "BULLISH" 
  | "NEUTRAL" 
  | "BEARISH" 
  | "HIGH_VOLATILITY";

export interface MarketRegimeResult {
  regime: MarketRegimeLabel;
  score: number; // -100 (rất xấu) đến +100 (rất tốt)
  confidence: number; // 0-100, mức độ chắc chắn của kết luận
  signals: {
    spyTrend: "UP" | "DOWN" | "SIDEWAYS";
    fearGreedValue: number;
    fearGreedLabel: string;
    vix: number | null;
  };
  reasonCodes: string[]; // để Explanation Layer (Groq) dùng, không bịa lý do
  updatedAt: string;
}

interface SpyPriceData {
  close: number;
  ema20: number;
  ema50: number;
  ema200: number;
}

/**
 * Xác định xu hướng SPY dựa trên vị trí giá so với các đường EMA
 */
function determineSpyTrend(data: SpyPriceData): {
  trend: "UP" | "DOWN" | "SIDEWAYS";
  trendScore: number; // -50 đến +50
  reasons: string[];
} {
  const { close, ema20, ema50, ema200 } = data;
  const reasons: string[] = [];
  let trendScore = 0;

  if (close > ema50 && close > ema200) {
    trendScore += 30;
    reasons.push("SPY đang giao dịch trên EMA50 và EMA200 (xu hướng tăng dài hạn)");
  } else if (close < ema50 && close < ema200) {
    trendScore -= 30;
    reasons.push("SPY đang giao dịch dưới EMA50 và EMA200 (xu hướng giảm dài hạn)");
  }

  if (ema20 > ema50 && ema50 > ema200) {
    trendScore += 20;
    reasons.push("Cấu trúc EMA xếp tăng dần (20>50>200) - xác nhận uptrend");
  } else if (ema20 < ema50 && ema50 < ema200) {
    trendScore -= 20;
    reasons.push("Cấu trúc EMA xếp giảm dần (20<50<200) - xác nhận downtrend");
  }

  let trend: "UP" | "DOWN" | "SIDEWAYS" = "SIDEWAYS";
  if (trendScore >= 20) trend = "UP";
  else if (trendScore <= -20) trend = "DOWN";

  return { trend, trendScore, reasons };
}

/**
 * Chuyển Fear & Greed Index (0-100) thành điểm đóng góp cho regime score
 */
function scoreFearGreed(value: number): { score: number; reason: string } {
  if (value >= 75) {
    return { score: -15, reason: `Fear & Greed = ${value} (Extreme Greed - cảnh báo rủi ro đảo chiều)` };
  }
  if (value >= 55) {
    return { score: 20, reason: `Fear & Greed = ${value} (Greed - tâm lý tích cực)` };
  }
  if (value >= 45) {
    return { score: 0, reason: `Fear & Greed = ${value} (Neutral)` };
  }
  if (value >= 25) {
    return { score: -20, reason: `Fear & Greed = ${value} (Fear - tâm lý tiêu cực)` };
  }
  return { score: 10, reason: `Fear & Greed = ${value} (Extreme Fear - có thể là vùng đáy)` };
}

/**
 * Đánh giá VIX - biến động cao sẽ override các tín hiệu khác
 */
function scoreVix(vix: number | null): { score: number; isHighVol: boolean; reason: string | null } {
  if (vix === null) {
    return { score: 0, isHighVol: false, reason: null };
  }
  if (vix >= 30) {
    return { score: -30, isHighVol: true, reason: `VIX = ${vix.toFixed(1)} (biến động rất cao - thị trường bất ổn)` };
  }
  if (vix >= 20) {
    return { score: -10, isHighVol: false, reason: `VIX = ${vix.toFixed(1)} (biến động tăng cao hơn bình thường)` };
  }
  return { score: 10, isHighVol: false, reason: `VIX = ${vix.toFixed(1)} (biến động thấp, ổn định)` };
}

/**
 * HÀM CHÍNH: Tổng hợp regime từ 3 tín hiệu
 */
export function calculateMarketRegime(input: {
  spyData: SpyPriceData;
  fearGreedValue: number;
  fearGreedLabel: string;
  vix: number | null;
}): MarketRegimeResult {
  const { spyData, fearGreedValue, fearGreedLabel, vix } = input;

  const trendResult = determineSpyTrend(spyData);
  const fgResult = scoreFearGreed(fearGreedValue);
  const vixResult = scoreVix(vix);

  const totalScore = trendResult.trendScore + fgResult.score + vixResult.score;

  const reasonCodes = [...trendResult.reasons, fgResult.reason];
  if (vixResult.reason) reasonCodes.push(vixResult.reason);

  // VIX cao ưu tiên override thành HIGH_VOLATILITY
  let regime: MarketRegimeLabel;
  if (vixResult.isHighVol) {
    regime = "HIGH_VOLATILITY";
  } else if (totalScore >= 25) {
    regime = "BULLISH";
  } else if (totalScore <= -25) {
    regime = "BEARISH";
  } else {
    regime = "NEUTRAL";
  }

  // Confidence: tín hiệu càng đồng thuận (cùng chiều) thì confidence càng cao
  const signalsAgree =
    (trendResult.trendScore > 0 && fgResult.score > 0) ||
    (trendResult.trendScore < 0 && fgResult.score < 0);
  const confidence = signalsAgree ? 80 : 55;

  return {
    regime,
    score: Math.max(-100, Math.min(100, totalScore)),
    confidence,
    signals: {
      spyTrend: trendResult.trend,
      fearGreedValue,
      fearGreedLabel,
      vix,
    },
    reasonCodes,
    updatedAt: new Date().toISOString(),
  };
}