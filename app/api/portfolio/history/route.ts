export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id')
  const symbol = req.nextUrl.searchParams.get('symbol')

  if (!userId) return NextResponse.json({ error: 'Thiếu user_id' }, { status: 400 })
  if (!symbol) return NextResponse.json({ error: 'Thiếu symbol' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('evaluation_history')
    .select('eval_id, eval_date, price_at_eval, score_total, recommendation, reasoning_text, data_snapshot, previous_eval_id')
    .eq('user_id', userId)
    .eq('symbol', symbol.toUpperCase())
    .order('eval_date', { ascending: false })
    .limit(30)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ symbol: symbol.toUpperCase(), history: data || [] })
}