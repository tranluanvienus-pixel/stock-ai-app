// ============================================================
// SCORING ENGINE - "bộ não" tính điểm cổ phiếu
// Nguyên tắc: mọi con số ở đây do công thức tính ra, KHÔNG dùng AI
// để tự "cảm nhận" điểm số - AI chỉ dịch reason_codes thành văn sau này
// ============================================================

// ---------- 1. Trọng số theo thời gian đầu tư (horizon) ----------
// 1 năm: ưu tiên momentum + kỹ thuật
// 5 năm trở lên: ưu tiên chất lượng lợi nhuận + định giá
type Weights = {
  growth_momentum: number
  valuation: number
  technical_trend: number
  earnings_quality: number
  news_catalyst: number
  fit_to_goal: number
}

const WEIGHTS_1Y: Weights = {
  growth_momentum: 30,
  valuation: 15,
  technical_trend: 25,
  earnings_quality: 10,
  news_catalyst: 15,
  fit_to_goal: 5,
}

const WEIGHTS_5Y_PLUS: Weights = {
  growth_momentum: 10,
  valuation: 25,
  technical_trend: 10,
  earnings_quality: 30,
  news_catalyst: 10,
  fit_to_goal: 15,
}

function parseHorizonYears(horizon: string): number {
  // horizon dạng "1y", "2y", ..., "10y"
  const n = parseInt(horizon.replace('y', ''), 10)
  return isNaN(n) ? 5 : n
}

// Nội suy tuyến tính giữa mốc 1 năm và 5 năm; từ 5 năm trở lên giữ nguyên mốc 5 năm
function getWeights(horizon: string): Weights {
  const years = Math.min(Math.max(parseHorizonYears(horizon), 1), 5)
  const t = (years - 1) / (5 - 1) // 0 tại năm 1, 1 tại năm 5

  const lerp = (a: number, b: number) => a + (b - a) * t

  return {
    growth_momentum: lerp(WEIGHTS_1Y.growth_momentum, WEIGHTS_5Y_PLUS.growth_momentum),
    valuation: lerp(WEIGHTS_1Y.valuation, WEIGHTS_5Y_PLUS.valuation),
    technical_trend: lerp(WEIGHTS_1Y.technical_trend, WEIGHTS_5Y_PLUS.technical_trend),
    earnings_quality: lerp(WEIGHTS_1Y.earnings_quality, WEIGHTS_5Y_PLUS.earnings_quality),
    news_catalyst: lerp(WEIGHTS_1Y.news_catalyst, WEIGHTS_5Y_PLUS.news_catalyst),
    fit_to_goal: lerp(WEIGHTS_1Y.fit_to_goal, WEIGHTS_5Y_PLUS.fit_to_goal),
  }
}

// ---------- 2. Subscores đầu vào (mỗi yếu tố đã chuẩn hóa 0-100) ----------
// Ở Bước 13a này, các số 0-100 là NHẬP TAY / GIẢ LẬP để test công thức.
// Ở Bước 13b sẽ thay bằng công thức tính thật từ giá, RSI, P/E... của Polygon/Yahoo.
export type Subscores = {
  growth_momentum: number
  valuation: number
  technical_trend: number
  earnings_quality: number
  news_catalyst: number
  fit_to_goal: number
}

function computeScoreTotal(subscores: Subscores, weights: Weights): number {
  const raw =
    (subscores.growth_momentum * weights.growth_momentum +
      subscores.valuation * weights.valuation +
      subscores.technical_trend * weights.technical_trend +
      subscores.earnings_quality * weights.earnings_quality +
      subscores.news_catalyst * weights.news_catalyst +
      subscores.fit_to_goal * weights.fit_to_goal) /
    100
  return Math.round(raw)
}

// ---------- 3. Company Profile (đặc điểm cố định của công ty) ----------
export type CompanyProfile = {
  market_cap_usd: number
  is_profitable: boolean // profitable hay pre-profit
  roe_pct: number | null // null nếu chưa có lợi nhuận
  eps_growth_pct: number | null
  revenue_growth_pct: number
  has_major_catalyst_30d: boolean
  strong_institutional_inflow: boolean
}

// ---------- 4. Portfolio Role (vai trò trong danh mục, tính lại mỗi lần) ----------
export type PortfolioRole = 'core_holding' | 'satellite_growth' | 'opportunistic' | 'speculative'

function determinePortfolioRole(profile: CompanyProfile): PortfolioRole {
  const isLargeCap = profile.market_cap_usd >= 10_000_000_000
  const isStable = profile.is_profitable && (profile.roe_pct ?? 0) >= 15

  if (isLargeCap && isStable) return 'core_holding'
  // Vốn hóa nhỏ + chưa có lợi nhuận -> Speculative, bất kể tăng trưởng doanh thu bao nhiêu
  if (!isLargeCap && !profile.is_profitable) return 'speculative'
  if (profile.revenue_growth_pct >= 30) return 'satellite_growth'
  if (profile.has_major_catalyst_30d) return 'opportunistic'
  return 'satellite_growth'
}

// ---------- 5. Penalty system - cộng/trừ điểm theo vai trò, KHÔNG loại thẳng ----------
function applyPenalty(role: PortfolioRole, profile: CompanyProfile): number {
  let penalty = 0

  // Trọng số phạt/nhẹ hơn tùy vai trò: core_holding bị phạt nặng nhất khi yếu tố nền tảng kém,
  // speculative gần như miễn phạt vì đây là đặc điểm bình thường ở nhóm này
  const severityMultiplier =
    role === 'core_holding' ? 1 : role === 'satellite_growth' ? 0.4 : 0 // speculative = 0

  if (profile.market_cap_usd < 10_000_000_000) penalty -= 8 * severityMultiplier
  if (!profile.is_profitable) penalty -= 6 * severityMultiplier
  if (profile.eps_growth_pct !== null && profile.eps_growth_pct < 0) penalty -= 5 * severityMultiplier

  // Điểm thưởng áp dụng cho MỌI vai trò, nhưng nhóm speculative/satellite được thưởng nhiều hơn
  const bonusMultiplier = role === 'core_holding' ? 0.5 : role === 'satellite_growth' ? 1 : 1.5

  if (profile.revenue_growth_pct >= 80) penalty += 5 * bonusMultiplier
  if (profile.has_major_catalyst_30d) penalty += 5 * bonusMultiplier
  if (profile.strong_institutional_inflow) penalty += 5 * bonusMultiplier

  return Math.round(penalty)
}

// ---------- 6. Confidence Score - ĐỘC LẬP với score_total ----------
export type ConfidenceSignals = {
  data_quality_issue: boolean // dữ liệu thiếu/cũ (VD Alpha Vantage rate-limit fallback)
  data_completeness_pct: number // % dữ liệu đầy đủ (0-100), từ computeDataCompleteness()
  signals_conflict: boolean // các yếu tố mâu thuẫn nhau (VD valuation tốt nhưng technical xấu)
  earnings_within_5_days: boolean
  conflicting_recent_news: boolean
  volatility_abnormally_high: boolean
}

function computeConfidenceScore(signals: ConfidenceSignals): number {
  let confidence = 100
  if (signals.data_quality_issue) confidence -= 20
  if (signals.signals_conflict) confidence -= 15
  if (signals.earnings_within_5_days) confidence -= 25
  if (signals.conflicting_recent_news) confidence -= 15
  if (signals.volatility_abnormally_high) confidence -= 15
  return Math.max(0, Math.round(confidence))
}

// ---------- 7. Reason Codes - mã lý do cố định, AI chỉ dịch thành văn sau ----------
function generateReasonCodes(subscores: Subscores, profile: CompanyProfile): string[] {
  const codes: string[] = []
  if (subscores.valuation >= 70) codes.push('VAL01') // Định giá hấp dẫn
  if (subscores.valuation <= 30) codes.push('VAL02') // Định giá quá cao
  if (subscores.growth_momentum >= 70) codes.push('MOM03') // Động lượng cải thiện
  if (subscores.growth_momentum <= 30) codes.push('MOM04') // Động lượng suy yếu
  if (profile.has_major_catalyst_30d) codes.push('CAT01') // Catalyst lớn sắp tới
  if (profile.revenue_growth_pct >= 80) codes.push('GRW01') // Tăng trưởng doanh thu mạnh
  if (profile.strong_institutional_inflow) codes.push('FLOW01') // Dòng tiền tổ chức mạnh
  return codes
}

// ---------- 8. Hàm tổng hợp - gọi hàm này duy nhất từ bên ngoài ----------
export type EvaluateStockInput = {
  symbol: string
  horizon: string // "1y".."10y", lấy từ user_profile
  subscores: Subscores
  companyProfile: CompanyProfile
  confidenceSignals: ConfidenceSignals
}

export type EvaluateStockResult = {
  symbol: string
  portfolio_role: PortfolioRole
  score_total: number
  confidence_score: number
  reason_codes: string[]
  score_breakdown: Subscores & { penalty: number; weights: Weights }
}

export function evaluateStock(input: EvaluateStockInput): EvaluateStockResult {
  const weights = getWeights(input.horizon)
  const baseScore = computeScoreTotal(input.subscores, weights)
  const role = determinePortfolioRole(input.companyProfile)
  const penalty = applyPenalty(role, input.companyProfile)
  const finalScore = Math.max(0, Math.min(100, baseScore + penalty))
  const confidence = computeConfidenceScore(input.confidenceSignals)
  const reasonCodes = generateReasonCodes(input.subscores, input.companyProfile)

  return {
    symbol: input.symbol,
    portfolio_role: role,
    score_total: finalScore,
    confidence_score: confidence,
    reason_codes: reasonCodes,
    score_breakdown: { ...input.subscores, penalty, weights },
  }
}