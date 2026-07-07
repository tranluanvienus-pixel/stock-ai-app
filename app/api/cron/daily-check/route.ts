import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const USER_ID = "vien_default";

async function evaluateWithRetry(baseUrl: string, symbol: string, maxRetries = 2): Promise<any> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/api/portfolio/evaluate?symbol=${symbol}&user_id=${USER_ID}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
    }
  }
  throw lastError;
}

export async function GET(req: NextRequest) {
  console.log("CRON TRIGGERED at", new Date().toISOString());
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = req.nextUrl.origin;
  const results: any[] = [];
  const failedSymbols: string[] = [];

  const { data: holdings, error: holdingsError } = await supabaseAdmin
    .from("portfolio_holdings")
    .select("*")
    .eq("user_id", USER_ID);

  if (holdingsError) {
    return NextResponse.json({ error: holdingsError.message }, { status: 500 });
  }
  if (!holdings || holdings.length === 0) {
    return NextResponse.json({ message: "Không có holding nào để đánh giá", results: [] });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("user_profile")
    .select("*")
    .eq("user_id", USER_ID)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Chưa có hồ sơ đầu tư" }, { status: 400 });
  }

  const totalCapitalUsd = profile.capital_usd ?? 0;

  for (const h of holdings) {
    try {
      const evalData = await evaluateWithRetry(baseUrl, h.symbol, 2);
      const currentPrice = parseFloat(evalData.raw_price) || h.avg_cost;
      const weightAtEval = totalCapitalUsd > 0 ? ((currentPrice * h.shares) / totalCapitalUsd) * 100 : 0;

      const { data: prevEval } = await supabaseAdmin
        .from("evaluation_history")
        .select("eval_id")
        .eq("user_id", USER_ID)
        .eq("symbol", h.symbol)
        .order("eval_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: newEval, error: insertError } = await supabaseAdmin
        .from("evaluation_history")
        .insert({
          user_id: USER_ID,
          symbol: h.symbol,
          eval_date: new Date().toISOString(),
          price_at_eval: currentPrice,
          weight_at_eval: weightAtEval,
          portfolio_role: evalData.portfolio_role ?? "satellite_growth",
          score_total: evalData.score_total ?? 50,
          score_breakdown: evalData.score_breakdown ?? null,
          confidence_score: evalData.confidence_score ?? null,
          reason_codes: evalData.reason_codes ?? [],
          recommendation: evalData.recommendation ?? "hold",
          reasoning_text: evalData.explanation?.why ?? "",
          previous_eval_id: prevEval?.eval_id ?? null,
        })
        .select()
        .single();

      if (insertError || !newEval) {
        failedSymbols.push(h.symbol);
        continue;
      }

      await supabaseAdmin.from("alerts_queue").insert({
        user_id: USER_ID,
        symbol: h.symbol,
        eval_id: newEval.eval_id,
        created_at: new Date().toISOString(),
        seen: false,
      });

      results.push({ symbol: h.symbol, recommendation: newEval.recommendation, score_total: newEval.score_total });
    } catch (err) {
      failedSymbols.push(h.symbol);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("CRON RESULT:", results.length, "evaluated,", failedSymbols.length, "failed", failedSymbols);
  return NextResponse.json({
    message: "Daily check hoàn tất",
    evaluated: results.length,
    failed: failedSymbols.length > 0 ? failedSymbols : undefined,
    results,
  });
}