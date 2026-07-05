import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Lấy hồ sơ nhà đầu tư theo user_id
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id')
  if (!userId) {
    return NextResponse.json({ error: 'Thiếu user_id' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('user_profile')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ profile: data })
}

// Tạo mới hoặc cập nhật hồ sơ nhà đầu tư
export async function POST(req: NextRequest) {
  const body = await req.json()

  const { data, error } = await supabaseAdmin
    .from('user_profile')
    .upsert({
      user_id: body.user_id,
      capital_usd: body.capital_usd,
      goal: body.goal,
      horizon: body.horizon,
      investor_type: body.investor_type,
      allow_ai_sell: body.allow_ai_sell,
      cash_reserve_pct: body.cash_reserve_pct,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ profile: data })
}