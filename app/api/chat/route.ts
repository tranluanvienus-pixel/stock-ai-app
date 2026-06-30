export const maxDuration = 30;
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const POLYGON_KEY = process.env.POLYGON_API_KEY || "";

// Lấy giá real-time nhanh từ Polygon khi AI Chat cần
async function getQuickQuote(symbol: string) {
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
    const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
    return { symbol, price, changePct, volume: t.day?.v || 0, high: t.day?.h, low: t.day?.l };
  } catch { return null; }
}

// Tin tức nhanh cho mã được nhắc đến
async function getQuickNews(symbol: string) {
  if (!POLYGON_KEY) return [];
  try {
    const res = await fetch(
      `https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=3&order=desc&apiKey=${POLYGON_KEY}`
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.results || []).slice(0, 3).map((n: any) => n.title);
  } catch { return []; }
}

// VIX nhanh
async function getQuickVIX() {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=2d`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((c: number) => c != null) || [];
    return closes.length ? closes[closes.length - 1] : null;
  } catch { return null; }
}

// Phát hiện mã cổ phiếu trong câu hỏi (VD: "AAPL", "TSLA có nên mua không")
function extractSymbols(text: string): string[] {
  const matches = text.match(/\b[A-Z]{1,5}\b/g) || [];
  // Loại các từ tiếng Anh phổ biến không phải mã CK
  const blacklist = new Set(["I", "A", "THE", "AI", "OK", "PE", "RSI", "MA", "VIX", "OTM", "IV", "CEO", "USD"]);
  return [...new Set(matches.filter(m => !blacklist.has(m)))].slice(0, 2);
}

// Phát hiện câu hỏi cần dữ liệu thị trường chung
function needsMarketData(text: string): boolean {
  const lower = text.toLowerCase();
  return /thị trường|vix|fear.*greed|market|hôm nay.*sao|tăng.*giảm/i.test(lower);
}

export async function POST(req: Request) {
  const { message, context, history } = await req.json();

  if (!GROQ_API_KEY) {
    return NextResponse.json({ error: "Groq API key not configured" }, { status: 500 });
  }

  // ── Tự động lấy dữ liệu real-time liên quan đến câu hỏi ──
  let liveDataText = "";

  // 1. Nếu câu hỏi nhắc đến mã khác với mã đang xem → lấy giá real-time mã đó
  const mentionedSymbols = extractSymbols(message);
  const symbolsToFetch = mentionedSymbols.filter(s => s !== context?.symbol).slice(0, 2);

  if (symbolsToFetch.length > 0) {
    const quotes = await Promise.all(symbolsToFetch.map(s => getQuickQuote(s)));
    const validQuotes = quotes.filter(q => q !== null);
    if (validQuotes.length > 0) {
      liveDataText += "\n\nDỮ LIỆU REAL-TIME (vừa lấy):\n";
      validQuotes.forEach(q => {
        liveDataText += `- ${q!.symbol}: $${q!.price.toFixed(2)} (${q!.changePct >= 0 ? "+" : ""}${q!.changePct.toFixed(2)}%)\n`;
      });
    }
  }

  // 2. Nếu hỏi về tin tức của mã cụ thể
  if (/tin tức|news|tin gì|có gì mới/i.test(message)) {
    const targetSymbol = mentionedSymbols[0] || context?.symbol;
    if (targetSymbol) {
      const news = await getQuickNews(targetSymbol);
      if (news.length > 0) {
        liveDataText += `\n\nTIN TỨC MỚI NHẤT VỀ ${targetSymbol}:\n${news.map((n: string) => `- ${n}`).join("\n")}\n`;
      }
    }
  }

  // 3. Nếu hỏi về thị trường chung → lấy VIX mới nhất
  if (needsMarketData(message)) {
    const vix = await getQuickVIX();
    if (vix) {
      liveDataText += `\n\nVIX REAL-TIME: ${vix.toFixed(2)} (${vix > 30 ? "thị trường sợ hãi cao" : vix > 20 ? "lo ngại vừa phải" : "thị trường ổn định"})\n`;
    }
  }

  // Xây dựng context từ mã đang phân tích (nếu có)
  let contextText = "";
  if (context) {
    contextText = `
THÔNG TIN MÃ ĐANG PHÂN TÍCH (${context.symbol}) — dữ liệu lúc phân tích:
- Công ty: ${context.companyName || "N/A"} | Ngành: ${context.sector || "N/A"}
- Giá: $${context.price}
- Điểm AI: ${context.aiScore || context.score}/100
- Verdict: ${context.verdictVi || context.verdict}
- RSI: ${context.indicators?.rsi} | MACD: ${context.indicators?.macd}
- MA20: $${context.indicators?.ma20} | MA50: $${context.indicators?.ma50}
- Sell Put: ${context.sellPut?.recommendation} | Strike: $${context.sellPut?.strikeConservative}
- VIX: ${context.vix?.value || "N/A"} | Fear&Greed: ${context.fearGreed?.score || "N/A"}
- Market Regime: ${context.marketRegimeVi || "N/A"}
${context.groqSummary ? `- Tóm tắt AI: ${context.groqSummary}` : ""}
`;
  }

  const conversationHistory = (history || []).slice(-6).map((m: any) => ({
    role: m.role,
    content: m.content,
  }));

  const systemPrompt = `Bạn là chuyên gia phân tích chứng khoán Mỹ với 20 năm kinh nghiệm, chuyên về swing trade, day trade và bán quyền chọn (sell put/sell call).

${contextText}
${liveDataText}

QUAN TRỌNG: Nếu có "DỮ LIỆU REAL-TIME" hoặc "TIN TỨC MỚI NHẤT" ở trên, hãy ưu tiên dùng thông tin đó vì nó vừa được lấy ngay lúc bạn trả lời — chính xác hơn kiến thức cũ của bạn.

Trả lời ngắn gọn, súc tích, thực tế bằng tiếng Việt. Nếu không có dữ liệu real-time cho mã được hỏi, hãy nói rõ bạn không có giá hiện tại và đề xuất người dùng phân tích mã đó trực tiếp trong app để có data mới nhất.`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
          { role: "user", content: message },
        ],
        temperature: 0.4,
        max_tokens: 600,
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Groq API error" }, { status: 500 });
    }

    const json = await res.json();
    const reply = json.choices?.[0]?.message?.content || "Xin lỗi, tôi không thể trả lời lúc này.";

    return NextResponse.json({ reply, usedLiveData: liveDataText.length > 0 });
  } catch (e) {
    return NextResponse.json({ error: "Failed to get AI response" }, { status: 500 });
  }
}