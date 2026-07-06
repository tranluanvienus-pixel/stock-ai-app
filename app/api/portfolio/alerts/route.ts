import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id") || "vien_default";
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 20);

  // 1. Lấy danh sách alert mới nhất
  const { data: alerts, error: alertsError } = await supabaseAdmin
    .from("alerts_queue")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (alertsError) {
    return NextResponse.json({ error: alertsError.message }, { status: 500 });
  }

  if (!alerts || alerts.length === 0) {
    return NextResponse.json({ alerts: [] });
  }

  // 2. Lấy chi tiết đánh giá tương ứng từ evaluation_history
  const evalIds = alerts.map((a) => a.eval_id).filter(Boolean);

  const { data: evaluations, error: evalError } = await supabaseAdmin
    .from("evaluation_history")
    .select("*")
    .in("eval_id", evalIds);

  if (evalError) {
    return NextResponse.json({ error: evalError.message }, { status: 500 });
  }

  const evalMap = new Map((evaluations ?? []).map((e) => [e.eval_id, e]));

  // 3. Ghép nối alert + evaluation
  const merged = alerts.map((a) => {
    const evalData = evalMap.get(a.eval_id);
    return {
      alert_id: a.alert_id,
      symbol: a.symbol,
      created_at: a.created_at,
      seen: a.seen,
      recommendation: evalData?.recommendation ?? null,
      score_total: evalData?.score_total ?? null,
      confidence_score: evalData?.confidence_score ?? null,
      reasoning_text: evalData?.reasoning_text ?? null,
      reason_codes: evalData?.reason_codes ?? [],
      price_at_eval: evalData?.price_at_eval ?? null,
      weight_at_eval: evalData?.weight_at_eval ?? null,
    };
  });

  return NextResponse.json({ alerts: merged });
}

// Đánh dấu đã đọc
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const alertIds: string[] = body.alert_ids ?? [];

  if (!alertIds.length) {
    return NextResponse.json({ error: "Thiếu alert_ids" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("alerts_queue")
    .update({ seen: true })
    .in("alert_id", alertIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}