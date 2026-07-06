import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { calculateRebalance, CurrentHolding } from "@/lib/rebalanceEngine";
import { MarketRegimeLabel } from "@/lib/marketRegime";

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
      console.warn(`Rebalance API: lần ${attempt}/${maxRetries} lỗi khi đánh giá ${symbol}: ${lastError.message}`);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
    }
  }
  throw lastError;
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id") || "vien_default";
  const baseUrl = req.nextUrl.origin;

  // 1. Lấy holdings
  const { data: holdings, error: holdingsError } = await supabaseAdmin
    .from("portfolio_holdings")
    .select("*")
    .eq("user_id", userId);

  if (holdingsError) {
    return NextResponse.json({ error: holdingsError.message }, { status: 500 });
  }

  if (!holdings || holdings.length === 0) {
    return NextResponse.json({
      recommendations: [],
      totalPortfolioValueUsd: 0,
      summary: { buyCount: 0, sellCount: 0, exitCount: 0, holdCount: 0 },
      reasonCodes: ["Danh mục chưa có vị thế nào để tái cân bằng"],
      updatedAt: new Date().toISOString(),
    });
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

  // 3. Lấy Market Regime
  let marketRegime: MarketRegimeLabel = "NEUTRAL";
  try {
    const regimeRes = await fetch(`${baseUrl}/api/market-regime`, { cache: "no-store" });
    if (regimeRes.ok) {
      const regimeData = await regimeRes.json();
      if (regimeData.regime) marketRegime = regimeData.regime;
    }
  } catch (err) {
    console.error("Rebalance API: lỗi lấy market regime:", err);
  }

  // 4. Đánh giá từng holding tuần tự (có retry)
  const currentHoldings: CurrentHolding[] = [];
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
      console.error(`Rebalance API: đánh giá ${h.symbol} thất bại:`, err);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  if (currentHoldings.length === 0) {
    return NextResponse.json(
      { error: "Không đánh giá được bất kỳ holding nào", failedSymbols },
      { status: 500 }
    );
  }

  // 5. Tính Rebalance
  const rebalanceResult = calculateRebalance({
    currentHoldings,
    investorType: profile.investor_type,
    cashReservePct: profile.cash_reserve_pct,
    totalCapitalUsd: profile.capital_usd,
    marketRegime,
  });

  return NextResponse.json({
    ...rebalanceResult,
    marketRegime,
    holdingsEvaluated: currentHoldings.length,
    holdingsFailed: failedSymbols.length > 0 ? failedSymbols : undefined,
  });
}