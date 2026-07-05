// ============================================================
// EXPLANATION LAYER
// Groq CHỈ dịch reason_codes đã dịch nghĩa sẵn thành văn tự nhiên,
// KHÔNG được tự đưa ra điểm số hay lý do ngoài danh sách được cung cấp
// ============================================================

const GROQ_API_KEY = process.env.GROQ_API_KEY || ''
const GROQ_API_KEY_2 = process.env.GROQ_API_KEY_2 || ''
const GROQ_KEYS = [GROQ_API_KEY, GROQ_API_KEY_2].filter(Boolean)

export type ExplanationInput = {
  symbol: string
  recommendation: string
  score_total: number
  confidence_score: number
  reason_texts: string[] // đã dịch sẵn từ reasonCodes.ts, KHÔNG phải mã thô
  horizon: string
  investor_type: string
  previous_score_total?: number | null
  previous_weight_pct?: number | null
}

export type ExplanationResult = {
  why: string
  what_changed: string
  still_fits_goal: string
}

export async function generateExplanation(input: ExplanationInput): Promise<ExplanationResult | null> {
  if (GROQ_KEYS.length === 0) return null

  const changeContext =
    input.previous_score_total != null
      ? `Lần đánh giá trước điểm là ${input.previous_score_total}, tỷ trọng ${input.previous_weight_pct ?? 0}%.`
      : 'Đây là lần đánh giá đầu tiên cho mã này, chưa có dữ liệu so sánh.'

  const prompt = `Bạn là trợ lý dịch lý do đầu tư thành văn tự nhiên. Bạn KHÔNG được tự nghĩ ra lý do nào ngoài danh sách được cung cấp dưới đây, không được tự đưa ra điểm số hay khuyến nghị khác.

Mã: ${input.symbol}
Khuyến nghị: ${input.recommendation}
Điểm tổng: ${input.score_total}/100
Độ tin cậy: ${input.confidence_score}/100
Mục tiêu người dùng: ${input.horizon}, loại nhà đầu tư ${input.investor_type}
${changeContext}

Danh sách lý do (chỉ được dùng đúng các lý do này, không thêm bớt):
${input.reason_texts.map((r) => '- ' + r).join('\n')}

Viết 3 đoạn ngắn (1-2 câu mỗi đoạn), giọng văn tiếng Việt tự nhiên, dễ hiểu, không dùng thuật ngữ khó:
1) why: Tại sao khuyến nghị này được đưa ra
2) what_changed: Điều gì đã thay đổi so với lần đánh giá trước
3) still_fits_goal: Khuyến nghị có còn phù hợp với mục tiêu của người dùng không

Trả lời CHỈ bằng JSON thuần túy, không markdown, đúng định dạng:
{"why": "...", "what_changed": "...", "still_fits_goal": "..."}`

  for (let i = 0; i < GROQ_KEYS.length; i++) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEYS[i]}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'Chỉ trả lời JSON thuần túy, không markdown, không giải thích thêm.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 400,
          response_format: { type: 'json_object' },
        }),
      })

      if (res.status === 429) continue // key này bị rate limit, thử key kế tiếp
      if (!res.ok) continue

      const json = await res.json()
      let text = (json.choices?.[0]?.message?.content || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const parsed = JSON.parse(text)
      return {
        why: parsed.why || '',
        what_changed: parsed.what_changed || '',
        still_fits_goal: parsed.still_fits_goal || '',
      }
    } catch {
      continue
    }
  }

  return null
}