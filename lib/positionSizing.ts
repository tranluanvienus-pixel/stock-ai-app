// ============================================================
// POSITION SIZING ALGORITHM
// Tính số cổ phiếu cụ thể dựa trên vốn, điểm số, và Portfolio Rules
// ============================================================

import type { PortfolioRole } from './scoringEngine'

// ---------- Bảng suy ra max_position_pct từ investor_type ----------
const MAX_POSITION_PCT: Record<string, number> = {
  conservative: 13,
  balanced: 17,
  growth: 20,
  aggressive: 22,
}

// Ngưỡng điểm tối thiểu để đủ điều kiện được mua mới — dưới ngưỡng này
// dù có nằm trong top N của danh sách vẫn KHÔNG được chọn (tránh ép mua mã yếu)
const MIN_SCORE_TO_BUY = 55

export type CandidateStock = {
  symbol: string
  score_total: number
  portfolio_role: PortfolioRole
  current_price: number
  sector: string
}

export type PositionSizingInput = {
  capital_usd: number
  cash_reserve_pct: number
  investor_type: string
  candidates: CandidateStock[]
}

export type PositionResult = {
  symbol: string
  portfolio_role: PortfolioRole
  score_total: number
  weight_pct: number
  allocated_usd: number
  shares: number
  price: number
}

export type PositionSizingResult = {
  positions: PositionResult[]
  cash_allocated_usd: number
  cash_pct_actual: number
  leftover_usd: number
  total_invested_usd: number
}

// ---------- Water-Filling: chặn trần từng vòng, không làm mất chênh lệch điểm số ----------
function waterFillWeights(
  scores: { symbol: string; score: number }[],
  targetSum: number,
  capPct: number
): Record<string, number> {
  const weights: Record<string, number> = {}
  const locked = new Set<string>()
  let remaining = [...scores]
  let remainingSum = targetSum

  for (let iter = 0; iter < scores.length; iter++) {
    const totalScore = remaining.reduce((sum, s) => sum + s.score, 0)
    if (totalScore <= 0 || remaining.length === 0) break

    let anyNewlyCapped = false

    for (const s of remaining) {
      const rawWeight = (s.score / totalScore) * remainingSum
      if (rawWeight >= capPct - 0.001) {
        weights[s.symbol] = capPct
        locked.add(s.symbol)
        remainingSum -= capPct
        anyNewlyCapped = true
      }
    }

    remaining = remaining.filter((s) => !locked.has(s.symbol))

    if (!anyNewlyCapped) {
      const finalTotalScore = remaining.reduce((sum, s) => sum + s.score, 0)
      for (const s of remaining) {
        weights[s.symbol] = finalTotalScore > 0 ? (s.score / finalTotalScore) * remainingSum : 0
      }
      break
    }

    if (remaining.length === 0) break
  }

  return weights
}

export function calculatePositionSizing(input: PositionSizingInput): PositionSizingResult {
  const maxPositionPct = MAX_POSITION_PCT[input.investor_type] ?? MAX_POSITION_PCT.balanced

  const investableCapital = input.capital_usd * (1 - input.cash_reserve_pct / 100)
  const targetHoldingsCount = Math.max(1, Math.round((100 - input.cash_reserve_pct) / maxPositionPct))
  const targetSum = 100 - input.cash_reserve_pct

  // Chỉ giữ lại mã đủ điểm để mua mới, rồi mới xếp hạng và chọn top N
  const eligible = input.candidates.filter((c) => c.score_total >= MIN_SCORE_TO_BUY)
  const sorted = [...eligible].sort((a, b) => b.score_total - a.score_total)
  const selected = sorted.slice(0, targetHoldingsCount)

  if (selected.length === 0) {
    return {
      positions: [],
      cash_allocated_usd: input.capital_usd,
      cash_pct_actual: 100,
      leftover_usd: 0,
      total_invested_usd: 0,
    }
  }

  const weights = waterFillWeights(
    selected.map((s) => ({ symbol: s.symbol, score: s.score_total })),
    targetSum,
    maxPositionPct
  )

  let totalInvested = 0
  const positions: PositionResult[] = selected.map((s) => {
    const weightPct = weights[s.symbol] ?? 0
    const allocatedUsd = investableCapital * (weightPct / targetSum)
    const shares = Math.floor(allocatedUsd / s.current_price)
    const actualSpent = shares * s.current_price
    totalInvested += actualSpent

    return {
      symbol: s.symbol,
      portfolio_role: s.portfolio_role,
      score_total: s.score_total,
      weight_pct: Math.round(weightPct * 10) / 10,
      allocated_usd: Math.round(allocatedUsd),
      shares,
      price: s.current_price,
    }
  })

  const cashAllocatedUsd = input.capital_usd - totalInvested
  const leftoverUsd = investableCapital - totalInvested

  return {
    positions,
    cash_allocated_usd: Math.round(cashAllocatedUsd),
    cash_pct_actual: Math.round((cashAllocatedUsd / input.capital_usd) * 1000) / 10,
    leftover_usd: Math.round(leftoverUsd),
    total_invested_usd: Math.round(totalInvested),
  }
}