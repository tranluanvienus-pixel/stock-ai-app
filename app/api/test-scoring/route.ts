import { NextResponse } from 'next/server'
import { evaluateStock } from '@/lib/scoringEngine'

export async function GET() {
  // Dữ liệu giả lập IREN — mô phỏng đúng bối cảnh đã bàn trước đó:
  // giá tăng mạnh, định giá không còn hấp dẫn, nhưng tăng trưởng doanh thu
  // và catalyst mạnh bù lại, thuộc nhóm vốn hóa nhỏ
  const irenTest = evaluateStock({
    symbol: 'IREN',
    horizon: '5y',
    subscores: {
      growth_momentum: 62, // đã tăng mạnh nên momentum khá, nhưng không tuyệt đối
      valuation: 40, // định giá không còn hấp dẫn sau khi tăng giá
      technical_trend: 62,
      earnings_quality: 35, // chưa ổn định, pre-profit
      news_catalyst: 70, // có catalyst tốt
      fit_to_goal: 30, // lệch tỷ trọng so với mục tiêu rủi ro
    },
    companyProfile: {
      market_cap_usd: 3_000_000_000, // vốn hóa nhỏ, dưới 10B
      is_profitable: false,
      roe_pct: null,
      eps_growth_pct: null,
      revenue_growth_pct: 85, // tăng trưởng doanh thu rất mạnh
      has_major_catalyst_30d: true,
      strong_institutional_inflow: true,
    },
    confidenceSignals: {
      data_quality_issue: false,
      signals_conflict: true, // valuation xấu nhưng momentum/catalyst tốt -> mâu thuẫn
      earnings_within_5_days: false,
      conflicting_recent_news: false,
      volatility_abnormally_high: true,
    },
  })

  // Dữ liệu giả lập MSFT để so sánh đối chiếu — công ty ổn định, nên là Core Holding
  const msftTest = evaluateStock({
    symbol: 'MSFT',
    horizon: '5y',
    subscores: {
      growth_momentum: 55,
      valuation: 65,
      technical_trend: 60,
      earnings_quality: 90,
      news_catalyst: 50,
      fit_to_goal: 85,
    },
    companyProfile: {
      market_cap_usd: 3_000_000_000_000,
      is_profitable: true,
      roe_pct: 35,
      eps_growth_pct: 12,
      revenue_growth_pct: 15,
      has_major_catalyst_30d: false,
      strong_institutional_inflow: false,
    },
    confidenceSignals: {
      data_quality_issue: false,
      signals_conflict: false,
      earnings_within_5_days: false,
      conflicting_recent_news: false,
      volatility_abnormally_high: false,
    },
  })

  return NextResponse.json({ IREN: irenTest, MSFT: msftTest })
}