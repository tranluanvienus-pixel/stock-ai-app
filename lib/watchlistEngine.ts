import { PortfolioRole } from "./scoringEngine";

// ─── Input types ─────────────────────────────────────────────

export interface WatchlistStockInput {
  symbol: string;
  scoreTotal: number; // điểm tổng hợp từ evaluateStock
  subscoreValuation: number; // 0-100, từ score_breakdown.valuation
  subscoreGrowthMomentum: number; // 0-100, từ score_breakdown.growth_momentum
  subscoreTechnicalTrend: number; // 0-100, từ score_breakdown.technical_trend
  portfolioRole: PortfolioRole;
  currentPrice: number;
  perf20d: number; // % thay đổi giá 20 ngày gần nhất (từ raw_technical_score nguồn hoặc indicators.perf20d)
  rsi: number; // chỉ số RSI hiện tại
  note: string | null;
  peRatioMissing: boolean;
}

// ─── Output types ─────────────────────────────────────────────

export type WatchlistLabel =
  | "MOMENTUM_PICK"
  | "VALUE_OPPORTUNITY"
  | "OVEREXTENDED_CAUTION"
  | "NEUTRAL";

export interface WatchlistStockResult {
  symbol: string;
  scoreTotal: number;
  labels: WatchlistLabel[];
  currentPrice: number;
  note: string | null;
  reasonCodes: string[];
}

export interface WatchlistResult {
  stocks: WatchlistStockResult[];
  summary: {
    momentumPickCount: number;
    valueOpportunityCount: number;
    overextendedCautionCount: number;
    neutralCount: number;
  };
  updatedAt: string;
}

// ─── Ngưỡng phân loại ─────────────────────────────────────────

const MOMENTUM_PICK_MIN_SCORE = 65;

const VALUE_OPPORTUNITY_MIN_VALUATION = 65;
const VALUE_OPPORTUNITY_MAX_MOMENTUM = 50; // momentum còn yếu -> chưa được thị trường chú ý

const OVEREXTENDED_MIN_PERF20D = 40; // giá đã tăng >40% trong 20 ngày
const OVEREXTENDED_MIN_RSI = 75; // RSI cao kéo dài

// ─── Phân loại 1 mã ─────────────────────────────────────────

function classifyStock(input: WatchlistStockInput): { labels: WatchlistLabel[]; reasonCodes: string[] } {
  const labels: WatchlistLabel[] = [];
  const reasonCodes: string[] = [];

  // MOMENTUM_PICK: điểm tổng cao, đang có xu hướng tốt
  if (input.scoreTotal >= MOMENTUM_PICK_MIN_SCORE) {
    labels.push("MOMENTUM_PICK");
    reasonCodes.push(`Điểm tổng ${input.scoreTotal}/100 — đang có xu hướng tích cực, phù hợp cân nhắc mua`);
  }

  // VALUE_OPPORTUNITY: định giá tốt nhưng momentum chưa cao -> dễ bị bỏ sót
  if (
    input.subscoreValuation >= VALUE_OPPORTUNITY_MIN_VALUATION &&
    input.subscoreGrowthMomentum <= VALUE_OPPORTUNITY_MAX_MOMENTUM
  ) {
    labels.push("VALUE_OPPORTUNITY");
    reasonCodes.push(
      `Định giá hấp dẫn (${input.subscoreValuation}/100) nhưng momentum còn yếu (${input.subscoreGrowthMomentum}/100) — có thể là cơ hội giá trị chưa được thị trường chú ý`
    );
  }

  // OVEREXTENDED_CAUTION: giá đã tăng quá mạnh, quá nhanh -> rủi ro mua đỉnh
  if (input.perf20d >= OVEREXTENDED_MIN_PERF20D && input.rsi >= OVEREXTENDED_MIN_RSI) {
    labels.push("OVEREXTENDED_CAUTION");
    reasonCodes.push(
      `Giá đã tăng ${input.perf20d.toFixed(0)}% trong 20 ngày, RSI ${input.rsi.toFixed(
        0
      )} — dấu hiệu quá đà, cân nhắc rủi ro mua đỉnh trước khi vào lệnh`
    );
  }

  if (input.peRatioMissing) {
    reasonCodes.push(
      "Không tính được P/E do công ty đang lỗ — điểm định giá (valuation) đang dùng giá trị trung tính mặc định, có thể chưa phản ánh đúng thực tế, nên tự đánh giá thêm"
    );
  }

  if (labels.length === 0) {
    labels.push("NEUTRAL");
    reasonCodes.push("Không có tín hiệu nổi bật ở khía cạnh giá trị, động lượng, hay cảnh báo quá đà");
  }

  return { labels, reasonCodes };
}

// ─── HÀM CHÍNH ─────────────────────────────────────────────────

export function calculateWatchlist(stocks: WatchlistStockInput[]): WatchlistResult {
  const results: WatchlistStockResult[] = stocks.map((s) => {
    const { labels, reasonCodes } = classifyStock(s);
    return {
      symbol: s.symbol,
      scoreTotal: s.scoreTotal,
      labels,
      currentPrice: s.currentPrice,
      note: s.note,
      reasonCodes,
    };
  });

  const summary = {
    momentumPickCount: results.filter((r) => r.labels.includes("MOMENTUM_PICK")).length,
    valueOpportunityCount: results.filter((r) => r.labels.includes("VALUE_OPPORTUNITY")).length,
    overextendedCautionCount: results.filter((r) => r.labels.includes("OVEREXTENDED_CAUTION")).length,
    neutralCount: results.filter((r) => r.labels.includes("NEUTRAL")).length,
  };

  return {
    stocks: results,
    summary,
    updatedAt: new Date().toISOString(),
  };
}