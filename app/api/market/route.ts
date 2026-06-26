export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

const POLYGON_KEY = process.env.POLYGON_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

// Lấy snapshot giá từ Polygon
async function getSnapshot(symbol: string) {
  if (!POLYGON_KEY) return null;
  try {
    const res = await fetch(
      `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_KEY}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const t = json?.ticker;
    if (!t) return null;
    const price = t.lastTrade?.p || t.day?.c || 0;
    const prevClose = t.prevDay?.c || 0;
    const change = prevClose ? price - prevClose : 0;
    const changePct = prevClose ? (change / prevClose) * 100 : 0;
    return { symbol, price, change, changePct, high: t.day?.h, low: t.day?.l, volume: t.day?.v };
  } catch { return null; }
}

// Lấy tin tức vĩ mô từ Polygon
async function getMarketNews() {
  if (!POLYGON_KEY) return [];
  try {
    const res = await fetch(
      `https://api.polygon.io/v2/reference/news?limit=10&order=desc&apiKey=${POLYGON_KEY}`
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.results || []).slice(0, 8).map((n: any) => ({
      title: n.title || "",
      url: n.article_url || "",
      source: n.publisher?.name || "",
      publishedAt: n.published_utc ? n.published_utc.slice(0, 10) : "",
      tickers: n.tickers || [],
    }));
  } catch { return []; }
}

// Groq AI — tóm tắt lý do thị trường tăng/giảm
async function getMarketAnalysis(params: {
  spy: { price: number; changePct: number } | null;
  qqq: { price: number; changePct: number } | null;
  dia: { price: number; changePct: number } | null;
  vix: number | null;
  fearGreed: number | null;
  news: { title: string }[];
}) {
  if (!GROQ_API_KEY) return null;

  const newsText = params.news.slice(0, 6).map(n => `- ${n.title}`).join("\n");
  const marketDir = (params.spy?.changePct || 0) >= 0 ? "TĂNG" : "GIẢM";

  const prompt = `Bạn là chuyên gia phân tích thị trường chứng khoán Mỹ. Phân tích tình hình thị trường hôm nay.

DIỄN BIẾN THỊ TRƯỜNG:
- SPY (S&P 500): ${params.spy ? `$${params.spy.price.toFixed(2)} (${params.spy.changePct >= 0 ? "+" : ""}${params.spy.changePct.toFixed(2)}%)` : "N/A"}
- QQQ (Nasdaq): ${params.qqq ? `$${params.qqq.price.toFixed(2)} (${params.qqq.changePct >= 0 ? "+" : ""}${params.qqq.changePct.toFixed(2)}%)` : "N/A"}
- DIA (Dow Jones): ${params.dia ? `$${params.dia.price.toFixed(2)} (${params.dia.changePct >= 0 ? "+" : ""}${params.dia.changePct.toFixed(2)}%)` : "N/A"}
- VIX: ${params.vix?.toFixed(2) || "N/A"}
- Fear & Greed: ${params.fearGreed || "N/A"}/100

TIN TỨC VĨ MÔ HÔM NAY:
${newsText || "Không có tin tức"}

Thị trường đang ${marketDir}. Hãy giải thích:
1. Tại sao thị trường ${marketDir} hôm nay (2-3 câu ngắn gọn tiếng Việt)
2. Các yếu tố rủi ro cần theo dõi (1-2 câu)
3. Lời khuyên cho trader hôm nay (1 câu)

Trả lời JSON thuần túy:
{"whyMoving":"...","risks":"...","advice":"...","sentiment":"bullish hoặc bearish hoặc neutral"}`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "Chuyên gia thị trường chứng khoán Mỹ. Chỉ trả lời JSON thuần túy." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3, max_tokens: 400,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text = (json.choices?.[0]?.message?.content || "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(text);
  } catch { return null; }
}

// VIX từ Yahoo
async function getVIX() {
  try {
    const res = await fetch(
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

// Fear & Greed
async function getFearGreed() {
  try {
    const res = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://edition.cnn.com/markets/fear-and-greed",
        "Origin": "https://edition.cnn.com",
      }
    });
    if (res.ok) {
      const json = await res.json();
      const score = Math.round(json?.fear_and_greed?.score || 0);
      if (score > 0) return { score, rating: json?.fear_and_greed?.rating || "" };
    }
  } catch {}
  return null;
}

export async function GET() {
  const [spy, qqq, dia, iwm, vix, fearGreed, news] = await Promise.all([
    getSnapshot("SPY"),
    getSnapshot("QQQ"),
    getSnapshot("DIA"),
    getSnapshot("IWM"),
    getVIX(),
    getFearGreed(),
    getMarketNews(),
  ]);

  const aiAnalysis = await getMarketAnalysis({
    spy, qqq, dia,
    vix: vix?.value || null,
    fearGreed: fearGreed?.score || null,
    news,
  });

  return NextResponse.json({
    indices: { spy, qqq, dia, iwm },
    vix,
    fearGreed,
    news,
    aiAnalysis,
    updatedAt: new Date().toISOString(),
  });
}