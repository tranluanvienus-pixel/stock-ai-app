export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server'
import { evaluateStock } from '@/lib/scoringEngine'
import { mapAnalyzeDataToScoringInput } from '@/lib/mapAnalyzeToScoring'
import { calculatePositionSizing, type CandidateStock } from '@/lib/positionSizing'

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get('symbols') || 'MSFT,IREN,AVGO'
  const horizon = req.nextUrl.searchParams.get('horizon') || '5y'
  const capital = Number(req.nextUrl.searchParams.get('capital') || '50000')
  const cashReserve = Number(req.nextUrl.searchParams.get('cash') || '10')
  const investorType = req.nextUrl.searchParams.get('investor_type') || 'balanced'

  const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase())
  const baseUrl = req.nextUrl.origin

  const candidates: CandidateStock[] = []

  for (const symbol of symbols) {
    try {
      const analyzeRes = await fetch(`${baseUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
        cache: 'no-store',
      })
      const analyzeData = await analyzeRes.json()
      if (analyzeData.error) continue

      analyzeData.companyRevenueGrowth = analyzeData.revenueGrowth
        ? parseFloat(analyzeData.revenueGrowth)
        : null

      const { subscores, companyProfile, confidenceSignals } = mapAnalyzeDataToScoringInput(analyzeData)
      const result = evaluateStock({ symbol, horizon, subscores, companyProfile, confidenceSignals })

      candidates.push({
        symbol,
        score_total: result.score_total,
        portfolio_role: result.portfolio_role,
        current_price: parseFloat(analyzeData.price),
        sector: analyzeData.sector || 'N/A',
      })
    } catch (e) {
      continue
    }
  }

  const sizing = calculatePositionSizing({
    capital_usd: capital,
    cash_reserve_pct: cashReserve,
    investor_type: investorType,
    candidates,
  })

  return NextResponse.json({ candidates, sizing })
}