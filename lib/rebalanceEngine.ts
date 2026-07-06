import { calculatePositionSizing, calculateRebalanceWeights, CandidateStock } from "./positionSizing";
import { PortfolioRole } from "./scoringEngine";
import { MarketRegimeLabel } from "./marketRegime";

// ─── Input types ─────────────────────────────────────────────

export interface CurrentHolding {
  symbol: string;
  shares: number;
  currentPrice: number;
  scoreTotal: number;
  portfolioRole: PortfolioRole;
  sector: string;
}

export interface RebalanceInput {
  currentHoldings: CurrentHolding[];
  investorType: string;
  cashReservePct: number;
  marketRegime: MarketRegimeLabel;
  minTradeThresholdPct?: number; // mặc định 3%, tránh đề xuất giao dịch vặt
}

// ─── Output types ─────────────────────────────────────────────

export type RebalanceAction = "BUY_MORE" | "SELL_PARTIAL" | "EXIT_FULLY" | "HOLD";

export interface RebalanceRecommendation {
  symbol: string;
  action: RebalanceAction;
  currentShares: number;
  targetShares: number;
  deltaShares: number; // dương = mua thêm, âm = bán bớt
  currentWeightPct: number;
  targetWeightPct: number;
  currentValueUsd: number;
  targetValueUsd: number;
  scoreTotal: number;
  reason: string;
}

export interface RebalanceResult {
  recommendations: RebalanceRecommendation[];
  totalPortfolioValueUsd: number;
  summary: {
    buyCount: number;
    sellCount: number;
    exitCount: number;
    holdCount: number;
  };
  reasonCodes: string[];
  updatedAt: string;
}

// ─── HÀM CHÍNH ─────────────────────────────────────────────────

export function calculateRebalance(input: RebalanceInput): RebalanceResult {
  const { currentHoldings, investorType, cashReservePct, marketRegime } = input;
  const minTradeThresholdPct = input.minTradeThresholdPct ?? 3;

  if (currentHoldings.length === 0) {
    return {
      recommendations: [],
      totalPortfolioValueUsd: 0,
      summary: { buyCount: 0, sellCount: 0, exitCount: 0, holdCount: 0 },
      reasonCodes: ["Danh mục chưa có vị thế nào để tái cân bằng"],
      updatedAt: new Date().toISOString(),
    };
  }

  // 1. Tính tổng giá trị danh mục hiện tại (theo giá thị trường)
  const totalPortfolioValueUsd = currentHoldings.reduce(
    (sum, h) => sum + h.shares * h.currentPrice,
    0
  );

  // 2. Dùng Water-Filling để tính tỷ trọng MỤC TIÊU lý tưởng,
  // coi tổng giá trị hiện tại như "vốn" phân bổ lại từ đầu
  const candidates: CandidateStock[] = currentHoldings.map((h) => ({
    symbol: h.symbol,
    score_total: h.scoreTotal,
    portfolio_role: h.portfolioRole,
    current_price: h.currentPrice,
    sector: h.sector,
  }));

  const sizingResult = calculateRebalanceWeights({
    capital_usd: totalPortfolioValueUsd,
    cash_reserve_pct: cashReservePct,
    investor_type: investorType,
    candidates,
  });

  // Map kết quả target theo symbol để tra cứu nhanh
  const targetMap = new Map(sizingResult.positions.map((p) => [p.symbol, p]));

  // 3. So sánh hiện tại vs mục tiêu, sinh khuyến nghị
  const recommendations: RebalanceRecommendation[] = [];
  const reasonCodes: string[] = [];

  for (const h of currentHoldings) {
    const currentValueUsd = h.shares * h.currentPrice;
    const currentWeightPct =
      totalPortfolioValueUsd > 0 ? (currentValueUsd / totalPortfolioValueUsd) * 100 : 0;

    const target = targetMap.get(h.symbol);

    // Trường hợp: mã không đủ điều kiện nằm trong danh mục mục tiêu (điểm quá thấp
    // hoặc bị loại do vượt quá số lượng vị thế tối đa) -> đề xuất thoát hoàn toàn
    if (!target) {
      recommendations.push({
        symbol: h.symbol,
        action: "EXIT_FULLY",
        currentShares: h.shares,
        targetShares: 0,
        deltaShares: -h.shares,
        currentWeightPct: Math.round(currentWeightPct * 10) / 10,
        targetWeightPct: 0,
        currentValueUsd: Math.round(currentValueUsd),
        targetValueUsd: 0,
        scoreTotal: h.scoreTotal,
        reason: `Điểm số ${h.scoreTotal}/100 — dưới ngưỡng an toàn tối thiểu (30/100), công ty có dấu hiệu suy yếu nghiêm trọng. Đề xuất bán hết ${h.shares} cổ đang giữ để tránh rủi ro tiếp tục xuống thêm.`,
      });
      continue;
    }

    const targetShares = target.shares;
    const targetValueUsd = target.allocated_usd;
    const deltaShares = targetShares - h.shares;
    const deltaPct = currentWeightPct - target.weight_pct;

    let action: RebalanceAction = "HOLD";
    let reason = `Điểm số ${h.scoreTotal}/100 — tỷ trọng hiện tại ${currentWeightPct.toFixed(1)}% đã gần với mục tiêu ${target.weight_pct.toFixed(1)}% (chênh lệch dưới ${minTradeThresholdPct}%). Giữ nguyên ${h.shares} cổ, chưa cần điều chỉnh.`;

    if (Math.abs(deltaPct) < minTradeThresholdPct) {
      action = "HOLD";
    } else if (deltaShares > 0) {
      action = "BUY_MORE";
      reason = `Điểm số ${h.scoreTotal}/100 — tỷ trọng hiện tại ${currentWeightPct.toFixed(1)}% thấp hơn mục tiêu ${target.weight_pct.toFixed(1)}%. Đề xuất mua thêm ${deltaShares} cổ (từ ${h.shares} lên ${targetShares} cổ) để đạt đúng tỷ trọng.`;
    } else if (deltaShares < 0) {
      action = "SELL_PARTIAL";
      reason = `Điểm số ${h.scoreTotal}/100 — tỷ trọng hiện tại ${currentWeightPct.toFixed(1)}% cao hơn mục tiêu ${target.weight_pct.toFixed(1)}%. Đề xuất bán bớt ${Math.abs(deltaShares)} cổ (từ ${h.shares} xuống ${targetShares} cổ), vẫn giữ lại phần còn lại — không bán hết.`;
    }

    recommendations.push({
      symbol: h.symbol,
      action,
      currentShares: h.shares,
      targetShares,
      deltaShares,
      currentWeightPct: Math.round(currentWeightPct * 10) / 10,
      targetWeightPct: target.weight_pct,
      currentValueUsd: Math.round(currentValueUsd),
      targetValueUsd: Math.round(targetValueUsd),
      scoreTotal: h.scoreTotal,
      reason,
    });
  }

  // 4. Reason codes tổng quan theo market regime
  if (marketRegime === "BEARISH" || marketRegime === "HIGH_VOLATILITY") {
    reasonCodes.push(
      `Thị trường đang ${marketRegime === "BEARISH" ? "giảm" : "biến động cao"} — ưu tiên thực hiện các đề xuất GIẢM/THOÁT trước, thận trọng với MUA THÊM`
    );
  } else if (marketRegime === "BULLISH") {
    reasonCodes.push("Thị trường đang tăng tốt — điều kiện thuận lợi để thực hiện tái cân bằng");
  }

  const summary = {
    buyCount: recommendations.filter((r) => r.action === "BUY_MORE").length,
    sellCount: recommendations.filter((r) => r.action === "SELL_PARTIAL").length,
    exitCount: recommendations.filter((r) => r.action === "EXIT_FULLY").length,
    holdCount: recommendations.filter((r) => r.action === "HOLD").length,
  };

  return {
    recommendations,
    totalPortfolioValueUsd: Math.round(totalPortfolioValueUsd),
    summary,
    reasonCodes,
    updatedAt: new Date().toISOString(),
  };
}