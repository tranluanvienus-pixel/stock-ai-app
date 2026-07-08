// ============================================================
// RECOMMENDATION ENGINE
// Quyết định Mua thêm / Chốt lời một phần / Bán hẳn / Giữ nguyên
// dựa trên Scoring Engine + tỷ trọng thật đang giữ
// ============================================================

import type { PortfolioRole } from './scoringEngine'

export type Recommendation = 'buy_more' | 'trim' | 'sell_all' | 'watch' | 'hold'

const MIN_SCORE_TO_BUY = 55
const SCORE_SELL_THRESHOLD = 40
const WEIGHT_OVERAGE_TOLERANCE = 3 // vượt trần bao nhiêu điểm % mới coi là "quá tải", tránh nhạy quá mức

export type RecommendationInput = {
  score_total: number
  portfolio_role: PortfolioRole
  current_weight_pct: number // 0 nếu chưa giữ mã này
  max_position_pct: number // trần tỷ trọng cho investor_type hiện tại
  allow_ai_sell: boolean
  is_currently_held: boolean
  confidence_score: number
  data_completeness_pct: number
}

export type RecommendationResult = {
  recommendation: Recommendation
  reason_codes: string[]
}

export function decideRecommendation(input: RecommendationInput): RecommendationResult {
  // Cửa chặn an toàn: dữ liệu không đủ tin cậy thì không đưa MUA/BÁN
  if (input.confidence_score < 60 || input.data_completeness_pct < 50) {
    return { recommendation: 'watch', reason_codes: ['LOW_CONFIDENCE_OR_INCOMPLETE_DATA'] }
  }
  const codes: string[] = []
  const isOverweight = input.current_weight_pct > input.max_position_pct + WEIGHT_OVERAGE_TOLERANCE
  const isUnderweight = input.current_weight_pct < input.max_position_pct - WEIGHT_OVERAGE_TOLERANCE

  // Trường hợp 1: chưa giữ mã này
  if (!input.is_currently_held) {
    if (input.score_total >= MIN_SCORE_TO_BUY) {
      codes.push('SCORE_GOOD')
      return { recommendation: 'buy_more', reason_codes: codes }
    }
    codes.push('SCORE_INSUFFICIENT')
    return { recommendation: 'watch', reason_codes: codes }
  }

  // Trường hợp 2: đang giữ, điểm rất thấp -> cân nhắc bán
  if (input.score_total <= SCORE_SELL_THRESHOLD) {
    if (!input.allow_ai_sell) {
      codes.push('SCORE_LOW_BUT_SELL_DISABLED')
      return { recommendation: 'hold', reason_codes: codes }
    }
    codes.push('RISK01') // Tỷ trọng/điểm số không còn phù hợp
    return {
      recommendation: isOverweight ? 'sell_all' : 'trim',
      reason_codes: codes,
    }
  }

  // Trường hợp 3: đang giữ, tỷ trọng vượt trần dù điểm vẫn ổn -> chốt lời một phần (quản trị rủi ro, không phải tín hiệu xấu)
  if (isOverweight) {
    codes.push('RISK01')
    return { recommendation: 'trim', reason_codes: codes }
  }

  // Trường hợp 4: đang giữ, điểm cao và còn dư địa tỷ trọng -> mua thêm
  if (input.score_total >= MIN_SCORE_TO_BUY && isUnderweight) {
    codes.push('SCORE_GOOD')
    return { recommendation: 'buy_more', reason_codes: codes }
  }

  // Trường hợp 5: đang giữ, điểm cao nhưng tỷ trọng đã đạt trần -> watch, không phải vì mã xấu
  if (input.score_total >= MIN_SCORE_TO_BUY && !isUnderweight) {
    codes.push('CAP_REACHED')
    return { recommendation: 'watch', reason_codes: codes }
  }

  // Mặc định: không có gì thay đổi đáng kể -> giữ nguyên
  codes.push('NO_SIGNIFICANT_CHANGE')
  return { recommendation: 'hold', reason_codes: codes }
}