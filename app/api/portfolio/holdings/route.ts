export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id')
  if (!userId) return NextResponse.json({ error: 'Thiếu user_id' }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('portfolio_holdings').select('*').eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ holdings: data })
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