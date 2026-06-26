export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const POLYGON_KEY = process.env.POLYGON_API_KEY || "";

// Yahoo v8 — lấy giá chỉ số (không bị block)
async function getIndexPrice(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const closes = result.indicators.quote[0].close.filter((c: number) => c != null);
    const current = result.meta.regularMarketPrice || closes[closes.length - 1];
    const prev = closes[closes.length - 2] || closes[closes.length - 1];
    const change = current - prev;
    const changePct = prev ? (change / prev) * 100 : 0;
    const high = result.meta.regularMarketDayHigh || current;
    const low = result.meta.regularMarketDayLow || current;
    return { price: current, change, changePct, high, low };
  } catch { return null; }
}

// Polygon — tin tức thị trường với sentiment
async function getMarketNews() {
  if (!POLYGON_KEY) return [];
  try {
    const res = await fetch(
      `https://api.polygon.io/v2/reference/news?limit=12&order=desc&apiKey=${POLYGON_KEY}`
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.results || []).slice(0, 10).map((n: any) => {
      const title = n.title || "";
      const posWords = ["surge", "rally", "gain", "rise", "jump", "beat", "record", "high", "strong", "growth", "profit", "up", "bull"];
      const negWords = ["drop", "fall", "decline", "loss", "miss", "crash", "low", "weak", "cut", "down", "bear", "risk", "warning", "tariff", "recession"];
      const lower = title.toLowerCase();
      const pos = posWords.filter(w => lower.includes(w)).length;
      const neg = negWords.filter(w => lower.includes(w)).length;
      const sentiment = pos > neg ? "positive" : neg > pos ? "negative" : "neutral";
      return {
        title,
        url: n.article_url || "",
        source: n.publisher?.name || "",
        publishedAt: n.published_utc ? n.published_utc.slice(0, 10) : "",
        sentiment,
        tickers: (n.tickers || []).slice(0, 3),
      };
    });
  } catch { return []; }
}

// VIX
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

// Groq AI — phân tích thị trường + dự báo ngày mai
async function getMarketAnalysis(params: {
  spy: { price: number; changePct: number } | null;
  qqq: { price: number; changePct: number } | null;
  dia: { price: number; changePct: number } | null;
  iwm: { price: number; changePct: number } | null;
  vix: number | null;
  fearGreed: number | null;
  news: { title: string; sentiment: string }[];
}) {
  if (!GROQ_API_KEY) return null;

  const positiveNews = params.news.filter(n => n.sentiment === "positive").slice(0, 3).map(n => `✅ ${n.title}`).join("\n");
  const negativeNews = params.news.filter(n => n.sentiment === "negative").slice(0, 3).map(n => `❌ ${n.title}`).join("\n");
  const neutralNews = params.news.filter(n => n.sentiment === "neutral").slice(0, 2).map(n => `⚡ ${n.title}`).join("\n");

  const marketDir = (params.spy?.changePct || 0) >= 0 ? "TĂNG" : "GIẢM";

  const prompt = `Bạn là chuyên gia phân tích thị trường chứng khoán Mỹ hàng đầu. Phân tích tình hình hôm nay và dự báo ngày mai.

DIỄN BIẾN HÔM NAY:
- S&P 500 (SPY): ${params.spy ? `$${params.spy.price.toFixed(2)} (${params.spy.changePct >= 0 ? "+" : ""}${params.spy.changePct.toFixed(2)}%)` : "N/A"}
- Nasdaq (QQQ): ${params.qqq ? `$${params.qqq.price.toFixed(2)} (${params.qqq.changePct >= 0 ? "+" : ""}${params.qqq.changePct.toFixed(2)}%)` : "N/A"}
- Dow Jones (DIA): ${params.dia ? `$${params.dia.price.toFixed(2)} (${params.dia.changePct >= 0 ? "+" : ""}${params.dia.changePct.toFixed(2)}%)` : "N/A"}
- Russell 2000 (IWM): ${params.iwm ? `$${params.iwm.price.toFixed(2)} (${params.iwm.changePct >= 0 ? "+" : ""}${params.iwm.changePct.toFixed(2)}%)` : "N/A"}
- VIX: ${params.vix?.toFixed(2) || "N/A"}
- Fear & Greed: ${params.fearGreed || "N/A"}/100

TIN TỐT HÔM NAY:
${positiveNews || "Không có"}

TIN XẤU HÔM NAY:
${negativeNews || "Không có"}

TIN TRUNG LẬP:
${neutralNews || "Không có"}

Thị trường hôm nay đang ${marketDir}. Hãy phân tích và trả lời JSON thuần túy:
{
  "whyMoving": "Lý do thị trường ${marketDir} hôm nay — 2-3 câu tiếng Việt",
  "tomorrowForecast": "Dự báo ngày mai: TĂNG hoặc GIẢM hoặc SIDEWAYS",
  "tomorrowReason": "Lý do dự báo ngày mai — 2-3 câu tiếng Việt, dựa trên tin tức và chỉ số",
  "tomorrowConfidence": "Cao hoặc Trung bình hoặc Thấp",
  "risks": "Rủi ro chính cần theo dõi — 1-2 câu tiếng Việt",
  "advice": "Lời khuyên cụ thể cho trader hôm nay và ngày mai — 1-2 câu tiếng Việt",
  "sentiment": "bullish hoặc bearish hoặc neutral",
  "keyLevels": "Mức hỗ trợ/kháng cự quan trọng của SPY cần theo dõi"
}`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "Chuyên gia thị trường chứng khoán Mỹ. Chỉ trả lời JSON thuần túy, không markdown." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3, max_tokens: 600,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text = (json.choices?.[0]?.message?.content || "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(text);
  } catch { return null; }
}

export async function GET() {
  const [spy, qqq, dia, iwm, vix, fearGreed, news] = await Promise.all([
    getIndexPrice("SPY"),
    getIndexPrice("QQQ"),
    getIndexPrice("DIA"),
    getIndexPrice("IWM"),
    getVIX(),
    getFearGreed(),
    getMarketNews(),
  ]);

  const aiAnalysis = await getMarketAnalysis({
    spy, qqq, dia, iwm,
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