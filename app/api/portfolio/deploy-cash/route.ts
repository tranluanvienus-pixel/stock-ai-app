import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { calculateDeployCash, CurrentHoldingForDeploy } from "@/lib/deployCash";

async function evaluateWithRetry(baseUrl: string, symbol: string, maxRetries = 2): Promise<any> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/api/portfolio/evaluate?symbol=${symbol}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`Deploy Cash API: lần ${attempt}/${maxRetries} lỗi khi đánh giá ${symbol}: ${lastError.message}`);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
    }
  }
  throw lastError;
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id") || "vien_default";
  const newCashUsdParam = req.nextUrl.searchParams.get("amount");
  const baseUrl = req.nextUrl.origin;

  const newCashUsd = parseFloat(newCashUsdParam || "0");
  if (!newCashUsd || newCashUsd <= 0) {
    return NextResponse.json(
      { error: "Vui lòng cung cấp số tiền hợp lệ qua tham số 'amount', ví dụ ?amount=10000" },
      { status: 400 }
    );
  }

  // 1. Lấy holdings
  const { data: holdings, error: holdingsError } = await supabaseAdmin
    .from("portfolio_holdings")
    .select("*")
    .eq("user_id", userId);

  if (holdingsError) {
    return NextResponse.json({ error: holdingsError.message }, { status: 500 });
  }

  if (!holdings || holdings.length === 0) {
    return NextResponse.json(
      { error: "Danh mục chưa có vị thế nào — hãy dùng chức năng mua mới thay vì thêm vốn" },
      { status: 400 }
    );
  }

  // 2. Lấy hồ sơ đầu tư
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("user_profile")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (profileError || !profile) {
    return NextResponse.json(
      { error: "Chưa có hồ sơ đầu tư — vui lòng thiết lập hồ sơ trước" },
      { status: 400 }
    );
  }

  // 3. Đánh giá từng holding tuần tự (có retry)
  const currentHoldings: CurrentHoldingForDeploy[] = [];
  const failedSymbols: string[] = [];

  for (const h of holdings) {
    try {
      const evalData = await evaluateWithRetry(baseUrl, h.symbol, 2);
      const currentPrice = parseFloat(evalData.raw_price) || h.avg_cost;

      currentHoldings.push({
        symbol: h.symbol,
        shares: h.shares,
        currentPrice,
        scoreTotal: evalData.score_total ?? 50,
        portfolioRole: evalData.portfolio_role ?? "satellite_growth",
        sector: h.sector ?? "Unknown",
      });
    } catch (err) {
      failedSymbols.push(h.symbol);
      console.error(`Deploy Cash API: đánh giá ${h.symbol} thất bại:`, err);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  if (currentHoldings.length === 0) {
    return NextResponse.json(
      { error: "Không đánh giá được bất kỳ holding nào", failedSymbols },
      { status: 500 }
    );
  }

  // 4. Tính Deploy Cash
  const result = calculateDeployCash({
    newCashUsd,
    currentHoldings,
    investorType: profile.investor_type,
    cashReservePct: profile.cash_reserve_pct,
  });

  return NextResponse.json({
    ...result,
    holdingsEvaluated: currentHoldings.length,
    holdingsFailed: failedSymbols.length > 0 ? failedSymbols : undefined,
  });
}