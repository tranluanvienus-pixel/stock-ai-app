import { NextResponse } from "next/server";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || "";

// ─── DATA FETCHERS ────────────────────────────────────────────────────────────

async function getStockData(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  return res.json();
}

// Finnhub real-time quote
async function getFinnhubQuote(symbol: string) {
  if (!FINNHUB_API_KEY) return null;
  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

// Yahoo Finance company info (thông tin công ty thật)
async function getCompanyInfo(symbol: string) {
  const modules = "assetProfile,summaryDetail,financialData,defaultKeyStatistics,price";
  const headers = { 
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://finance.yahoo.com/quote/" + symbol,
  };
  // Try query2 first, then query1
  for (const host of ["query2", "query1"]) {
    try {
      const res = await fetch(
        `https://${host}.finance.yahoo.com/v11/finance/quoteSummary/${symbol}?modules=${modules}`,
        { headers }
      );
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.quoteSummary?.result?.[0];
      if (result) return result;
    } catch {}
  }
  return null;
}

// Yahoo Finance tin tức thật
async function getRealNews(symbol: string) {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${symbol}&quotesCount=0&newsCount=6`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.news || []).slice(0, 6).map((n: any) => ({
      title: n.title || "",
      titleVi: "", // will be filled by Groq if needed
      url: n.link || "",
      source: n.publisher || "Yahoo Finance",
      publishedAt: new Date((n.providerPublishTime || 0) * 1000).toISOString(),
      sentiment: analyzeSentiment(n.title || ""),
    }));
  } catch { return []; }
}

// VIX real-time
async function getVIX() {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((c: number) => c != null) || [];
    const current = closes[closes.length - 1];
    const prev = closes[closes.length - 2];
    return { value: current, change: current - prev, changePct: ((current - prev) / prev) * 100 };
  } catch { return null; }
}

// Fear & Greed Index — CNN first (most accurate), Alternative.me as fallback
async function getFearGreed() {
  // 1. Try CNN API directly (most accurate, matches cnn.com/markets/fear-and-greed)
  try {
    const res = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
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

  // 2. Try CNN backup endpoint
  try {
    const res = await fetch("https://fear-and-greed-index.p.rapidapi.com/v1/fgi", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (res.ok) {
      const json = await res.json();
      const score = json?.fgi?.now?.value;
      if (score) return { score: Math.round(score), rating: json?.fgi?.now?.valueText || "", source: "RapidAPI" };
    }
  } catch {}

  // 3. Alternative.me (crypto F&G — different from stock market but good indicator)
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (res.ok) {
      const json = await res.json();
      const item = json?.data?.[0];
      if (item) {
        return { score: parseInt(item.value), rating: item.value_classification, source: "Alternative.me" };
      }
    }
  } catch {}

  return null;
}

// Sector ETF performance
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
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${s.symbol}?interval=1d&range=1mo`,
          { headers: { "User-Agent": "Mozilla/5.0" } }
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
  return results.filter(r => r.status === "fulfilled").map((r: any) => r.value)
    .sort((a: any, b: any) => b.perf5d - a.perf5d);
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

// ─── GROQ AI — KẾT HỢP TẤT CẢ → VERDICT CUỐI CÙNG ──────────────────────────
async function analyzeWithGroq(params: {
  symbol: string; companyName: string; sector: string; industry: string;
  price: number; afterHoursPrice?: number; afterHoursPct?: number;
  peRatio?: number; revenueGrowth?: number; profitMargin?: number; marketCap?: number;
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
} | null> {
  if (!GROQ_API_KEY) return null;

  const newsText = (params.news || []).slice(0, 4).map(n => `[${n.sentiment.toUpperCase()}] ${n.title}`).join("\n");
  const topSectorText = (params.topSectors || []).slice(0, 5).map(s => `${s.nameVi}: ${s.perf5d > 0 ? "+" : ""}${s.perf5d.toFixed(1)}% (${s.flowSignal})`).join(", ");

  const prompt = `Bạn là chuyên gia phân tích chứng khoán Mỹ hàng đầu với 20 năm kinh nghiệm. Phân tích toàn diện và đưa ra kết luận cuối cùng cho ${params.symbol}.

== THÔNG TIN CÔNG TY ==
Tên: ${params.companyName} | Ngành: ${params.sector} - ${params.industry}
Vốn hóa: ${params.marketCap ? "$" + (params.marketCap/1e9).toFixed(1) + "B" : "N/A"} | P/E: ${params.peRatio?.toFixed(1) || "N/A"} | Tăng trưởng DT: ${params.revenueGrowth?.toFixed(1) || "N/A"}% | Biên LN: ${params.profitMargin?.toFixed(1) || "N/A"}%

== GIÁ REAL-TIME ==
Giá hiện tại: $${params.price.toFixed(2)}
${params.afterHoursPrice ? `After-hours: $${params.afterHoursPrice.toFixed(2)} (${params.afterHoursPct?.toFixed(2)}%)` : ""}

== 18 CHỈ BÁO KỸ THUẬT (Điểm tổng: ${params.score}/100) ==
RSI: ${params.rsi.toFixed(1)} | StochRSI: ${params.stochRSI.toFixed(1)} | ADX: ${params.adx.adx.toFixed(1)}
MA20: $${params.ma20.toFixed(2)} | MA50: $${params.ma50.toFixed(2)} | MA200: ${params.ma200 ? "$" + params.ma200.toFixed(2) : "N/A"}
MACD: ${params.macd.macdLine.toFixed(3)} vs Signal: ${params.macd.signal.toFixed(3)}
BB: $${params.bb.lower.toFixed(2)} - $${params.bb.upper.toFixed(2)} | ATR: ${params.atr.toFixed(2)}
OBV: ${params.obv.obvTrend} | IV Rank: ${params.ivRank.toFixed(0)}%
Hiệu suất 5 ngày: ${params.perf5d.toFixed(2)}% | 20 ngày: ${params.perf20d.toFixed(2)}%

== TÂM LÝ THỊ TRƯỜNG ==
VIX: ${params.vix ? params.vix.value.toFixed(2) + " (" + (params.vix.changePct >= 0 ? "+" : "") + params.vix.changePct.toFixed(2) + "%)" : "N/A"}
Fear & Greed: ${params.fearGreed ? params.fearGreed.score + "/100 - " + params.fearGreed.rating : "N/A"}

== LUÂN CHUYỂN NGÀNH (5 ngày) ==
${topSectorText || "N/A"}

== TIN TỨC GẦN ĐÂY ==
${newsText || "Không có tin tức"}

== LÝ DO MUA: ${params.reasons_buy.slice(0,3).join(" | ")}
== LÝ DO TRÁNH: ${params.reasons_avoid.slice(0,3).join(" | ")}

Dựa trên TẤT CẢ dữ liệu trên, hãy đưa ra kết luận cuối cùng. Trả lời JSON thuần túy:
{
  "finalVerdict": "STRONG BUY" hoặc "BUY" hoặc "WATCH" hoặc "AVOID" hoặc "STRONG AVOID",
  "finalVerdictVi": "MUA MẠNH" hoặc "NÊN MUA" hoặc "THEO DÕI" hoặc "TRÁNH" hoặc "TRÁNH MẠNH",
  "finalAction": "Hành động cụ thể ngắn gọn bằng tiếng Việt",
  "aiScore": số từ 0-100,
  "confidence": "Cao" hoặc "Trung bình" hoặc "Thấp",
  "groqSummary": "Tóm tắt phân tích tổng hợp 2-3 câu, kết hợp kỹ thuật + cơ bản + tâm lý thị trường",
  "groqAdvice": "Lời khuyên hành động cụ thể: giá vào lệnh, stop loss, mục tiêu, thời điểm",
  "groqRisk": "Rủi ro chính cần lưu ý 1-2 câu",
  "sellPutAI": "Đánh giá Sell Put: an toàn không, strike gợi ý, thời hạn",
  "sellCallAI": "Đánh giá Sell Call: có nên không và lý do",
  "sectorRotationAdvice": "Ngành nào đang được dòng tiền vào 2-4 tuần tới và lý do ngắn gọn"
}`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "Chuyên gia chứng khoán. Chỉ trả lời JSON thuần túy, không markdown." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2, max_tokens: 800,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text = (json.choices?.[0]?.message?.content || "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(text);
  } catch { return null; }
}

// ─── WATCHLIST ENDPOINT ───────────────────────────────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  if (action === "watchlist") {
    const symbols = (searchParams.get("symbols") || "").split(",").filter(Boolean);
    const results = await Promise.allSettled(symbols.map(async (sym) => {
      const q = await getFinnhubQuote(sym);
      if (!q || !q.c) return null;
      return { symbol: sym.toUpperCase(), price: q.c, change: q.d, changePct: q.dp, high: q.h, low: q.l, open: q.o, prevClose: q.pc };
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
  const [yahooData, finnhubQuote, companyInfoData, realNews, vix, fearGreed, sectorData] = await Promise.allSettled([
    getStockData(symbol),
    getFinnhubQuote(symbol),
    getCompanyInfo(symbol),
    getRealNews(symbol),
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

  // Dùng Finnhub real-time nếu có, fallback Yahoo
  const fq = finnhubQuote.status === "fulfilled" ? finnhubQuote.value : null;
  const currentPrice: number = (fq?.c && fq.c > 0) ? fq.c : result.meta.regularMarketPrice;

  if (closes.length < 50) return NextResponse.json({ error: "Not enough data" });

  // Thông tin công ty thật từ Yahoo
  const ci = companyInfoData.status === "fulfilled" ? companyInfoData.value : null;
  const profile = ci?.assetProfile || {};
  const summaryDetail = ci?.summaryDetail || {};
  const financialData = ci?.financialData || {};
  const keyStats = ci?.defaultKeyStatistics || {};
  const priceInfo = ci?.price || {};

  const companyName = priceInfo?.longName || priceInfo?.shortName || result.meta.symbol;
  const sector = profile?.sector || "N/A";
  const industry = profile?.industry || "N/A";
  const description = profile?.longBusinessSummary || "";
  const peRatio = summaryDetail?.trailingPE?.raw || keyStats?.trailingEps?.raw;
  const forwardPE = summaryDetail?.forwardPE?.raw;
  const marketCap = priceInfo?.marketCap?.raw || summaryDetail?.marketCap?.raw;
  const revenueGrowth = financialData?.revenueGrowth?.raw ? financialData.revenueGrowth.raw * 100 : undefined;
  const profitMargin = financialData?.profitMargins?.raw ? financialData.profitMargins.raw * 100 : undefined;
  const targetPrice = financialData?.targetMeanPrice?.raw;
  const dividendYield = summaryDetail?.dividendYield?.raw ? summaryDetail.dividendYield.raw * 100 : 0;
  const beta = summaryDetail?.beta?.raw;
  const week52High = summaryDetail?.fiftyTwoWeekHigh?.raw || 0;
  const week52Low = summaryDetail?.fiftyTwoWeekLow?.raw || 0;

  // After-hours — từ Yahoo meta hoặc Finnhub premarket
  const postMarket = result.meta.postMarketPrice;
  const preMarket = result.meta.preMarketPrice;
  const afterHoursPrice = postMarket && Math.abs(postMarket - currentPrice) > 0.01 ? postMarket : 
                          preMarket && Math.abs(preMarket - currentPrice) > 0.01 ? preMarket : undefined;
  const afterHoursPct = afterHoursPrice ? ((afterHoursPrice - currentPrice) / currentPrice) * 100 : undefined;

  // Tin tức thật
  const news = realNews.status === "fulfilled" ? realNews.value : [];
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

  // Tính score kỹ thuật
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

  // VIX adjustment
  if (vixData) {
    if (vixData.value > 30) { score -= 5; reasons_avoid.push("VIX " + vixData.value.toFixed(1) + " — thị trường sợ hãi cao"); }
    else if (vixData.value < 15) { score += 3; reasons_buy.push("VIX thấp " + vixData.value.toFixed(1) + " — thị trường ổn định"); }
  }

  // Fear & Greed adjustment
  if (fearGreedData) {
    if (fearGreedData.score < 25) { score += 5; reasons_buy.push("Fear & Greed " + fearGreedData.score + " — cực kỳ sợ hãi, cơ hội mua"); }
    else if (fearGreedData.score > 75) { score -= 5; reasons_avoid.push("Fear & Greed " + fearGreedData.score + " — cực kỳ tham lam, cẩn thận"); }
  }

  score = Math.max(0, Math.min(100, score));

  // Verdict kỹ thuật ban đầu
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

  // Groq AI — verdict cuối cùng
  const groqResult = await analyzeWithGroq({
    symbol, companyName, sector, industry,
    price: currentPrice, afterHoursPrice, afterHoursPct,
    peRatio, revenueGrowth, profitMargin, marketCap,
    score, rsi, stochRSI, ma20, ma50, ma200, macd, bb, atr, adx, obv,
    ivRank: ivData.ivRank, perf5d: perf.perf5d, perf20d: perf.perf20d,
    vix: vixData, fearGreed: fearGreedData,
    topSectors: sectors.slice(0, 6),
    news: news.slice(0, 4),
    reasons_buy, reasons_avoid,
  }).catch(() => null);

  // Dùng verdict từ Groq AI nếu có, không thì dùng verdict kỹ thuật
  const finalVerdict = groqResult?.finalVerdict || verdict;
  const finalVerdictVi = groqResult?.finalVerdictVi || verdictVi;
  const finalAction = groqResult?.finalAction || actionVi;
  const aiScore = groqResult?.aiScore || score;

  return NextResponse.json({
    symbol: symbol.toUpperCase(),
    companyName, sector, industry, description,
    price: currentPrice.toFixed(2),
    afterHoursPrice: afterHoursPrice?.toFixed(2),
    afterHoursPct: afterHoursPct?.toFixed(2),
    peRatio: peRatio?.toFixed(2), forwardPE: forwardPE?.toFixed(2),
    marketCap, targetPrice: targetPrice?.toFixed(2),
    dividendYield: dividendYield?.toFixed(2), beta: beta?.toFixed(2),
    week52High: week52High?.toFixed(2), week52Low: week52Low?.toFixed(2),
    // Scores
    score, aiScore,
    // Verdict cuối từ AI
    verdict: finalVerdict, verdictVi: finalVerdictVi,
    action: finalAction, actionVi: finalAction,
    aiConfidence: groqResult?.confidence || "N/A",
    // Groq AI analysis
    groqSummary: groqResult?.groqSummary || null,
    groqAdvice: groqResult?.groqAdvice || null,
    groqRisk: groqResult?.groqRisk || null,
    sellPutAI: groqResult?.sellPutAI || null,
    sellCallAI: groqResult?.sellCallAI || null,
    sectorRotationAdvice: groqResult?.sectorRotationAdvice || null,
    // Market data
    vix: vixData, fearGreed: fearGreedData,
    // Tin tức thật
    news,
    // Sector rotation
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
  });
}