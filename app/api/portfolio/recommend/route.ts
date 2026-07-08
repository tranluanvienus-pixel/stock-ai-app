export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { evaluateStock } from '@/lib/scoringEngine'
import { mapAnalyzeDataToScoringInput } from '@/lib/mapAnalyzeToScoring'
import { decideRecommendation } from '@/lib/recommendationEngine'
import { translateReasonCodes } from '@/lib/reasonCodes'
import { generateExplanation } from '@/lib/explanationLayer'

const MAX_POSITION_PCT: Record<string, number> = {
  conservative: 13,
  balanced: 17,
  growth: 20,
  aggressive: 22,
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')
  const userId = req.nextUrl.searchParams.get('user_id')

  if (!symbol || !userId) {
    return NextResponse.json({ error: 'Thiếu symbol hoặc user_id' }, { status: 400 })
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('user_profile')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Không tìm thấy hồ sơ nhà đầu tư' }, { status: 404 })
  }

  const { data: holding } = await supabaseAdmin
    .from('portfolio_holdings')
    .select('*')
    .eq('user_id', userId)
    .eq('symbol', symbol.toUpperCase())
    .maybeSingle()

  const baseUrl = req.nextUrl.origin
  const analyzeRes = await fetch(`${baseUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol }),
    cache: 'no-store',
  })
  const analyzeData = await analyzeRes.json()

  if (analyzeData.error) {
    return NextResponse.json({ error: analyzeData.error }, { status: 500 })
  }

  analyzeData.companyRevenueGrowth = analyzeData.revenueGrowth
    ? parseFloat(analyzeData.revenueGrowth)
    : null

  const { subscores, companyProfile, confidenceSignals } = mapAnalyzeDataToScoringInput(analyzeData)
  const scoringResult = evaluateStock({
    symbol: symbol.toUpperCase(),
    horizon: profile.horizon || '5y',
    subscores,
    companyProfile,
    confidenceSignals,
  })

  const currentPrice = parseFloat(analyzeData.price)
  const isCurrentlyHeld = !!holding
  let currentWeightPct = 0
  if (holding && profile.capital_usd > 0) {
    const currentValue = holding.shares * currentPrice
    currentWeightPct = (currentValue / profile.capital_usd) * 100
  }

  const maxPositionPct = MAX_POSITION_PCT[profile.investor_type] ?? MAX_POSITION_PCT.balanced

  const recResult = decideRecommendation({
    score_total: scoringResult.score_total,
    portfolio_role: scoringResult.portfolio_role,
    current_weight_pct: currentWeightPct,
    max_position_pct: maxPositionPct,
    allow_ai_sell: profile.allow_ai_sell,
    is_currently_held: isCurrentlyHeld,
    confidence_score: scoringResult.confidence_score,
    data_completeness_pct: scoringResult.data_completeness_pct,
  })

  const allReasonCodes = [...scoringResult.reason_codes, ...recResult.reason_codes]
  const reasonTexts = translateReasonCodes(allReasonCodes)

  const explanation = await generateExplanation({
    symbol: symbol.toUpperCase(),
    recommendation: recResult.recommendation,
    score_total: scoringResult.score_total,
    confidence_score: scoringResult.confidence_score,
    reason_texts: reasonTexts,
    horizon: profile.horizon || '5y',
    investor_type: profile.investor_type || 'balanced',
    previous_score_total: null,
    previous_weight_pct: null,
  })

  return NextResponse.json({
    ...scoringResult,
    recommendation: recResult.recommendation,
    recommendation_reason_codes: allReasonCodes,
    reason_texts: reasonTexts,
    explanation,
    current_weight_pct: Math.round(currentWeightPct * 10) / 10,
    max_position_pct: maxPositionPct,
    is_currently_held: isCurrentlyHeld,
    raw_price: analyzeData.price,
  })
}