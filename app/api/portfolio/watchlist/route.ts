import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { calculateWatchlist, WatchlistStockInput } from "@/lib/watchlistEngine";

async function fetchWithRetry(url: string, maxRetries = 2): Promise<any> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`Watchlist API: lần ${attempt}/${maxRetries} lỗi khi gọi ${url}: ${lastError.message}`);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
    }
  }
  throw lastError;
}

// ─── GET: lấy watchlist + phân loại ─────────────────────────────

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id") || "vien_default";
  const baseUrl = req.nextUrl.origin;

  const { data: watchlistRows, error } = await supabaseAdmin
    .from("watchlist")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!watchlistRows || watchlistRows.length === 0) {
    return NextResponse.json({
      stocks: [],
      summary: { momentumPickCount: 0, valueOpportunityCount: 0, overextendedCautionCount: 0, neutralCount: 0 },
      updatedAt: new Date().toISOString(),
    });
  }

  const stockInputs: WatchlistStockInput[] = [];
  const failedSymbols: string[] = [];

  for (const row of watchlistRows) {
    try {
      const [evalData, analyzeData] = await Promise.all([
        fetchWithRetry(`${baseUrl}/api/portfolio/evaluate?symbol=${row.symbol}`, 2),
        fetchWithRetry(`${baseUrl}/api/analyze`, 1).catch(() => null), // fallback nếu /api/analyze cần POST, xử lý riêng bên dưới
      ]);

      // /api/analyze yêu cầu POST, không phải GET -> gọi đúng cách
      const analyzeRes = await fetch(`${baseUrl}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: row.symbol }),
        cache: "no-store",
      });
      const analyzeJson = analyzeRes.ok ? await analyzeRes.json() : null;

      const breakdown = evalData.score_breakdown || {};
      const rsi = analyzeJson?.indicators?.rsi ? parseFloat(analyzeJson.indicators.rsi) : 50;
      const perf20d = analyzeJson?.indicators?.perf20d ? parseFloat(analyzeJson.indicators.perf20d) : 0;
      const currentPrice = parseFloat(evalData.raw_price) || 0;

      stockInputs.push({
        symbol: row.symbol,
        scoreTotal: evalData.score_total ?? 50,
        subscoreValuation: breakdown.valuation ?? 50,
        subscoreGrowthMomentum: breakdown.growth_momentum ?? 50,
        subscoreTechnicalTrend: breakdown.technical_trend ?? 50,
        portfolioRole: evalData.portfolio_role ?? "satellite_growth",
        currentPrice,
        perf20d,
        rsi,
        note: row.note ?? null,
        peRatioMissing:
  (evalData.raw_pe_ratio === null || evalData.raw_pe_ratio === undefined) &&
  (evalData.raw_pb_ratio === null || evalData.raw_pb_ratio === undefined) &&
  (evalData.raw_ps_ratio === null || evalData.raw_ps_ratio === undefined),
      });
    } catch (err) {
      failedSymbols.push(row.symbol);
      console.error(`Watchlist API: đánh giá ${row.symbol} thất bại:`, err);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  const result = calculateWatchlist(stockInputs);

  return NextResponse.json({
    ...result,
    stocksEvaluated: stockInputs.length,
    stocksFailed: failedSymbols.length > 0 ? failedSymbols : undefined,
  });
}

// ─── POST: thêm mã mới vào watchlist ─────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json();
  const userId = body.user_id || "vien_default";
  const symbol = (body.symbol || "").toUpperCase().trim();
  const note = body.note || null;

  if (!symbol) {
    return NextResponse.json({ error: "Thiếu symbol" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("watchlist")
    .insert({ user_id: userId, symbol, note })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}

// ─── DELETE: xóa mã khỏi watchlist ─────────────────────────────

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Thiếu id" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("watchlist").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}