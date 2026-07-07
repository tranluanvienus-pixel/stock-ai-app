import { NextRequest, NextResponse } from 'next/server'
import { evaluateStock } from '@/lib/scoringEngine'
import { mapAnalyzeDataToScoringInput } from '@/lib/mapAnalyzeToScoring'

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')
  const horizon = req.nextUrl.searchParams.get('horizon') || '5y'

  if (!symbol) {
    return NextResponse.json({ error: 'Thiếu symbol' }, { status: 400 })
  }

  const baseUrl = req.nextUrl.origin
  const analyzeRes = await fetch(`${baseUrl}/api/analyze`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ symbol }),
  cache: 'no-store',
})

  if (!analyzeRes.ok) {
    return NextResponse.json({ error: 'Không lấy được dữ liệu phân tích' }, { status: 500 })
  }

  const analyzeData = await analyzeRes.json()

  if (analyzeData.error) {
    return NextResponse.json({ error: analyzeData.error }, { status: 500 })
  }
analyzeData.companyRevenueGrowth = analyzeData.revenueGrowth ? parseFloat(analyzeData.revenueGrowth) : null
  const { subscores, companyProfile, confidenceSignals } = mapAnalyzeDataToScoringInput(analyzeData)

  const result = evaluateStock({
    symbol: symbol.toUpperCase(),
    horizon,
    subscores,
    companyProfile,
    confidenceSignals,
  })

  return NextResponse.json({
    ...result,
    raw_price: analyzeData.price,
    raw_pe_ratio: analyzeData.peRatio,
    raw_pb_ratio: analyzeData.pbRatio,
    raw_ps_ratio: analyzeData.psRatio,
    raw_technical_score: analyzeData.score,
    data_snapshot: analyzeData,
  })
}