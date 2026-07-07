export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id')
  if (!userId) return NextResponse.json({ error: 'Thiếu user_id' }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('portfolio_holdings').select('*').eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const holdings = data || []
  const symbols = holdings.map((h) => h.symbol)

  let latestPriceBySymbol: Record<string, number> = {}
  if (symbols.length > 0) {
    const { data: evalRows } = await supabaseAdmin
      .from('evaluation_history')
      .select('symbol, price_at_eval, eval_date')
      .eq('user_id', userId)
      .in('symbol', symbols)
      .order('eval_date', { ascending: false })

    if (evalRows) {
      for (const row of evalRows) {
        if (!(row.symbol in latestPriceBySymbol)) {
          latestPriceBySymbol[row.symbol] = row.price_at_eval
        }
      }
    }
  }

  const holdingsWithPnl = holdings.map((h) => {
    const priceAtEval = latestPriceBySymbol[h.symbol] ?? null
    const pnlUsd = priceAtEval != null ? (priceAtEval - h.avg_cost) * h.shares : null
    const pnlPct = priceAtEval != null && h.avg_cost > 0 ? ((priceAtEval - h.avg_cost) / h.avg_cost) * 100 : null
    return { ...h, price_at_eval: priceAtEval, pnl_usd: pnlUsd, pnl_pct: pnlPct }
  })

  return NextResponse.json({ holdings: holdingsWithPnl })
}
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { data, error } = await supabaseAdmin.from('portfolio_holdings').insert({
    user_id: body.user_id,
    symbol: body.symbol.toUpperCase(),
    shares: body.shares,
    avg_cost: body.avg_cost,
    sector: body.sector || null,
    entry_reason: body.entry_reason || null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ holding: data })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('holding_id')
  if (!id) return NextResponse.json({ error: 'Thiếu holding_id' }, { status: 400 })
  const { error } = await supabaseAdmin.from('portfolio_holdings').delete().eq('holding_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { holding_id, shares } = body
  if (!holding_id || shares == null) {
    return NextResponse.json({ error: 'Thiếu holding_id hoặc shares' }, { status: 400 })
  }
  const { data, error } = await supabaseAdmin
    .from('portfolio_holdings')
    .update({ shares })
    .eq('holding_id', holding_id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ holding: data })
}