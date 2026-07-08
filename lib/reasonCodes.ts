// ============================================================
// TỪ ĐIỂN REASON CODES
// Groq chỉ được dịch đúng các mã này, không tự bịa lý do ngoài danh sách
// ============================================================

export const REASON_CODE_MEANINGS: Record<string, string> = {
  // Từ Scoring Engine
  VAL01: 'Định giá hấp dẫn hơn so với trung bình',
  VAL02: 'Định giá đã khá cao so với lịch sử',
  MOM03: 'Động lượng giá đang cải thiện',
  MOM04: 'Động lượng giá đang suy yếu',
  CAT01: 'Có catalyst lớn sắp tới (tin tức, sản phẩm mới, sự kiện)',
  GRW01: 'Tăng trưởng doanh thu mạnh',
  FLOW01: 'Dòng tiền tổ chức đang vào mạnh',

  // Từ Recommendation Engine
  SCORE_GOOD: 'Điểm tổng thể đủ tốt để cân nhắc mua',
  SCORE_INSUFFICIENT: 'Điểm tổng thể chưa đủ thuyết phục để mua mới lúc này',
  SCORE_LOW_BUT_SELL_DISABLED: 'Điểm số đã giảm, nhưng bạn đã tắt tùy chọn cho AI đề xuất bán',
  RISK01: 'Tỷ trọng hoặc mức rủi ro đã vượt giới hạn cho phép',
  CAP_REACHED: 'Đã đạt tỷ trọng tối đa cho phép, dù cơ hội vẫn còn tốt',
  NO_SIGNIFICANT_CHANGE: 'Không có thay đổi đáng kể so với lần đánh giá gần nhất',
  LOW_CONFIDENCE_OR_INCOMPLETE_DATA: 'Dữ liệu chưa đầy đủ hoặc độ tin cậy thấp — tạm thời chưa đưa ra khuyến nghị mua/bán, đề nghị theo dõi thêm',
}

export function translateReasonCodes(codes: string[]): string[] {
  return codes.map((c) => REASON_CODE_MEANINGS[c] || c)
}