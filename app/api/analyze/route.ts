export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

// Hỗ trợ tối đa 2 key Groq — khi key chính bị rate limit (429), tự động thử key dự phòng.
// Thêm GROQ_API_KEY_2 vào Environment Variables trên Vercel để kích hoạt fallback.
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_API_KEY_2 = process.env.GROQ_API_KEY_2 || "";
const GROQ_KEYS = [GROQ_API_KEY, GROQ_API_KEY_2].filter(Boolean);

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY || "";
const POLYGON_KEY = process.env.POLYGON_API_KEY || "";

// Fetch có timeout chủ động — tránh 1 API bên ngoài bị treo lâu kéo theo
// toàn bộ request bị Vercel Hobby kill (giới hạn ngắn hơn nhiều so với maxDuration khai báo)
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Gọi Groq với tự động fallback: nếu key đầu tiên bị rate limit (429), thử key tiếp theo.
// Trả về Response thành công đầu tiên, hoặc Response lỗi cuối cùng nếu tất cả key đều fail.
async function callGroq(body: object, timeoutMs: number): Promise<{ res: Response | null; usedKeyIndex: number; lastError: string | null }> {
  if (GROQ_KEYS.length === 0) return { res: null, usedKeyIndex: -1, lastError: "Không có GROQ_API_KEY nào được cấu hình" };

  let lastError: string | null = null;
  for (let i = 0; i < GROQ_KEYS.length; i++) {
    try {
      const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_KEYS[i]}` },
        body: JSON.stringify(body),
      }, timeoutMs);

      if (res.status === 429) {
        const errBody = await res.text().catch(() => "");
        lastError = `Key #${i + 1} rate limited (429): ${errBody.slice(0, 200)}`;
        console.error("[callGroq]", lastError, "— thử key tiếp theo nếu còn");
        continue; // Thử key kế tiếp
      }
      return { res, usedKeyIndex: i, lastError: null };
    } catch (e: any) {
      lastError = `Key #${i + 1} lỗi: ${e?.name || ""} ${e?.message || String(e)}`;
      console.error("[callGroq]", lastError);
      continue;
    }
  }
  return { res: null, usedKeyIndex: -1, lastError: lastError || "Tất cả Groq key đều thất bại" };
}

// ─── DATA FETCHERS ────────────────────────────────────────────────────────────

// Yahoo v8 — lấy dữ liệu lịch sử (vẫn hoạt động trên Vercel)
async function getStockData(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": "Mozilla/5.0" } }, 8000);
  return res.json();
}

// Polygon.io FREE — chỉ có dữ liệu cuối ngày (EOD), KHÔNG có lastTrade/fmv/minute bar real-time.
// Dùng làm nguồn phụ cho prevClose; giá "hiện tại" chính lấy từ Yahoo (xem getStockData + POST handler).
async function getAlphaQuote(symbol: string) {
  if (!POLYGON_KEY) return null;
  try {
    const res = await fetchWithTimeout(
      `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_KEY}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const t = json?.ticker;
    if (!t) return null;

    const day = t.day || {};
    const prevDay = t.prevDay || {};

    const price: number =
      typeof day.c === "number" && day.c > 0 ? day.c : (typeof prevDay.c === "number" ? prevDay.c : 0);
    const prevClose: number = typeof prevDay.c === "number" ? prevDay.c : 0;
    const change: number =
      typeof t.todaysChange === "number" ? t.todaysChange : (prevClose ? price - prevClose : 0);
    const changePct: number =
      typeof t.todaysChangePerc === "number" ? t.todaysChangePerc : (prevClose ? (change / prevClose) * 100 : 0);

    return {
      price,
      change,
      changePct,
      high: typeof day.h === "number" ? day.h : 0,
      low: typeof day.l === "number" ? day.l : 0,
      volume: typeof day.v === "number" ? day.v : 0,
      prevClose,
      afterHoursPrice: undefined as number | undefined,
      afterHoursPct: undefined as number | undefined,
      afterHoursLabel: "",
    };
  } catch { return null; }
}

// Polygon.io — company basic info (tên, mô tả, ngành)
async function getPolygonCompany(symbol: string) {
  if (!POLYGON_KEY) return null;
  try {
    const res = await fetchWithTimeout(
      `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_KEY}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const d = json?.results;
    if (!d) return null;
    return {
      name: d.name || symbol,
      sector: d.sic_description || "N/A",
      description: (d.description || "").slice(0, 600),
      marketCap: d.market_cap || null,
      website: d.homepage_url || "",
      employees: d.total_employees || null,
    };
  } catch { return null; }
}

// Alpha Vantage — company fundamentals (P/E, ROE, Beta, D/E...)
async function getAlphaVantageOverview(symbol: string) {
  if (!ALPHA_VANTAGE_KEY) return null;
  try {
    const res = await fetchWithTimeout(
      `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`
    );
    if (!res.ok) return null;
    const d = await res.json();
    if (!d?.Symbol || d.Note) return null; // Note = rate limit hit

    const toNum = (v: any) => (v && v !== "None" && v !== "-") ? parseFloat(v) : null;

    return {
      sector: d.Sector || null,
      industry: d.Industry || null,
      peRatio: toNum(d.PERatio),
      forwardPE: toNum(d.ForwardPE),
      pbRatio: toNum(d.PriceToBookRatio),
      eps: toNum(d.EPS),
      beta: toNum(d.Beta),
      dividendYield: toNum(d.DividendYield) ? toNum(d.DividendYield)! * 100 : null,
      week52High: toNum(d["52WeekHigh"]),
      week52Low: toNum(d["52WeekLow"]),
      targetPrice: toNum(d.AnalystTargetPrice),
      revenueGrowthYOY: toNum(d.QuarterlyRevenueGrowthYOY) ? toNum(d.QuarterlyRevenueGrowthYOY)! * 100 : null,
      profitMargin: toNum(d.ProfitMargin) ? toNum(d.ProfitMargin)! * 100 : null,
      revenuePerShare: toNum(d.RevenuePerShareTTM),
      returnOnEquity: toNum(d.ReturnOnEquityTTM) ? toNum(d.ReturnOnEquityTTM)! * 100 : null,
      debtToEquity: toNum(d.DebtToEquityRatio) || toNum(d.DebtToEquity) || null,
      marketCap: toNum(d.MarketCapitalization),
      analystRating: d.AnalystRatingBuy ? {
        buy: parseInt(d.AnalystRatingBuy || "0"),
        hold: parseInt(d.AnalystRatingHold || "0"),
        sell: parseInt(d.AnalystRatingSell || "0"),
      } : null,
    };
  } catch { return null; }
}

// Kết hợp Polygon (tên/mô tả) + Alpha Vantage (chỉ số tài chính)
async function getAlphaCompany(symbol: string) {
  const [polygonData, avData] = await Promise.all([
    getPolygonCompany(symbol),
    getAlphaVantageOverview(symbol),
  ]);

  if (!polygonData && !avData) return null;

  return {
    name: polygonData?.name || symbol,
    sector: avData?.sector || polygonData?.sector || "N/A",
    industry: avData?.industry || "N/A",
    description: polygonData?.description || "",
    marketCap: avData?.marketCap || polygonData?.marketCap || null,
    peRatio: avData?.peRatio ?? null,
    forwardPE: avData?.forwardPE ?? null,
    pbRatio: avData?.pbRatio ?? null,
    eps: avData?.eps ?? null,
    beta: avData?.beta ?? null,
    dividendYield: avData?.dividendYield ?? null,
    week52High: avData?.week52High ?? null,
    week52Low: avData?.week52Low ?? null,
    targetPrice: avData?.targetPrice ?? null,
    revenueGrowthYOY: avData?.revenueGrowthYOY ?? null,
    profitMargin: avData?.profitMargin ?? null,
    revenuePerShare: avData?.revenuePerShare ?? null,
    returnOnEquity: avData?.returnOnEquity ?? null,
    debtToEquity: avData?.debtToEquity ?? null,
    analystRating: avData?.analystRating ?? null,
    website: polygonData?.website || "",
    employees: polygonData?.employees ?? null,
  };
}

// Polygon.io — tin tức thật
async function getAlphaNews(symbol: string) {
  if (!POLYGON_KEY) return [];
  try {
    const res = await fetchWithTimeout(
      `https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=8&order=desc&apiKey=${POLYGON_KEY}`
    );
    if (!res.ok) return [];
    const json = await res.json();
    const results = json?.results || [];
    return results.slice(0, 8).map((n: any) => ({
      title: n.title || "",
      titleVi: "",
      url: n.article_url || "",
      source: n.publisher?.name || "Polygon News",
      publishedAt: n.published_utc ? n.published_utc.slice(0, 10) : "",
      sentiment: n.insights?.[0]?.sentiment === "positive" ? "positive"
        : n.insights?.[0]?.sentiment === "negative" ? "negative" : "neutral",
      sentimentScore: 0,
    }));
  } catch { return []; }
}

// VIX real-time từ Yahoo v8 (vẫn hoạt động)
async function getVIX() {
  try {
    const res = await fetchWithTimeout(
      `https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((c: number) => c != null) || [];
    if (closes.length < 2) return null;
    const current = closes[closes.length - 1];
    const prev = closes[closes.length - 2];
    return { value: current, change: current - prev, changePct: ((current - prev) / prev) * 100 };
  } catch { return null; }
}

// Fear & Greed — CNN + fallback
async function getFearGreed() {
  try {
    const res = await fetchWithTimeout("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://edition.cnn.com/markets/fear-and-greed",
        "Origin": "https://edition.cnn.com",
        "Accept": "application/json, text/plain, */*",
      }
    });
    if (res.ok) {
      const json = await res.json();
      const score = Math.round(json?.fear_and_greed?.score || 0);
      const rating = json?.fear_and_greed?.rating || "";
      if (score > 0) return { score, rating, source: "CNN" };
    }
  } catch {}

  try {
    const res = await fetchWithTimeout("https://api.alternative.me/fng/?limit=1", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (res.ok) {
      const json = await res.json();
      const item = json?.data?.[0];
      if (item) return { score: parseInt(item.value), rating: item.value_classification, source: "Alternative.me" };
    }
  } catch {}

  return null;
}

// Sector ETF performance (Yahoo v8 vẫn hoạt động)
async function getSectorRotation() {
  const sectors = [
    { name: "Technology", nameVi: "Công nghệ", symbol: "XLK", topStocks: ["NVDA", "AAPL", "MSFT"] },
    { name: "Healthcare", nameVi: "Y tế", symbol: "XLV", topStocks: ["JNJ", "UNH", "PFE"] },
    { name: "Financials", nameVi: "Tài chính", symbol: "XLF", topStocks: ["JPM", "BAC", "GS"] },
    { name: "Energy", nameVi: "Năng lượng", symbol: "XLE", topStocks: ["XOM", "CVX", "COP"] },
    { name: "Consumer Disc.", nameVi: "Tiêu dùng tùy ý", symbol: "XLY", topStocks: ["AMZN", "TSLA", "MCD"] },
    { name: "Industrials", nameVi: "Công nghiệp", symbol: "XLI", topStocks: ["CAT", "BA", "HON"] },
    { name: "Materials", nameVi: "Vật liệu", symbol: "XLB", topStocks: ["LIN", "APD", "ECL"] },
    { name: "Real Estate", nameVi: "Bất động sản", symbol: "XLRE", topStocks: ["AMT", "PLD", "CCI"] },
    { name: "Utilities", nameVi: "Tiện ích", symbol: "XLU", topStocks: ["NEE", "DUK", "SO"] },
    { name: "Comm. Services", nameVi: "Dịch vụ TT", symbol: "XLC", topStocks: ["GOOGL", "META", "NFLX"] },
    { name: "Consumer Staples", nameVi: "Hàng thiết yếu", symbol: "XLP", topStocks: ["PG", "KO", "WMT"] },
  ];
  const results = await Promise.allSettled(
    sectors.map(async (s) => {
      try {
        const res = await fetchWithTimeout(
          `https://query1.finance.yahoo.com/v8/finance/chart/${s.symbol}?interval=1d&range=1mo`,
          { headers: { "User-Agent": "Mozilla/5.0" } },
          5000
        );
        const json = await res.json();
        const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((c: number) => c != null) || [];
        if (closes.length < 6) return { ...s, perf5d: 0, perf20d: 0, trend: "stable", flowSignal: "neutral" };
        const perf5d = ((closes[closes.length-1] - closes[closes.length-6]) / closes[closes.length-6]) * 100;
        const perf20d = closes.length >= 21 ? ((closes[closes.length-1] - closes[closes.length-21]) / closes[closes.length-21]) * 100 : 0;
        const trend = perf5d > 1.5 && perf20d > 3 ? "rotating-in" : perf5d < -1.5 && perf20d < -2 ? "rotating-out" : "stable";
        const flowSignal = perf5d > 2 ? "strong-inflow" : perf5d > 0.5 ? "inflow" : perf5d < -2 ? "strong-outflow" : perf5d < -0.5 ? "outflow" : "neutral";
        return { ...s, perf5d: Math.round(perf5d * 100) / 100, perf20d: Math.round(perf20d * 100) / 100, trend, flowSignal };
      } catch {
        return { ...s, perf5d: 0, perf20d: 0, trend: "stable", flowSignal: "neutral" };
      }
    })
  );
  return results.filter(r => r.status === "fulfilled").map((r: any) => r.value).sort((a: any, b: any) => b.perf5d - a.perf5d);
}

// ─── SENTIMENT ────────────────────────────────────────────────────────────────
function analyzeSentiment(text: string): "positive" | "negative" | "neutral" {
  const pos = ["surge", "rally", "gain", "growth", "profit", "beat", "upgrade", "buy", "record", "high", "strong", "rise", "jump", "soar"];
  const neg = ["drop", "fall", "decline", "loss", "miss", "downgrade", "sell", "low", "weak", "warning", "risk", "crash", "plunge", "cut"];
  const lower = text.toLowerCase();
  const p = pos.filter(w => lower.includes(w)).length;
  const n = neg.filter(w => lower.includes(w)).length;
  return p > n ? "positive" : n > p ? "negative" : "neutral";
}

// ─── TECHNICAL INDICATORS ─────────────────────────────────────────────────────
function calcRSI(prices: number[], period = 14) {
  if (prices.length < period + 1) return 50;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) avgGain += diff; else avgLoss += Math.abs(diff);
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) { avgGain = (avgGain * (period - 1) + diff) / period; avgLoss = (avgLoss * (period - 1)) / period; }
    else { avgGain = (avgGain * (period - 1)) / period; avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period; }
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcStochRSI(prices: number[], rsiPeriod = 14, stochPeriod = 14) {
  if (prices.length < rsiPeriod + stochPeriod) return 50;
  const rsiValues: number[] = [];
  for (let i = rsiPeriod; i < prices.length; i++) rsiValues.push(calcRSI(prices.slice(0, i + 1)));
  if (rsiValues.length < stochPeriod) return 50;
  const recent = rsiValues.slice(-stochPeriod);
  const minRSI = Math.min(...recent), maxRSI = Math.max(...recent);
  const currentRSI = rsiValues[rsiValues.length - 1];
  return maxRSI === minRSI ? 50 : ((currentRSI - minRSI) / (maxRSI - minRSI)) * 100;
}

function calcEMA(prices: number[], period: number) {
  const k = 2 / (period + 1); let ema = prices[0];
  for (let i = 1; i < prices.length; i++) ema = prices[i] * k + ema * (1 - k);
  return ema;
}

function calcMA(prices: number[], period: number) {
  if (prices.length < period) return null;
  return prices.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcMACD(prices: number[]) {
  const ema12 = calcEMA(prices, 12), ema26 = calcEMA(prices, 26);
  const macdLine = ema12 - ema26, signal = macdLine * 0.9;
  return { macdLine, signal, histogram: macdLine - signal };
}

function calcBollinger(prices: number[], period = 20) {
  const slice = prices.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
  return { upper: mean + 2 * std, middle: mean, lower: mean - 2 * std, std };
}

function calcATR(highs: number[], lows: number[], closes: number[], period = 14) {
  const trs: number[] = [];
  for (let i = 1; i < Math.min(period + 1, closes.length); i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

function calcADX(highs: number[], lows: number[], closes: number[], period = 14) {
  const dms: { plus: number; minus: number }[] = [];
  for (let i = 1; i < closes.length; i++) {
    const upMove = highs[i] - highs[i-1], downMove = lows[i-1] - lows[i];
    dms.push({ plus: upMove > downMove && upMove > 0 ? upMove : 0, minus: downMove > upMove && downMove > 0 ? downMove : 0 });
  }
  const slice = dms.slice(-period);
  const avgPlus = slice.reduce((a, b) => a + b.plus, 0) / period;
  const avgMinus = slice.reduce((a, b) => a + b.minus, 0) / period;
  const di = avgPlus + avgMinus;
  return { adx: di === 0 ? 0 : (Math.abs(avgPlus - avgMinus) / di) * 100, diPlus: avgPlus, diMinus: avgMinus };
}

function calcOBV(closes: number[], volumes: number[]) {
  let obv = 0; const obvValues: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i-1]) obv += volumes[i]; else if (closes[i] < closes[i-1]) obv -= volumes[i];
    obvValues.push(obv);
  }
  const recent = obvValues.slice(-5);
  return { obv, obvTrend: recent[recent.length-1] > recent[0] ? "bullish" : "bearish" };
}

function calcSupRes(closes: number[]) {
  const sorted = [...closes.slice(-50)].sort((a, b) => a - b);
  return { support: sorted[Math.floor(sorted.length * 0.1)], resistance: sorted[Math.floor(sorted.length * 0.9)] };
}

function calcIVRankEstimate(prices: number[], period = 252) {
  const slice = prices.slice(-Math.min(period, prices.length));
  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) returns.push(Math.log(slice[i] / slice[i-1]));
  const variance = returns.reduce((a, b) => a + b * b, 0) / returns.length;
  const annualVol = Math.sqrt(variance * 252) * 100;
  const recentVol = Math.sqrt(returns.slice(-20).reduce((a, b) => a + b * b, 0) / 20 * 252) * 100;
  return { ivRank: Math.min(100, Math.max(0, (recentVol / annualVol) * 50)), annualVol, recentVol };
}

function calcSectorStrength(closes: number[]) {
  return {
    perf5d: ((closes[closes.length-1] - closes[closes.length-6]) / closes[closes.length-6]) * 100,
    perf20d: ((closes[closes.length-1] - closes[closes.length-21]) / closes[closes.length-21]) * 100,
  };
}

// Biến debug tạm — lưu lỗi gần nhất từ Groq để trả ra response, giúp chẩn đoán
// mà không cần phụ thuộc Vercel Runtime Logs (vốn có độ trễ/giới hạn trên Hobby plan)
let lastGroqDebugError: string | null = null;

// ─── GROQ AI ──────────────────────────────────────────────────────────────────
async function analyzeWithGroq(params: {
  symbol: string; companyName: string; sector: string; industry: string;
  price: number;
  peRatio?: number | null; revenueGrowth?: number | null; profitMargin?: number | null; marketCap?: number | null;
  targetPrice?: number | null; returnOnEquity?: number | null; debtToEquity?: number | null;
  score: number; rsi: number; stochRSI: number;
  ma20: number; ma50: number; ma200: number | null;
  macd: { macdLine: number; signal: number };
  bb: { upper: number; lower: number; middle: number };
  atr: number; adx: { adx: number; diPlus: number; diMinus: number };
  obv: { obvTrend: string }; ivRank: number;
  perf5d: number; perf20d: number;
  vix?: { value: number; changePct: number } | null;
  fearGreed?: { score: number; rating: string } | null;
  topSectors?: { name: string; nameVi: string; perf5d: number; trend: string; flowSignal: string }[];
  news?: { title: string; sentiment: string }[];
  reasons_buy: string[]; reasons_avoid: string[];
}): Promise<{
  finalVerdict: string; finalVerdictVi: string; finalAction: string;
  aiScore: number; confidence: string;
  groqSummary: string; groqAdvice: string; groqRisk: string;
  sellPutAI: string; sellCallAI: string;
  sectorRotationAdvice: string;
  marketRegime: string; marketRegimeVi: string; marketRegimeStrategy: string;
  probUp: number; probSideways: number; probDown: number;
  checklist: { trendOK: boolean; volumeOK: boolean; vixOK: boolean; fearGreedOK: boolean; macdOK: boolean; rsiOK: boolean; allowTrade: boolean };
  newsScore: number; newsScoreLabel: string;
  optionsScore: { sellPutScore: number; probabilityOTM: number; riskReward: string; recommendedStrike: string; recommendedExpiry: string; maxRisk: string };
} | null> {
  if (GROQ_KEYS.length === 0) return null;

  const newsText = (params.news || []).slice(0, 4).map(n => `[${n.sentiment.toUpperCase()}] ${n.title}`).join("\n");
  const topSectorText = (params.topSectors || []).slice(0, 5).map(s => `${s.nameVi}: ${s.perf5d > 0 ? "+" : ""}${s.perf5d.toFixed(1)}% (${s.flowSignal})`).join(", ");

  const prompt = `Bạn là chuyên gia phân tích chứng khoán Mỹ hàng đầu với 20 năm kinh nghiệm. Phân tích toàn diện cho ${params.symbol}.

== THÔNG TIN CÔNG TY ==
Tên: ${params.companyName} | Ngành: ${params.sector} - ${params.industry}
Vốn hóa: ${params.marketCap ? "$" + (params.marketCap/1e9).toFixed(1) + "B" : "N/A"} | P/E: ${params.peRatio?.toFixed(1) || "N/A"}
Tăng trưởng DT: ${params.revenueGrowth?.toFixed(1) || "N/A"}% | Biên LN: ${params.profitMargin?.toFixed(1) || "N/A"}%
ROE: ${params.returnOnEquity?.toFixed(1) || "N/A"}% | D/E: ${params.debtToEquity?.toFixed(2) || "N/A"}
Giá mục tiêu analyst: ${params.targetPrice ? "$" + params.targetPrice.toFixed(2) : "N/A"}

== GIÁ: $${params.price.toFixed(2)} ==

== 18 CHỈ BÁO KỸ THUẬT (Điểm: ${params.score}/100) ==
RSI: ${params.rsi.toFixed(1)} | StochRSI: ${params.stochRSI.toFixed(1)} | ADX: ${params.adx.adx.toFixed(1)}
MA20: $${params.ma20.toFixed(2)} | MA50: $${params.ma50.toFixed(2)} | MA200: ${params.ma200 ? "$" + params.ma200.toFixed(2) : "N/A"}
MACD: ${params.macd.macdLine.toFixed(3)} vs Signal: ${params.macd.signal.toFixed(3)}
BB: $${params.bb.lower.toFixed(2)} - $${params.bb.upper.toFixed(2)} | ATR: ${params.atr.toFixed(2)}
OBV: ${params.obv.obvTrend} | IV Rank: ${params.ivRank.toFixed(0)}%
Hiệu suất 5 ngày: ${params.perf5d.toFixed(2)}% | 20 ngày: ${params.perf20d.toFixed(2)}%

== TÂM LÝ THỊ TRƯỜNG ==
VIX: ${params.vix ? params.vix.value.toFixed(2) + " (" + (params.vix.changePct >= 0 ? "+" : "") + params.vix.changePct.toFixed(2) + "%)" : "N/A"}
Fear & Greed: ${params.fearGreed ? params.fearGreed.score + "/100 - " + params.fearGreed.rating : "N/A"}

== LUÂN CHUYỂN NGÀNH ==
${topSectorText || "N/A"}

== TIN TỨC ==
${newsText || "Không có tin tức"}

== LÝ DO MUA: ${params.reasons_buy.slice(0,3).join(" | ")}
== LÝ DO TRÁNH: ${params.reasons_avoid.slice(0,3).join(" | ")}

Trả lời JSON thuần túy với TẤT CẢ các trường sau:
{
  "finalVerdict":"STRONG BUY hoặc BUY hoặc WATCH hoặc AVOID hoặc STRONG AVOID",
  "finalVerdictVi":"MUA MẠNH hoặc NÊN MUA hoặc THEO DÕI hoặc TRÁNH hoặc TRÁNH MẠNH",
  "finalAction":"Hành động cụ thể bằng tiếng Việt",
  "aiScore":số 0-100,
  "confidence":"Cao hoặc Trung bình hoặc Thấp",
  "marketRegime":"BULL hoặc BEAR hoặc SIDEWAYS hoặc HIGH_VOLATILITY",
  "marketRegimeVi":"Thị trường tăng hoặc Thị trường giảm hoặc Đi ngang hoặc Biến động cao",
  "marketRegimeStrategy":"Chiến lược phù hợp với chế độ thị trường hiện tại — 1 câu tiếng Việt",
  "probUp":số 0-100 (xác suất tăng trong 5 ngày),
  "probSideways":số 0-100 (xác suất đi ngang),
  "probDown":số 0-100 (xác suất giảm, tổng 3 số = 100),
  "checklist":{
    "trendOK":true/false,
    "volumeOK":true/false,
    "vixOK":true/false,
    "fearGreedOK":true/false,
    "macdOK":true/false,
    "rsiOK":true/false,
    "allowTrade":true/false
  },
  "newsScore":số -100 đến 100 (điểm tin tức: dương=tốt, âm=xấu),
  "newsScoreLabel":"Rất tích cực hoặc Tích cực hoặc Trung lập hoặc Tiêu cực hoặc Rất tiêu cực",
  "optionsScore":{
    "sellPutScore":số 0-100,
    "probabilityOTM":số 0-100 (xác suất hết hạn vô giá trị),
    "riskReward":"1:X",
    "recommendedStrike":"$XXX",
    "recommendedExpiry":"X ngày",
    "maxRisk":"$XXX"
  },
  "groqSummary":"Tóm tắt tổng hợp 2-3 câu tiếng Việt",
  "groqAdvice":"Lời khuyên cụ thể: giá vào, stop loss, mục tiêu",
  "groqRisk":"Rủi ro chính 1-2 câu",
  "sellPutAI":"Đánh giá Sell Put chi tiết",
  "sellCallAI":"Đánh giá Sell Call",
  "sectorRotationAdvice":"Ngành nào dòng tiền đang vào 2-4 tuần tới"
}`;

  try {
    const { res, lastError } = await callGroq({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Chuyên gia chứng khoán. Chỉ trả lời JSON thuần túy, không markdown." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 1200, // Đủ cho schema JSON nhiều field, nhưng không quá cao để tránh Groq trả lời chậm gây timeout trên Vercel Hobby
      response_format: { type: "json_object" }, // Ép Groq luôn trả JSON hợp lệ
    }, 12000);

    if (!res) {
      lastGroqDebugError = lastError || "Không có Groq key nào khả dụng";
      console.error("[analyzeWithGroq]", lastGroqDebugError);
      return null;
    }
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      lastGroqDebugError = `Groq API lỗi: status=${res.status} body=${errBody.slice(0, 300)}`;
      console.error("[analyzeWithGroq]", lastGroqDebugError);
      return null;
    }
    const json = await res.json();
    if (json.choices?.[0]?.finish_reason === "length") {
      lastGroqDebugError = "Response bị cắt cụt do vượt max_tokens";
      console.error("[analyzeWithGroq]", lastGroqDebugError);
    }
    let text = (json.choices?.[0]?.message?.content || "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace > 0 || (lastBrace !== -1 && lastBrace < text.length - 1)) {
      text = text.slice(firstBrace, lastBrace + 1);
    }
    try {
      lastGroqDebugError = null; // reset khi thành công
      return JSON.parse(text);
    } catch (parseErr: any) {
      lastGroqDebugError = `JSON.parse thất bại: ${parseErr?.message || ""} | Raw text (300 ký tự đầu): ${text.slice(0, 300)}`;
      console.error("[analyzeWithGroq]", lastGroqDebugError);
      return null;
    }
  } catch (e: any) {
    lastGroqDebugError = `Lỗi không xác định: ${e?.name || ""} ${e?.message || String(e)}`;
    console.error("[analyzeWithGroq]", lastGroqDebugError);
    return null;
  }
}

// ─── WATCHLIST + SECTORS ENDPOINT ────────────────────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  if (action === "watchlist") {
    const symbols = (searchParams.get("symbols") || "").split(",").filter(Boolean);
    const results = await Promise.allSettled(symbols.map(async (sym) => {
      const q = await getAlphaQuote(sym);
      if (!q) return null;
      return { symbol: sym.toUpperCase(), price: q.price, change: q.change, changePct: q.changePct };
    }));
    return NextResponse.json({ watchlist: results.filter(r => r.status === "fulfilled" && (r as any).value).map((r: any) => r.value) });
  }

  if (action === "sectors") {
    const sectors = await getSectorRotation();
    return NextResponse.json({ sectors });
  }

  if (action === "market") {
    const [vix, fearGreed] = await Promise.all([getVIX(), getFearGreed()]);
    return NextResponse.json({ vix, fearGreed });
  }

  return NextResponse.json({ error: "Invalid action" });
}

// ─── MAIN ANALYZE ENDPOINT ────────────────────────────────────────────────────
export async function POST(req: Request) {
  const { symbol } = await req.json();

  // Fetch tất cả song song
  const [yahooData, alphaQuote, alphaCompany, alphaNews, vix, fearGreed, sectorData] = await Promise.allSettled([
    getStockData(symbol),
    getAlphaQuote(symbol),
    getAlphaCompany(symbol),
    getAlphaNews(symbol),
    getVIX(),
    getFearGreed(),
    getSectorRotation(),
  ]);

  const data = yahooData.status === "fulfilled" ? yahooData.value : null;
  const result = data?.chart?.result?.[0];
  if (!result) return NextResponse.json({ error: "Symbol not found" });

  const quote = result.indicators.quote[0];
  const closes: number[] = quote.close.filter((p: number) => p != null);
  const highs: number[] = quote.high.filter((p: number) => p != null);
  const lows: number[] = quote.low.filter((p: number) => p != null);
  const volumes: number[] = quote.volume.filter((v: number) => v != null);

  // Nguồn giá: Yahoo v8 (miễn phí, cập nhật trong phiên) làm chính.
  // Polygon free chỉ có dữ liệu EOD (xem getAlphaQuote) nên chỉ dùng làm fallback khi Yahoo lỗi.
  const aq = alphaQuote.status === "fulfilled" ? alphaQuote.value : null;
  const meta: any = result.meta || {};

  const yahooPrice: number | null = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : null;

  // prevClose ưu tiên lấy từ mảng giá đóng cửa lịch sử thực tế (closes[length-2]) thay vì
  // field meta.chartPreviousClose/previousClose của Yahoo — với các mã biến động mạnh, field
  // meta đôi khi trỏ về mốc xa hơn phiên liền trước, gây ra % thay đổi sai lệch rất lớn (vd +227%).
  const closesPrevClose: number | null =
    closes.length >= 2 && typeof closes[closes.length - 2] === "number" ? closes[closes.length - 2] : null;
  const yahooPrevClose: number | null =
    closesPrevClose ??
    (typeof meta.chartPreviousClose === "number" ? meta.chartPreviousClose
    : (typeof meta.previousClose === "number" ? meta.previousClose : null));

  const currentPrice: number =
    yahooPrice ?? (typeof aq?.price === "number" && aq.price > 0 ? aq.price : 0);
  const prevCloseForChange: number =
    yahooPrevClose ?? (typeof aq?.prevClose === "number" ? aq.prevClose : 0);

  const priceChange: number = prevCloseForChange ? currentPrice - prevCloseForChange : 0;
  const priceChangePct: number = prevCloseForChange ? (priceChange / prevCloseForChange) * 100 : 0;

  // After-hours / pre-market THẬT từ Yahoo (miễn phí) — Polygon free không hỗ trợ field này
  const marketState: string | undefined = meta.marketState;
  let afterHoursPrice: number | null = null;
  let afterHoursPct: number | null = null;
  let afterHoursLabel = "";

  if (marketState === "POST" && typeof meta.postMarketPrice === "number" && currentPrice) {
    afterHoursPrice = meta.postMarketPrice;
    afterHoursPct = ((meta.postMarketPrice - currentPrice) / currentPrice) * 100;
    afterHoursLabel = "After-hours";
  } else if (marketState === "PRE" && typeof meta.preMarketPrice === "number" && currentPrice) {
    afterHoursPrice = meta.preMarketPrice;
    afterHoursPct = ((meta.preMarketPrice - currentPrice) / currentPrice) * 100;
    afterHoursLabel = "Pre-market";
  }

  if (closes.length < 50) return NextResponse.json({ error: "Not enough data" });

  // Thông tin công ty từ Polygon + Alpha Vantage
  const co = alphaCompany.status === "fulfilled" ? alphaCompany.value : null;
  const companyName: string = co?.name || result.meta.longName || result.meta.shortName || symbol;
  const sector: string = co?.sector || "N/A";
  const industry: string = co?.industry || "N/A";
  const description: string = co?.description || "";
  const peRatio: number | null = co?.peRatio ?? null;
  const forwardPE: number | null = co?.forwardPE ?? null;
  const marketCap: number | null = co?.marketCap ?? null;
  const revenueGrowth: number | null = co?.revenueGrowthYOY ?? null;
  const profitMargin: number | null = co?.profitMargin ?? null;
  const targetPrice: number | null = co?.targetPrice ?? null;
  const dividendYield: number | null = co?.dividendYield ?? null;
  const beta: number | null = co?.beta ?? null;
  const week52High: number | null = co?.week52High ?? null;
  const week52Low: number | null = co?.week52Low ?? null;
  const returnOnEquity: number | null = co?.returnOnEquity ?? null;
  const debtToEquity: number | null = co?.debtToEquity ?? null;
  const analystRating = co?.analystRating ?? null;

  // Tin tức từ Alpha Vantage
  const news: any[] = alphaNews.status === "fulfilled" ? alphaNews.value : [];
  const vixData = vix.status === "fulfilled" ? vix.value : null;
  const fearGreedData = fearGreed.status === "fulfilled" ? fearGreed.value : null;
  const sectors = sectorData.status === "fulfilled" ? sectorData.value : [];

  // Tính 18 chỉ báo kỹ thuật
  const rsi = calcRSI(closes);
  const stochRSI = calcStochRSI(closes);
  const ma20 = calcMA(closes, 20)!;
  const ma50 = calcMA(closes, 50)!;
  const ma200 = calcMA(closes, Math.min(200, closes.length));
  const ema9 = calcEMA(closes, 9);
  const ema21 = calcEMA(closes, 21);
  const macd = calcMACD(closes);
  const bb = calcBollinger(closes);
  const atr = calcATR(highs, lows, closes);
  const adx = calcADX(highs, lows, closes);
  const obv = calcOBV(closes, volumes);
  const supRes = calcSupRes(closes);
  const ivData = calcIVRankEstimate(closes);
  const perf = calcSectorStrength(closes);

  const currentVol = volumes[volumes.length - 1];
  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const volRatio = currentVol / avgVol;
  const buyVolumeEst = Math.round(currentVol * (rsi > 50 ? 0.6 : 0.4));
  const sellVolumeEst = currentVol - buyVolumeEst;
  const buyPct = Math.round((buyVolumeEst / currentVol) * 100);

  // Scoring
  let score = 50;
  const signals: string[] = [];
  const reasons_buy: string[] = [];
  const reasons_avoid: string[] = [];

  if (rsi < 30) { score += 15; signals.push("RSI oversold - bullish"); reasons_buy.push("RSI " + rsi.toFixed(1) + " — vùng oversold, xác suất bật lên cao"); }
  else if (rsi < 45) { score += 8; signals.push("RSI approaching oversold"); reasons_buy.push("RSI " + rsi.toFixed(1) + " — chưa overbought, còn dư địa tăng"); }
  else if (rsi > 70) { score -= 15; signals.push("RSI overbought - bearish"); reasons_avoid.push("RSI " + rsi.toFixed(1) + " — overbought, rủi ro điều chỉnh cao"); }
  else if (rsi > 55 && rsi < 65) { score += 5; signals.push("RSI healthy bullish range"); reasons_buy.push("RSI " + rsi.toFixed(1) + " — vùng tăng khỏe mạnh"); }

  if (stochRSI < 20) { score += 10; signals.push("Stoch RSI oversold - strong buy"); reasons_buy.push("Stoch RSI " + stochRSI.toFixed(1) + " — oversold mạnh, điểm vào tốt"); }
  else if (stochRSI < 40) { score += 5; signals.push("Stoch RSI bullish zone"); reasons_buy.push("Stoch RSI " + stochRSI.toFixed(1) + " — vùng bullish"); }
  else if (stochRSI > 80) { score -= 10; signals.push("Stoch RSI overbought"); reasons_avoid.push("Stoch RSI " + stochRSI.toFixed(1) + " — overbought, cẩn thận"); }

  if (currentPrice > ma20) { score += 7; signals.push("Price above MA20 - bullish"); reasons_buy.push("Giá trên MA20 $" + ma20.toFixed(2) + " — xu hướng ngắn hạn tăng"); }
  else { score -= 7; signals.push("Price below MA20 - bearish"); reasons_avoid.push("Giá dưới MA20 — xu hướng ngắn hạn yếu"); }

  if (currentPrice > ma50) { score += 7; signals.push("Price above MA50 - bullish"); reasons_buy.push("Giá trên MA50 $" + ma50.toFixed(2) + " — xu hướng trung hạn tăng"); }
  else { score -= 7; signals.push("Price below MA50 - bearish"); reasons_avoid.push("Giá dưới MA50 — xu hướng trung hạn yếu"); }

  if (ma200 && currentPrice > ma200) { score += 8; signals.push("Price above MA200 - strong uptrend"); reasons_buy.push("Giá trên MA200 — xu hướng dài hạn tăng rất mạnh"); }
  else if (ma200) { score -= 8; signals.push("Price below MA200 - downtrend"); reasons_avoid.push("Giá dưới MA200 — xu hướng dài hạn giảm"); }

  if (ema9 > ema21) { score += 6; signals.push("EMA9 above EMA21 - bullish"); reasons_buy.push("EMA9 cắt lên EMA21 — momentum tăng ngắn hạn"); }
  else { score -= 4; signals.push("EMA9 below EMA21 - bearish"); reasons_avoid.push("EMA9 dưới EMA21 — momentum yếu"); }

  if (ma20 > ma50) { score += 6; signals.push("MA20 > MA50 - golden cross zone"); reasons_buy.push("MA20 trên MA50 — vùng golden cross bullish"); }
  else { score -= 6; signals.push("MA20 < MA50 - death cross zone"); reasons_avoid.push("MA20 dưới MA50 — vùng death cross bearish"); }

  if (macd.macdLine > macd.signal) { score += 7; signals.push("MACD bullish crossover"); reasons_buy.push("MACD cắt lên signal — momentum tăng xác nhận"); }
  else { score -= 7; signals.push("MACD bearish crossover"); reasons_avoid.push("MACD dưới signal — momentum yếu"); }

  if (currentPrice < bb.lower) { score += 10; signals.push("Price below BB lower - oversold bounce"); reasons_buy.push("Giá dưới BB Lower — khả năng bật lên mạnh"); }
  else if (currentPrice > bb.upper) { score -= 10; signals.push("Price above BB upper - overbought"); reasons_avoid.push("Giá trên BB Upper — overbought, rủi ro giảm"); }
  else if (currentPrice < bb.middle) { score += 3; signals.push("Price below BB middle - recovery zone"); }

  if (adx.adx > 25 && adx.diPlus > adx.diMinus) { score += 8; signals.push("ADX strong uptrend"); reasons_buy.push("ADX " + adx.adx.toFixed(0) + " — xu hướng tăng mạnh"); }
  else if (adx.adx > 25 && adx.diMinus > adx.diPlus) { score -= 8; signals.push("ADX strong downtrend"); reasons_avoid.push("ADX " + adx.adx.toFixed(0) + " — xu hướng giảm mạnh"); }

  if (obv.obvTrend === "bullish") { score += 6; signals.push("OBV bullish"); reasons_buy.push("OBV tăng — dòng tiền thực đang vào mạnh"); }
  else { score -= 4; signals.push("OBV bearish"); reasons_avoid.push("OBV giảm — dòng tiền đang rút ra"); }

  if (volRatio > 1.5) { score += 5; signals.push("High volume"); reasons_buy.push("Volume " + volRatio.toFixed(1) + "x — xác nhận xu hướng mạnh"); }
  else if (volRatio < 0.5) { score -= 3; reasons_avoid.push("Volume thấp — thiếu xác nhận"); }

  if (ivData.ivRank > 50) { score += 3; reasons_buy.push("IV Rank " + ivData.ivRank.toFixed(0) + "% — tốt để sell put"); }
  else if (ivData.ivRank < 25) { reasons_avoid.push("IV Rank thấp — không lý tưởng để sell put"); }

  if (currentPrice > supRes.support) { score += 4; reasons_buy.push("Giá trên hỗ trợ $" + supRes.support.toFixed(2)); }
  else { score -= 4; reasons_avoid.push("Giá phá vỡ hỗ trợ — rủi ro giảm tiếp"); }

  if (perf.perf5d > 3) { score += 3; reasons_buy.push("Momentum 5 ngày +" + perf.perf5d.toFixed(1) + "%"); }
  else if (perf.perf5d < -5) { score -= 5; reasons_avoid.push("Giảm " + Math.abs(perf.perf5d).toFixed(1) + "% trong 5 ngày"); }

  if (vixData) {
    if (vixData.value > 30) { score -= 5; reasons_avoid.push("VIX " + vixData.value.toFixed(1) + " — thị trường sợ hãi cao"); }
    else if (vixData.value < 15) { score += 3; reasons_buy.push("VIX thấp " + vixData.value.toFixed(1) + " — thị trường ổn định"); }
  }

  if (fearGreedData) {
    if (fearGreedData.score < 25) { score += 5; reasons_buy.push("Fear & Greed " + fearGreedData.score + " — cực kỳ sợ hãi, cơ hội mua"); }
    else if (fearGreedData.score > 75) { score -= 5; reasons_avoid.push("Fear & Greed " + fearGreedData.score + " — cực kỳ tham lam, cẩn thận"); }
  }

  score = Math.max(0, Math.min(100, score));

  let verdict = "WATCH", verdictVi = "THEO DÕI", action = "Wait for clearer signal", actionVi = "Chờ tín hiệu rõ hơn";
  if (score >= 80) { verdict = "STRONG BUY"; verdictVi = "MUA MẠNH"; action = "Strong entry"; actionVi = "Vào lệnh mạnh — Mua cổ & Bán Put"; }
  else if (score >= 68) { verdict = "BUY"; verdictVi = "NÊN MUA"; action = "Good entry"; actionVi = "Vào lệnh tốt — xác nhận bằng volume"; }
  else if (score >= 55) { verdict = "WATCH"; verdictVi = "THEO DÕI"; action = "Wait"; actionVi = "Chờ setup tốt hơn"; }
  else if (score >= 40) { verdict = "AVOID"; verdictVi = "TRÁNH"; action = "Risk too high"; actionVi = "Rủi ro cao — chờ đợi"; }
  else { verdict = "STRONG AVOID"; verdictVi = "TRÁNH MẠNH"; action = "High risk"; actionVi = "Rủi ro rất cao — không vào lệnh"; }

  const sellPutSafe = score >= 68 && rsi < 65 && stochRSI < 70 && currentPrice > ma50 && ivData.ivRank > 25;
  const sellCallSafe = score <= 40 && rsi > 65 && currentPrice < ma20 && obv.obvTrend === "bearish";
  const sellPutDays = score >= 80 ? "7-14 ngày tốt nhất" : score >= 68 ? "14-21 ngày phù hợp" : "Không nên sell put lúc này";
  const strikeConservative = (currentPrice * 0.95).toFixed(2);
  const strikeAggressive = (currentPrice - 1.5 * atr).toFixed(2);
  const strikeATR = (currentPrice - 2 * atr).toFixed(2);
  const stopLoss = (currentPrice - 1.5 * atr).toFixed(2);
  const target1 = (currentPrice * 1.05).toFixed(2);
  const target2 = (currentPrice * 1.10).toFixed(2);
  const target3 = (currentPrice * 1.15).toFixed(2);
  const targetLong = (currentPrice * 1.30).toFixed(2);

  // Dịch tin tức + phân tích tổng hợp — chạy SONG SONG (không phụ thuộc nhau)
  // để giảm tổng thời gian xử lý, tránh vượt giới hạn timeout của Vercel Hobby plan (~10-60s)
  const translateNewsPromise = (async () => {
    if (GROQ_KEYS.length === 0 || news.length === 0) return;
    try {
      const titles = news.map((n: any) => n.title).join("\n");
      const { res: transRes } = await callGroq({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "Dịch tiêu đề tin tức chứng khoán Anh→Việt. Trả về JSON array, không markdown." },
          { role: "user", content: `Dịch:\n${titles}\nTrả về: ["dịch 1","dịch 2",...]` }
        ],
        temperature: 0.1, max_tokens: 400,
      }, 8000);
      if (transRes?.ok) {
        const transJson = await transRes.json();
        const transText = (transJson.choices?.[0]?.message?.content || "").replace(/```json\n?/g,"").replace(/```\n?/g,"").trim();
        const translations = JSON.parse(transText);
        if (Array.isArray(translations)) {
          translations.forEach((t: string, i: number) => { if (news[i]) news[i].titleVi = t; });
        }
      }
    } catch {}
  })();

  const groqAnalysisPromise = analyzeWithGroq({
    symbol, companyName, sector, industry,
    price: currentPrice,
    peRatio, revenueGrowth, profitMargin, marketCap,
    targetPrice, returnOnEquity, debtToEquity,
    score, rsi, stochRSI, ma20, ma50, ma200, macd, bb, atr, adx, obv,
    ivRank: ivData.ivRank, perf5d: perf.perf5d, perf20d: perf.perf20d,
    vix: vixData, fearGreed: fearGreedData,
    topSectors: sectors.slice(0, 6),
    news: news.slice(0, 4),
    reasons_buy, reasons_avoid,
  }).catch(() => null);

  const [, groqResult] = await Promise.all([translateNewsPromise, groqAnalysisPromise]);

  const finalVerdict = groqResult?.finalVerdict || verdict;
  const finalVerdictVi = groqResult?.finalVerdictVi || verdictVi;
  const finalAction = groqResult?.finalAction || actionVi;
  const aiScore = groqResult?.aiScore || score;

  return NextResponse.json({
    symbol: symbol.toUpperCase(),
    companyName, sector, industry, description,
    price: currentPrice.toFixed(2),
    priceChange: priceChange.toFixed(2),
    priceChangePct: priceChangePct.toFixed(2),
    afterHoursPrice: afterHoursPrice ? afterHoursPrice.toFixed(2) : null,
    afterHoursPct: afterHoursPct ? afterHoursPct.toFixed(2) : null,
    afterHoursLabel: afterHoursLabel || null,
    peRatio: peRatio != null ? (peRatio as number).toFixed(2) : null,
    forwardPE: forwardPE != null ? (forwardPE as number).toFixed(2) : null,
    marketCap,
    targetPrice: targetPrice != null ? (targetPrice as number).toFixed(2) : null,
    dividendYield: dividendYield != null ? (dividendYield as number).toFixed(2) : null,
    beta: beta != null ? (beta as number).toFixed(2) : null,
    week52High: week52High != null ? (week52High as number).toFixed(2) : null,
    week52Low: week52Low != null ? (week52Low as number).toFixed(2) : null,
    returnOnEquity: returnOnEquity != null ? (returnOnEquity as number).toFixed(1) : null,
    debtToEquity: debtToEquity != null ? (debtToEquity as number).toFixed(2) : null,
    analystRating,
    score, aiScore,
    verdict: finalVerdict, verdictVi: finalVerdictVi,
    action: finalAction, actionVi: finalAction,
    aiConfidence: groqResult?.confidence || "N/A",
    groqSummary: groqResult?.groqSummary || null,
    groqAdvice: groqResult?.groqAdvice || null,
    groqRisk: groqResult?.groqRisk || null,
    sellPutAI: groqResult?.sellPutAI || null,
    sellCallAI: groqResult?.sellCallAI || null,
    sectorRotationAdvice: groqResult?.sectorRotationAdvice || null,
    vix: vixData, fearGreed: fearGreedData,
    news,
    sectorRotation: sectors,
    indicators: {
      rsi: rsi.toFixed(2), stochRSI: stochRSI.toFixed(2),
      ma20: ma20.toFixed(2), ma50: ma50.toFixed(2), ma200: ma200 ? ma200.toFixed(2) : "N/A",
      ema9: ema9.toFixed(2), ema21: ema21.toFixed(2),
      macd: macd.macdLine.toFixed(3), macdSignal: macd.signal.toFixed(3), macdHistogram: macd.histogram.toFixed(3),
      bbUpper: bb.upper.toFixed(2), bbMiddle: bb.middle.toFixed(2), bbLower: bb.lower.toFixed(2),
      atr: atr.toFixed(2), adx: adx.adx.toFixed(1), diPlus: adx.diPlus.toFixed(1), diMinus: adx.diMinus.toFixed(1),
      obvTrend: obv.obvTrend, ivRank: ivData.ivRank.toFixed(0), annualVol: ivData.annualVol.toFixed(1),
      volume: currentVol.toLocaleString(), avgVolume: Math.round(avgVol).toLocaleString(),
      volumeRatio: volRatio.toFixed(2), buyVolume: buyVolumeEst.toLocaleString(),
      sellVolume: sellVolumeEst.toLocaleString(), buyPct,
      support: supRes.support.toFixed(2), resistance: supRes.resistance.toFixed(2),
      perf5d: perf.perf5d.toFixed(2), perf20d: perf.perf20d.toFixed(2),
    },
    trading: { entry: currentPrice.toFixed(2), stopLoss, stopLossATR: (currentPrice - 1.5 * atr).toFixed(2), target1, target2, target3, targetLong },
    sellPut: {
      safe: sellPutSafe,
      recommendation: sellPutSafe ? "An toàn để Sell Put" : "Chưa an toàn để Sell Put",
      timing: sellPutDays, strikeConservative, strikeAggressive, strikeATR,
      ivRank: ivData.ivRank.toFixed(0),
    },
    sellCall: { safe: sellCallSafe, recommendation: sellCallSafe ? "An toàn để Sell Call" : "Không nên Sell Call" },
    reasons_buy: reasons_buy.slice(0, 5),
    reasons_avoid: reasons_avoid.slice(0, 4),
    signals,
    // ── Tính năng mới ──
    marketRegime: groqResult?.marketRegime || null,
    marketRegimeVi: groqResult?.marketRegimeVi || null,
    marketRegimeStrategy: groqResult?.marketRegimeStrategy || null,
    probability: {
      up: groqResult?.probUp || null,
      sideways: groqResult?.probSideways || null,
      down: groqResult?.probDown || null,
    },
    checklist: groqResult?.checklist || null,
    newsScore: groqResult?.newsScore || null,
    newsScoreLabel: groqResult?.newsScoreLabel || null,
    optionsScore: groqResult?.optionsScore || null,
    _debugGroqError: groqResult ? null : lastGroqDebugError, // Tạm thời để chẩn đoán — xóa sau khi sửa xong
  });
}