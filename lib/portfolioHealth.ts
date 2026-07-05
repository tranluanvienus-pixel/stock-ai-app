import { PortfolioRole } from "./scoringEngine";
import { MarketRegimeLabel } from "./marketRegime";

// ─── Input types ─────────────────────────────────────────────

export interface HoldingHealthInput {
  symbol: string;
  marketValue: number; // shares * giá hiện tại
  scoreTotal: number; // 0-100, từ evaluateStock
  confidenceScore: number; // 0-100
  portfolioRole: PortfolioRole;
  sector: string | null;
}

export interface PortfolioHealthInput {
  holdings: HoldingHealthInput[];
  marketRegime: MarketRegimeLabel;
}

// ─── Output types ─────────────────────────────────────────────

export interface PortfolioHealthResult {
  healthScore: number; // 0-100 tổng
  grade: "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "CRITICAL";
  breakdown: {
    qualityScore: number;
    diversificationScore: number;
    confidenceScore: number;
    regimeAlignmentScore: number;
  };
  concentrationWarnings: string[]; // ví dụ "NVDA chiếm 42% danh mục"
  reasonCodes: string[];
  updatedAt: string;
}

// ─── Helper: tính điểm trung bình có trọng số theo giá trị $ ───

function weightedAverage(holdings: HoldingHealthInput[], getValue: (h: HoldingHealthInput) => number): number {
  const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  if (totalValue === 0) return 0;
  const weightedSum = holdings.reduce((sum, h) => sum + getValue(h) * h.marketValue, 0);
  return weightedSum / totalValue;
}

// ─── 1. Quality Score (50%): điểm chất lượng trung bình theo $ ───

function calculateQualityScore(holdings: HoldingHealthInput[]): number {
  return Math.round(weightedAverage(holdings, (h) => h.scoreTotal));
}

// ─── 2. Diversification Score (25%): dùng Herfindahl Index (HHI) ───
// HHI càng cao (gần 10000) = càng tập trung = càng rủi ro
// HHI càng thấp (gần 0) = càng đa dạng = càng an toàn

function calculateDiversificationScore(holdings: HoldingHealthInput[]): {
  score: number;
  warnings: string[];
} {
  const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  const warnings: string[] = [];

  if (totalValue === 0 || holdings.length === 0) {
    return { score: 0, warnings: ["Danh mục trống"] };
  }

  // HHI theo mã cổ phiếu
  let hhiSymbol = 0;
  for (const h of holdings) {
    const weightPct = (h.marketValue / totalValue) * 100;
    hhiSymbol += weightPct * weightPct;
    if (weightPct >= 35) {
      warnings.push(`${h.symbol} chiếm ${weightPct.toFixed(0)}% danh mục — tập trung rủi ro cao`);
    } else if (weightPct >= 25) {
      warnings.push(`${h.symbol} chiếm ${weightPct.toFixed(0)}% danh mục — nên theo dõi mức tập trung`);
    }
  }

  // HHI theo ngành
  const sectorMap = new Map<string, number>();
  for (const h of holdings) {
    const sector = h.sector || "Unknown";
    sectorMap.set(sector, (sectorMap.get(sector) || 0) + h.marketValue);
  }
  let hhiSector = 0;
  for (const [sector, value] of sectorMap) {
    const weightPct = (value / totalValue) * 100;
    hhiSector += weightPct * weightPct;
    if (weightPct >= 50 && sectorMap.size > 1) {
      warnings.push(`Ngành ${sector} chiếm ${weightPct.toFixed(0)}% danh mục — thiếu đa dạng ngành`);
    }
  }

  // Chuyển HHI (0-10000) thành điểm 0-100 (HHI thấp = điểm cao)
  // HHI = 10000 (1 mã duy nhất) -> điểm 0
  // HHI = 1000 (đa dạng tốt, tương đương ~10 mã đều nhau) -> điểm 100
  const symbolScore = Math.max(0, Math.min(100, 100 - ((hhiSymbol - 1000) / 90)));
  const sectorScore = Math.max(0, Math.min(100, 100 - ((hhiSector - 1500) / 85)));

  const score = Math.round(symbolScore * 0.6 + sectorScore * 0.4);

  return { score, warnings };
}

// ─── 3. Confidence Score (15%): độ tin cậy dữ liệu trung bình ───

function calculateConfidenceScore(holdings: HoldingHealthInput[]): number {
  return Math.round(weightedAverage(holdings, (h) => h.confidenceScore));
}

// ─── 4. Regime Alignment Score (10%): danh mục có phù hợp với market regime không ───

function calculateRegimeAlignmentScore(
  holdings: HoldingHealthInput[],
  regime: MarketRegimeLabel
): { score: number; reasonCodes: string[] } {
  const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  const reasonCodes: string[] = [];

  if (totalValue === 0) return { score: 50, reasonCodes: [] };

  const riskyValue = holdings
    .filter((h) => h.portfolioRole === "speculative" || h.portfolioRole === "opportunistic")
    .reduce((sum, h) => sum + h.marketValue, 0);
  const riskyPct = (riskyValue / totalValue) * 100;

  let score = 100;

  if (regime === "BEARISH" || regime === "HIGH_VOLATILITY") {
    if (riskyPct >= 50) {
      score = 30;
      reasonCodes.push(
        `Thị trường đang ${regime === "BEARISH" ? "giảm" : "biến động cao"}, nhưng ${riskyPct.toFixed(
          0
        )}% danh mục là cổ phiếu rủi ro cao (speculative/opportunistic)`
      );
    } else if (riskyPct >= 25) {
      score = 65;
      reasonCodes.push(
        `Thị trường đang ${regime === "BEARISH" ? "giảm" : "biến động cao"}, danh mục có ${riskyPct.toFixed(
          0
        )}% cổ phiếu rủi ro cao — cân nhắc giảm tỷ trọng`
      );
    } else {
      score = 90;
      reasonCodes.push(`Danh mục khá thận trọng, phù hợp với thị trường ${regime === "BEARISH" ? "giảm" : "biến động cao"} hiện tại`);
    }
  } else if (regime === "BULLISH") {
    score = 90;
    if (riskyPct < 10) {
      reasonCodes.push("Thị trường đang tăng tốt nhưng danh mục khá thận trọng — có thể bỏ lỡ cơ hội tăng trưởng");
      score = 75;
    }
  } else {
    score = 80;
  }

  return { score, reasonCodes };
}

// ─── HÀM CHÍNH ─────────────────────────────────────────────────

export function calculatePortfolioHealth(input: PortfolioHealthInput): PortfolioHealthResult {
  const { holdings, marketRegime } = input;

  if (holdings.length === 0) {
    return {
      healthScore: 0,
      grade: "CRITICAL",
      breakdown: { qualityScore: 0, diversificationScore: 0, confidenceScore: 0, regimeAlignmentScore: 0 },
      concentrationWarnings: [],
      reasonCodes: ["Danh mục chưa có vị thế nào"],
      updatedAt: new Date().toISOString(),
    };
  }

  const qualityScore = calculateQualityScore(holdings);
  const { score: diversificationScore, warnings } = calculateDiversificationScore(holdings);
  const confidenceScore = calculateConfidenceScore(holdings);
  const { score: regimeAlignmentScore, reasonCodes: regimeReasons } = calculateRegimeAlignmentScore(
    holdings,
    marketRegime
  );

  const healthScore = Math.round(
    qualityScore * 0.5 + diversificationScore * 0.25 + confidenceScore * 0.15 + regimeAlignmentScore * 0.1
  );

  let grade: PortfolioHealthResult["grade"] = "FAIR";
  if (healthScore >= 80) grade = "EXCELLENT";
  else if (healthScore >= 65) grade = "GOOD";
  else if (healthScore >= 50) grade = "FAIR";
  else if (healthScore >= 30) grade = "POOR";
  else grade = "CRITICAL";

  return {
    healthScore,
    grade,
    breakdown: { qualityScore, diversificationScore, confidenceScore, regimeAlignmentScore },
    concentrationWarnings: warnings,
    reasonCodes: regimeReasons,
    updatedAt: new Date().toISOString(),
  };
}