export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const POLYGON_KEY = process.env.POLYGON_API_KEY || "";

// Lấy giá index từ Yahoo v8 + after-hours từ Polygon
async function getIndexPrice(yahooSymbol: string, polygonSymbol: string) {
  try {
    // Yahoo v8 — regular market data
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=5d`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const closes = result.indicators.quote[0].close.filter((c: number) => c != null);
    const regularPrice = result.meta.regularMarketPrice || closes[closes.length - 1];
    const prev = closes[closes.length - 2] || closes[closes.length - 1];
    const change = regularPrice - prev;
    const changePct = prev ? (change / prev) * 100 : 0;

    // Polygon — after-hours price
    let afterHoursPrice: number | null = null;
    let afterHoursPct: number | null = null;
    if (POLYGON_KEY) {
      try {
        const pRes = await fetch(
          `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${polygonSymbol}?apiKey=${POLYGON_KEY}`
        );
        if (pRes.ok) {
          const pJson = await pRes.json();
          const t = pJson?.ticker;
          const fmv = t?.fmv;
          if (fmv && Math.abs(fmv - regularPrice) > 0.05) {
            afterHoursPrice = fmv;
            afterHoursPct = ((fmv - regularPrice) / regularPrice) * 100;
          }
        }
      } catch {}
    }

    // Giá hiệu dụng = after-hours nếu có, không thì dùng regular
    const effectivePrice = afterHoursPrice || regularPrice;
    const effectiveChangePct = afterHoursPrice
      ? ((effectivePrice - prev) / prev) * 100
      : changePct;

    return {
      price: regularPrice,
      change,
      changePct,
      afterHoursPrice,
      afterHoursPct,
      effectivePrice,
      effectiveChangePct,
    };
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
      const posWords = ["surge", "rally", "gain", "rise", "jump", "beat", "record", "high", "strong", "growth", "profit", "up", "bull", "green"];
      const negWords = ["drop", "fall", "decline", "loss", "miss", "crash", "low", "weak", "cut", "down", "bear", "risk", "warning", "tariff", "recession", "selloff", "plunge"];
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

// Groq AI — phân tích + dự báo ngày mai dùng giá THỰC TẾ (after-hours)
async function getMarketAnalysis(params: {
  spy: { effectivePrice: number; effectiveChangePct: number; afterHoursPrice: number | null } | null;
  qqq: { effectivePrice: number; effectiveChangePct: number; afterHoursPrice: number | null } | null;
  dia: { effectivePrice: number; effectiveChangePct: number; afterHoursPrice: number | null } | null;
  iwm: { effectivePrice: number; effectiveChangePct: number } | null;
  vix: number | null;
  fearGreed: number | null;
  news: { title: string; sentiment: string }[];
}) {
  if (!GROQ_API_KEY) return null;

  const positiveNews = params.news.filter(n => n.sentiment === "positive").slice(0, 3).map(n => `✅ ${n.title}`).join("\n");
  const negativeNews = params.news.filter(n => n.sentiment === "negative").slice(0, 3).map(n => `❌ ${n.title}`).join("\n");

  const spyPrice = params.spy?.effectivePrice || 0;
  const spyPct = params.spy?.effectiveChangePct || 0;
  const marketDir = spyPct >= 0 ? "TĂNG" : "GIẢM";

  const prompt = `Bạn là chuyên gia phân tích thị trường chứng khoán Mỹ hàng đầu. Phân tích tình hình THỰC TẾ và dự báo ngày mai.

GIÁ THỰC TẾ HIỆN TẠI (bao gồm after-hours nếu có):
- S&P 500 (SPY): $${spyPrice.toFixed(2)} (${spyPct >= 0 ? "+" : ""}${spyPct.toFixed(2)}%)${params.spy?.afterHoursPrice ? " ← GIÁ AFTER-HOURS" : " ← GIÁ ĐÓNG CỬA"}
- Nasdaq (QQQ): $${(params.qqq?.effectivePrice || 0).toFixed(2)} (${(params.qqq?.effectiveChangePct || 0) >= 0 ? "+" : ""}${(params.qqq?.effectiveChangePct || 0).toFixed(2)}%)${params.qqq?.afterHoursPrice ? " ← AFTER-HOURS" : ""}
- Dow Jones (DIA): $${(params.dia?.effectivePrice || 0).toFixed(2)} (${(params.dia?.effectiveChangePct || 0) >= 0 ? "+" : ""}${(params.dia?.effectiveChangePct || 0).toFixed(2)}%)${params.dia?.afterHoursPrice ? " ← AFTER-HOURS" : ""}
- Russell 2000 (IWM): $${(params.iwm?.effectivePrice || 0).toFixed(2)} (${(params.iwm?.effectiveChangePct || 0) >= 0 ? "+" : ""}${(params.iwm?.effectiveChangePct || 0).toFixed(2)}%)
- VIX: ${params.vix?.toFixed(2) || "N/A"}
- Fear & Greed: ${params.fearGreed || "N/A"}/100

TIN TỐT:
${positiveNews || "Không có"}

TIN XẤU:
${negativeNews || "Không có"}

QUAN TRỌNG: Phân tích dựa trên giá THỰC TẾ hiện tại. Nếu SPY đang ở $${spyPrice.toFixed(2)}, hỗ trợ và kháng cự phải phù hợp với mức giá này.

Thị trường đang ${marketDir}. Trả lời JSON thuần túy:
{
  "whyMoving": "Lý do thị trường ${marketDir} hôm nay — 2-3 câu tiếng Việt",
  "tomorrowForecast": "TĂNG hoặc GIẢM hoặc SIDEWAYS",
  "tomorrowReason": "Lý do dự báo ngày mai — 2-3 câu tiếng Việt",
  "tomorrowConfidence": "Cao hoặc Trung bình hoặc Thấp",
  "risks": "Rủi ro chính — 1-2 câu tiếng Việt",
  "advice": "Lời khuyên cho trader — 1-2 câu tiếng Việt",
  "sentiment": "bullish hoặc bearish hoặc neutral",
  "keyLevels": "Hỗ trợ và kháng cự SPY thực tế dựa trên giá $${spyPrice.toFixed(2)}"
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
        temperature: 0.2, max_tokens: 600,
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
    getIndexPrice("SPY", "SPY"),
    getIndexPrice("QQQ", "QQQ"),
    getIndexPrice("DIA", "DIA"),
    getIndexPrice("IWM", "IWM"),
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