import { calculatePositionSizing, CandidateStock } from "./positionSizing";
import { PortfolioRole } from "./scoringEngine";

// ─── Input types ─────────────────────────────────────────────

export interface CurrentHoldingForDeploy {
  symbol: string;
  shares: number;
  currentPrice: number;
  scoreTotal: number;
  portfolioRole: PortfolioRole;
  sector: string;
}

export interface DeployCashInput {
  newCashUsd: number;
  currentHoldings: CurrentHoldingForDeploy[];
  investorType: string;
  cashReservePct: number;
}

// ─── Output types ─────────────────────────────────────────────

export interface DeployCashRecommendation {
  symbol: string;
  currentShares: number;
  currentWeightPct: number;
  targetWeightPct: number;
  sharesToAdd: number;
  costUsd: number;
  scoreTotal: number;
  reason: string;
}

export interface DeployCashResult {
  newCashUsd: number;
  totalPortfolioValueAfterUsd: number;
  recommendations: DeployCashRecommendation[];
  totalDeployedUsd: number;
  leftoverCashUsd: number;
  reasonCodes: string[];
  updatedAt: string;
}

// ─── HÀM CHÍNH ─────────────────────────────────────────────────

export function calculateDeployCash(input: DeployCashInput): DeployCashResult {
  const { newCashUsd, currentHoldings, investorType, cashReservePct } = input;

  if (currentHoldings.length === 0) {
    return {
      newCashUsd,
      totalPortfolioValueAfterUsd: newCashUsd,
      recommendations: [],
      totalDeployedUsd: 0,
      leftoverCashUsd: newCashUsd,
      reasonCodes: ["Chưa có danh mục hiện tại — hãy dùng chức năng mua mới thay vì thêm vốn"],
      updatedAt: new Date().toISOString(),
    };
  }

  // 1. Tổng giá trị hiện tại + tiền mới = "vốn mới" để tính lại tỷ trọng mục tiêu
  const currentTotalValueUsd = currentHoldings.reduce(
    (sum, h) => sum + h.shares * h.currentPrice,
    0
  );
  const totalPortfolioValueAfterUsd = currentTotalValueUsd + newCashUsd;

  // 2. Dùng Water-Filling trên TỔNG vốn mới để biết tỷ trọng mục tiêu lý tưởng
  const candidates: CandidateStock[] = currentHoldings.map((h) => ({
    symbol: h.symbol,
    score_total: h.scoreTotal,
    portfolio_role: h.portfolioRole,
    current_price: h.currentPrice,
    sector: h.sector,
  }));

  const sizingResult = calculatePositionSizing({
    capital_usd: totalPortfolioValueAfterUsd,
    cash_reserve_pct: cashReservePct,
    investor_type: investorType,
    candidates,
  });

  const targetMap = new Map(sizingResult.positions.map((p) => [p.symbol, p]));

  // 3. Với mỗi mã đang có, tính xem cần mua thêm bao nhiêu để đạt tỷ trọng mục tiêu MỚI,
  // CHỈ đề xuất mua thêm (không bao giờ đề xuất bán ở đây)
  const recommendations: DeployCashRecommendation[] = [];
  let remainingCash = newCashUsd;

  // Ưu tiên rót tiền vào mã đang THIẾU tỷ trọng nhiều nhất trước (điểm cao được ưu tiên tự nhiên
  // vì Water-Filling đã tính target dựa theo điểm số)
  const gaps = currentHoldings
    .map((h) => {
      const currentValueUsd = h.shares * h.currentPrice;
      const currentWeightPct =
        totalPortfolioValueAfterUsd > 0 ? (currentValueUsd / totalPortfolioValueAfterUsd) * 100 : 0;
      const target = targetMap.get(h.symbol);
      const targetValueUsd = target ? target.allocated_usd : 0;
      const gapUsd = targetValueUsd - currentValueUsd;
      return { holding: h, currentWeightPct, target, targetValueUsd, gapUsd };
    })
    .filter((g) => g.target && g.gapUsd > 0) // chỉ những mã đang THIẾU so với mục tiêu
    .sort((a, b) => b.gapUsd - a.gapUsd); // ưu tiên mã thiếu nhiều nhất trước

  for (const g of gaps) {
    if (remainingCash <= 0) break;

    const amountToInvest = Math.min(g.gapUsd, remainingCash);
    const sharesToAdd = Math.floor(amountToInvest / g.holding.currentPrice);
    const costUsd = sharesToAdd * g.holding.currentPrice;

    if (sharesToAdd > 0) {
      recommendations.push({
        symbol: g.holding.symbol,
        currentShares: g.holding.shares,
        currentWeightPct: Math.round(g.currentWeightPct * 10) / 10,
        targetWeightPct: g.target!.weight_pct,
        sharesToAdd,
        costUsd: Math.round(costUsd),
        scoreTotal: g.holding.scoreTotal,
        reason: `Đang ở ${g.currentWeightPct.toFixed(1)}%, mục tiêu ${g.target!.weight_pct.toFixed(
          1
        )}% — điểm số ${g.holding.scoreTotal}/100`,
      });
      remainingCash -= costUsd;
    }
  }

  const totalDeployedUsd = recommendations.reduce((sum, r) => sum + r.costUsd, 0);

  const reasonCodes: string[] = [];
  if (recommendations.length === 0) {
    reasonCodes.push(
      "Không có mã nào đủ điều kiện nhận thêm vốn — danh mục hiện tại đã cân bằng hoặc các mã đều đã đạt/vượt tỷ trọng mục tiêu"
    );
  } else {
    reasonCodes.push(
      `Đề xuất phân bổ ${totalDeployedUsd.toLocaleString()} USD vào ${recommendations.length} mã đang dưới tỷ trọng mục tiêu`
    );
  }
  if (remainingCash > 0 && recommendations.length > 0) {
    reasonCodes.push(
      `Còn dư ${Math.round(remainingCash).toLocaleString()} USD chưa phân bổ hết — có thể do các mã đã đạt gần tỷ trọng mục tiêu hoặc số tiền lẻ không đủ mua thêm 1 cổ phiếu`
    );
  }

  return {
    newCashUsd,
    totalPortfolioValueAfterUsd: Math.round(totalPortfolioValueAfterUsd),
    recommendations,
    totalDeployedUsd: Math.round(totalDeployedUsd),
    leftoverCashUsd: Math.round(remainingCash),
    reasonCodes,
    updatedAt: new Date().toISOString(),
  };
}