import type { Subscores, CompanyProfile, ConfidenceSignals } from './scoringEngine'

// Hàm giới hạn số trong khoảng min-max
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

// Dữ liệu đầu vào lấy từ response của route /api/analyze hiện có
export type AnalyzeApiResponse = {
  score: number // điểm kỹ thuật tổng hợp 0-100 đã có sẵn (RSI, MA, MACD, ADX, OBV, BB...)
  peRatio: string | null
  marketCap: number | null
  returnOnEquity: string | null
  debtToEquity: string | null
  beta: string | null
  targetPrice: string | null
  price: string
  newsScore: number | null // -100 đến 100, từ Groq
  news: { title: string; sentiment: string }[]
  indicators: {
    perf5d: string
    perf20d: string
    obvTrend: string
    volumeRatio: string
    ivRank: string
    rsi: string
    stochRSI: string
  }
  // revenueGrowth không nằm sẵn trong response cũ dưới tên rõ ràng,
  // nhưng company data có field này — bổ sung optional để không lỗi nếu thiếu
  companyRevenueGrowth?: number | null
}

// ---------- 1. Tính growth_momentum (0-100) ----------
function computeGrowthMomentum(data: AnalyzeApiResponse): number {
  let m = 50
  const perf5d = parseFloat(data.indicators.perf5d) || 0
  const perf20d = parseFloat(data.indicators.perf20d) || 0
  const stochRSI = parseFloat(data.indicators.stochRSI) || 50

  m += clamp(perf5d * 3, -20, 20)
  m += clamp(perf20d * 1, -15, 15)
  if (stochRSI < 40) m += 10
  if (stochRSI > 80) m -= 10

  return Math.round(clamp(m, 0, 100))
}

// ---------- 2. Tính valuation (0-100) ----------
function computeValuation(data: AnalyzeApiResponse): number {
  const pe = data.peRatio ? parseFloat(data.peRatio) : null
  if (pe === null || pe <= 0) return 50 // không có dữ liệu -> trung tính

  let v: number
  if (pe <= 15) v = 80
  else if (pe <= 25) v = 65
  else if (pe <= 35) v = 50
  else if (pe <= 50) v = 35
  else v = 20

  // Điều chỉnh thêm theo dư địa tăng giá (target price vs giá hiện tại)
  const target = data.targetPrice ? parseFloat(data.targetPrice) : null
  const price = parseFloat(data.price)
  if (target && price) {
    const upside = ((target - price) / price) * 100
    v += clamp(upside * 0.5, -10, 10)
  }

  return Math.round(clamp(v, 0, 100))
}

// ---------- 3. Tính technical_trend (0-100) ----------
// Tái sử dụng trực tiếp "score" đã có sẵn trong route analyze —
// nó vốn đã tổng hợp RSI/MA/MACD/BB/ADX/OBV/Volume nên rất phù hợp làm technical_trend
function computeTechnicalTrend(data: AnalyzeApiResponse): number {
  return Math.round(clamp(data.score, 0, 100))
}

// ---------- 4. Tính earnings_quality (0-100) ----------
function computeEarningsQuality(data: AnalyzeApiResponse): number {
  let e = 50
  const roe = data.returnOnEquity ? parseFloat(data.returnOnEquity) : null
  const de = data.debtToEquity ? parseFloat(data.debtToEquity) : null
  const revGrowth = data.companyRevenueGrowth ?? null

  if (roe !== null) {
    if (roe >= 20) e += 20
    else if (roe >= 10) e += 10
    else if (roe < 0) e -= 20
  }
  if (de !== null) {
    if (de < 1) e += 5
    else if (de > 2) e -= 10
  }
  if (revGrowth !== null) {
    if (revGrowth >= 20) e += 15
    else if (revGrowth < 0) e -= 15
  }

  return Math.round(clamp(e, 0, 100))
}

// ---------- 5. Tính news_catalyst (0-100) ----------
function computeNewsCatalyst(data: AnalyzeApiResponse): number {
  if (data.newsScore !== null) {
    return Math.round(clamp((data.newsScore + 100) / 2, 0, 100))
  }
  return 50
}

// ---------- 6. fit_to_goal — TẠM để mặc định trung tính ----------
// Yếu tố này cần biết tỷ trọng hiện tại của mã trong danh mục thật (portfolio_holdings),
// sẽ được tính chính xác ở Bước sau (Position Sizing / Rebalance Engine).
function computeFitToGoal(): number {
  return 50
}

// ---------- Ánh xạ Company Profile ----------
function mapCompanyProfile(data: AnalyzeApiResponse): CompanyProfile {
  const pe = data.peRatio ? parseFloat(data.peRatio) : null
  const obvBullish = data.indicators.obvTrend === 'bullish'
  const volRatio = parseFloat(data.indicators.volumeRatio) || 1

  return {
    market_cap_usd: data.marketCap ?? 0,
    is_profitable: pe !== null && pe > 0, // có P/E dương -> đang có lợi nhuận
    roe_pct: data.returnOnEquity ? parseFloat(data.returnOnEquity) : null,
    eps_growth_pct: null, // chưa có sẵn trong route analyze, để null (chưa ảnh hưởng penalty)
    revenue_growth_pct: data.companyRevenueGrowth ?? 0,
    has_major_catalyst_30d: false, // sẽ có giá trị thật khi làm Catalyst Engine (Giai đoạn 3)
    strong_institutional_inflow: obvBullish && volRatio > 1.3,
  }
}

// ---------- Ánh xạ Confidence Signals ----------
function mapConfidenceSignals(
  data: AnalyzeApiResponse,
  technicalTrend: number,
  valuation: number
): ConfidenceSignals {
  const positiveNews = data.news.filter((n) => n.sentiment === 'positive').length
  const negativeNews = data.news.filter((n) => n.sentiment === 'negative').length
  const ivRank = parseFloat(data.indicators.ivRank) || 0
  const beta = data.beta ? parseFloat(data.beta) : null

  return {
    data_quality_issue: data.peRatio === null && data.marketCap === null,
    signals_conflict: Math.abs(technicalTrend - valuation) > 40,
    earnings_within_5_days: false, // sẽ có giá trị thật khi làm Catalyst Engine
    conflicting_recent_news: positiveNews > 0 && negativeNews > 0,
    volatility_abnormally_high: ivRank > 70 || (beta !== null && beta > 1.8),
  }
}

// ---------- Hàm tổng hợp - gọi hàm này duy nhất từ bên ngoài ----------
export function mapAnalyzeDataToScoringInput(data: AnalyzeApiResponse) {
  const growth_momentum = computeGrowthMomentum(data)
  const valuation = computeValuation(data)
  const technical_trend = computeTechnicalTrend(data)
  const earnings_quality = computeEarningsQuality(data)
  const news_catalyst = computeNewsCatalyst(data)
  const fit_to_goal = computeFitToGoal()

  const subscores: Subscores = {
    growth_momentum,
    valuation,
    technical_trend,
    earnings_quality,
    news_catalyst,
    fit_to_goal,
  }

  const companyProfile = mapCompanyProfile(data)
  const confidenceSignals = mapConfidenceSignals(data, technical_trend, valuation)

  return { subscores, companyProfile, confidenceSignals }
}