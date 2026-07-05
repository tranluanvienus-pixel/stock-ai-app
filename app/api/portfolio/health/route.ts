import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { calculatePortfolioHealth, HoldingHealthInput } from "@/lib/portfolioHealth";
import { MarketRegimeLabel } from "@/lib/marketRegime";

// ─── Helper: gọi evaluate với retry tự động ─────────────────────
async function evaluateWithRetry(
  baseUrl: string,
  symbol: string,
  maxRetries = 2
): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/api/portfolio/evaluate?symbol=${symbol}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`Health API: lần ${attempt}/${maxRetries} lỗi khi đánh giá ${symbol}: ${lastError.message}`);
      if (attempt < maxRetries) {
        // Chờ 1 chút trước khi thử lại (tránh dồn request liên tiếp)
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
    }
  }

  throw lastError;
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id") || "vien_default";
  const baseUrl = req.nextUrl.origin;

  // 1. Lấy danh sách holdings từ Supabase
  const { data: holdings, error } = await supabaseAdmin
    .from("portfolio_holdings")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!holdings || holdings.length === 0) {
    return NextResponse.json({
      healthScore: 0,
      grade: "CRITICAL",
      breakdown: { qualityScore: 0, diversificationScore: 0, confidenceScore: 0, regimeAlignmentScore: 0 },
      concentrationWarnings: [],
      reasonCodes: ["Danh mục chưa có vị thế nào"],
      updatedAt: new Date().toISOString(),
    });
  }

  // 2. Lấy Market Regime hiện tại
  let marketRegime: MarketRegimeLabel = "NEUTRAL";
  try {
    const regimeRes = await fetch(`${baseUrl}/api/market-regime`, { cache: "no-store" });
    if (regimeRes.ok) {
      const regimeData = await regimeRes.json();
      if (regimeData.regime) marketRegime = regimeData.regime;
    }
  } catch (err) {
    console.error("Health API: lỗi lấy market regime:", err);
  }

  // 3. Đánh giá từng holding TUẦN TỰ (không song song) để tránh nghẽn nguồn dữ liệu bên ngoài,
  // mỗi holding có retry riêng nếu lỗi tạm thời
  const validHoldings: HoldingHealthInput[] = [];
  const failedSymbols: string[] = [];

  for (const h of holdings) {
    try {
      const evalData = await evaluateWithRetry(baseUrl, h.symbol, 2);

      const currentPrice = parseFloat(evalData.raw_price) || h.avg_cost;
      const marketValue = h.shares * currentPrice;

      validHoldings.push({
        symbol: h.symbol,
        marketValue,
        scoreTotal: evalData.score_total ?? 50,
        confidenceScore: evalData.confidence_score ?? 50,
        portfolioRole: evalData.portfolio_role ?? "satellite_growth",
        sector: h.sector ?? null,
      });
    } catch (err) {
      failedSymbols.push(h.symbol);
      console.error(`Health API: đánh giá ${h.symbol} thất bại sau khi đã retry:`, err);
    }

    // Giãn cách nhẹ giữa các mã để giảm tải lên nguồn dữ liệu bên ngoài
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  if (validHoldings.length === 0) {
    return NextResponse.json(
      { error: "Không đánh giá được bất kỳ holding nào", failedSymbols },
      { status: 500 }
    );
  }

  // 4. Tính Portfolio Health Score
  const healthResult = calculatePortfolioHealth({
    holdings: validHoldings,
    marketRegime,
  });

  return NextResponse.json({
    ...healthResult,
    marketRegime,
    holdingsEvaluated: validHoldings.length,
    holdingsFailed: failedSymbols.length > 0 ? failedSymbols : undefined,
  });
}