export const maxDuration = 30;
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

export async function POST(req: Request) {
  const { message, context, history } = await req.json();

  if (!GROQ_API_KEY) {
    return NextResponse.json({ error: "Groq API key not configured" }, { status: 500 });
  }

  // Xây dựng context từ mã đang phân tích (nếu có)
  let contextText = "";
  if (context) {
    contextText = `
THÔNG TIN MÃ ĐANG PHÂN TÍCH (${context.symbol}):
- Công ty: ${context.companyName || "N/A"} | Ngành: ${context.sector || "N/A"}
- Giá hiện tại: $${context.price}
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

Trả lời ngắn gọn, súc tích, thực tế bằng tiếng Việt. Dùng kiến thức tài chính chuyên sâu. Nếu người dùng hỏi về mã cổ phiếu đang phân tích ở trên, hãy dùng dữ liệu đó để trả lời chính xác. Nếu không có đủ thông tin để trả lời chắc chắn, hãy nói rõ và đề xuất cách kiểm tra thêm.`;

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

    return NextResponse.json({ reply });
  } catch (e) {
    return NextResponse.json({ error: "Failed to get AI response" }, { status: 500 });
  }
}