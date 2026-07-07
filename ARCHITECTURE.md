# Vien Tran Stock Advisor — Tài liệu kiến trúc & lịch sử quyết định

> **Mục đích file này:** đây là "bộ nhớ dự phòng" độc lập với Claude — nếu 1-2 năm sau cần sửa lại hệ thống, mất trí nhớ về lý do thiết kế, hoặc gặp lỗi không tự sửa được, hãy đọc file này trước khi bắt đầu. File này nằm trong repo, không phụ thuộc vào bất kỳ công cụ AI nào.

**Cập nhật lần cuối:** 07/07/2026
**Repo:** `tranluanvienus-pixel/stock-ai-app` (GitHub) — deploy qua Vercel tại `stock-ai-app-one.vercel.app`

---

## 1. Tổng quan hệ thống

Đây là ứng dụng cá nhân hỗ trợ ra quyết định đầu tư cổ phiếu Mỹ, gồm 2 phần chính:

1. **Stock Advisor** (nền tảng, xây dựng cuối tháng 6/2026): công cụ đánh giá 1 mã cổ phiếu bất kỳ, dùng 18 chỉ báo kỹ thuật + AI (Groq/Llama 3.3) để đưa ra khuyến nghị MUA/BÁN/SELL PUT/SELL CALL.
2. **AI Portfolio Advisor** (xây dựng đầu tháng 7/2026): hệ thống quản lý danh mục đầu tư dài hạn (định hướng 5 năm), tự động đánh giá lại các mã đang nắm giữ mỗi ngày, đề xuất mua thêm/chốt lời/bán hẳn/giữ nguyên, cân bằng lại tỷ trọng, và cảnh báo qua thông báo.

**Triết lý quan trọng cần nhớ:** hệ thống này được thiết kế cho **đầu tư swing/dài hạn** (horizon mặc định 5 năm), KHÔNG phải day trade. Điểm số thay đổi mỗi ngày là vì phần kỹ thuật (RSI, MACD...) tự nhiên biến động theo phiên, nhưng mục đích vẫn là "mã này còn xứng đáng nằm trong danh mục dài hạn không" chứ không phải "nên mua/bán trong vài phút tới". Day trade được xử lý riêng bằng Pine Script trên TradingView, không liên quan đến app này.

**Stack kỹ thuật:**
- Next.js/TypeScript, deploy trên Vercel (Hobby plan)
- Supabase (Postgres) làm database
- Nguồn dữ liệu: Yahoo Finance (giá lịch sử, miễn phí, không giới hạn rõ), Alpha Vantage (fundamentals, **giới hạn 25 request/ngày — đây là nút thắt cổ chai chính**), Polygon.io (giá real-time), Groq AI (Llama 3.3 70B, dùng dual-key fallback để tránh rate limit), CNN Fear & Greed Index
- `user_id` hardcode `"vien_default"` — không có hệ thống login, mọi thiết bị dùng chung 1 bộ dữ liệu

---

## 2. Các engine chính (trong thư mục `lib/`)

| Engine | File | Chức năng |
|---|---|---|
| Scoring Engine | `scoringEngine.ts` | Tính điểm tổng hợp 0-100 từ các subscore (valuation, growth_momentum, technical_trend...), xác định `portfolio_role` (core/expansion/discovery) |
| Market Regime | `marketRegime.ts` | Xác định BULLISH/BEARISH/NEUTRAL/HIGH_VOLATILITY dựa trên SPY EMA + VIX + CNN Fear & Greed |
| Portfolio Health | `portfolioHealth.ts` | Điểm sức khỏe danh mục: Quality 50%, Diversification 25% (Herfindahl Index), Confidence 15%, Regime Alignment 10% |
| Rebalance Engine | `rebalanceEngine.ts` | Đề xuất cân bằng lại (Water-Filling), phân loại BUY_MORE/SELL_PARTIAL/EXIT_FULLY/HOLD |
| Position Sizing | `positionSizing.ts` | Tính kích thước vị thế hợp lý |
| Watchlist Engine | `watchlistEngine.ts` | Phân loại mã theo dõi: MOMENTUM_PICK/VALUE_OPPORTUNITY/OVEREXTENDED_CAUTION/NEUTRAL |
| Recommendation Engine | `recommendationEngine.ts` | Ra khuyến nghị cuối: Mua thêm/Chốt lời/Bán hẳn/Theo dõi/Giữ nguyên |
| Reason Codes | `reasonCodes.ts` | Mã lý do định sẵn (không để AI tự bịa), Groq chỉ dịch sang câu văn tự nhiên |
| Explanation Layer | `explanationLayer.ts` | Gọi Groq (temperature 0.3, max_tokens 400) sinh giải thích: "Tại sao / Thay đổi gì / Còn phù hợp mục tiêu không" |

**Nguyên tắc thiết kế cốt lõi:** Penalty scoring thay vì hard filter cứng nhắc; ngưỡng điểm tối thiểu 55/100; "Do Nothing" là hành động mặc định (không ép phải làm gì đó mỗi lần đánh giá).

---

## 3. Schema Supabase (các bảng chính)

- `user_profile` — vốn đầu tư, phong cách đầu tư (aggressive/conservative...)
- `portfolio_holdings` — danh mục đang giữ: `symbol`, `shares`, `avg_cost`, `sector`, `entry_reason`
- `evaluation_history` — lịch sử đánh giá mỗi mã mỗi ngày: `eval_id`, `symbol`, `eval_date`, `price_at_eval`, `weight_at_eval`, `score_total`, `score_breakdown`, `confidence_score`, `reason_codes`, `recommendation`, `reasoning_text`, `previous_eval_id` (nối chuỗi lịch sử theo mã)
- `alerts_queue` — thông báo hàng ngày, có `seen` (đã đọc chưa)
- `watchlist` — danh sách mã đang theo dõi (chưa mua)
- `market_snapshot` — ảnh chụp trạng thái thị trường

**Lưu ý quan trọng:** `previous_eval_id` trong `evaluation_history` là chìa khóa để dựng lại "lịch sử phiên bản" của từng mã theo thời gian — đây là nền tảng cho Audit Log và Backtest Engine sau này. Đừng xóa cột này.

---

## 4. Luồng hoạt động hàng ngày (Cron)

- `vercel.json` cấu hình cron: `30 13 * * 1-5` (UTC) = 8:30 sáng thứ 2-6 giờ Texas (CDT mùa hè, lệch 1 giờ mùa đông)
- Route `/api/cron/daily-check` được gọi, bảo vệ bằng `CRON_SECRET` (đã cấu hình cả `.env.local` và Vercel Production)
- Với mỗi holding: gọi `/api/portfolio/evaluate?symbol=X` → ghi vào `evaluation_history` → tạo `alerts_queue`
- Có delay 500ms giữa mỗi symbol để tránh dồn dập rate limit

**Vercel Hobby plan lưu ý:** Runtime Logs trên web dashboard chỉ xem được trong khung "Last 30 minutes" miễn phí — muốn xem log cũ hơn phải dùng Vercel CLI (`vercel logs <domain>`), không mở rộng khung thời gian trên web vì sẽ tính phí.

---

## 5. Lịch sử sự cố quan trọng & cách đã khắc phục

### Sự cố: Vòng lặp gọi API dồn dập (phát hiện & sửa 07/07/2026)
**Triệu chứng:** Vercel Logs cho thấy `/api/analyze` và `/api/portfolio/evaluate` bị gọi liên tục hàng chục lần trong <2 giây, Groq Key #1 báo 429 liên tục (dual-key fallback vẫn cứu được, chưa gãy tính năng nhưng lãng phí quota).

**Root cause:** `app/api/portfolio/watchlist/route.ts` có 1 dòng dead code gọi `GET /api/analyze` (route này thực chất yêu cầu POST, nên GET luôn lỗi 405) chạy song song (`Promise.all`) với `/api/portfolio/evaluate` — mà bản thân route `evaluate` lại tự gọi `POST /api/analyze` bên trong nó qua HTTP nội bộ. Kết quả: mỗi symbol trong watchlist tốn 2-3 lần gọi `/api/analyze` dư thừa.

**Đã sửa:** xóa dòng gọi GET dư thừa. Commit: "fix: remove duplicate GET call to /api/analyze in watchlist route".

**Đã loại trừ khỏi nghi phạm:** Scanner (`app/api/scanner/route.ts`, quét 36 mã qua `Promise.all`) — dùng Yahoo Finance + Polygon trực tiếp, không đụng tới `/api/analyze` hay Groq.

**Vẫn còn tồn đọng (không phải bug, chỉ là điểm tối ưu tiềm năng):** kiến trúc hiện tại có route gọi route qua HTTP nội bộ (`evaluate` tự `fetch()` `/api/analyze` bên trong nó) thay vì gọi hàm trực tiếp trong cùng process. Không gây lỗi, nhưng nếu muốn tối ưu hơn (giảm độ trễ, giảm overhead HTTP), có thể cân nhắc gộp logic 2 route này lại.

### Sự cố: Rebalance engine tính sai mẫu số
**Root cause:** dùng giá trị danh mục hiện tại (đang co lại) làm mẫu số thay vì `profile.capital_usd` (tổng vốn cố định).
**Đã sửa:** dùng `totalCapitalUsd` cố định truyền qua `RebalanceInput`.

### Sự cố: Cron không tự chạy đúng lịch sáng 06/07/2026
**Trạng thái: CHƯA CHẨN ĐOÁN XONG** — cần vào Vercel → Cron Jobs → View Logs (hoặc `vercel logs`) để kiểm tra. Đây là việc còn tồn đọng, ưu tiên cao.

---

## 6. Quy trình làm việc đã thống nhất (khi sửa code cùng Claude)

1. **Additive-only** — không xóa/sửa trừ khi thay thế cụ thể một khối rõ ràng
2. Paste code dạng **text** (không phải ảnh chụp) khi cần xem/sửa file dài
3. Xác định chính xác vị trí bằng **Ctrl+F tìm cụm từ** → xác nhận số dòng qua thanh trạng thái VS Code (Shift+Click chọn vùng, xem "Ln X-Y")
4. Sau khi sửa: **Ctrl+S** → kiểm tra tab **Problems** (phải "No problems detected") → **Commit** (Source Control, Ctrl+Shift+G) → **Sync Changes** (push) → chờ Vercel Deploy "Ready" → test trên web thực tế
5. Alpha Vantage 25 request/ngày là giới hạn cứng, thường gây false-negative khi test — cần nhớ điều này khi debug lỗi có vẻ ngẫu nhiên

---

## 7. Việc còn tồn đọng / Roadmap (tính đến 07/07/2026)

**Đã hoàn tất:**
- ✅ Phase 1: Thông báo hàng ngày (cron, alerts_queue, UI Dashboard)
- ✅ Sửa vòng lặp gọi API dồn dập (watchlist route)
- ✅ Lãi/lỗ theo từng mã trong "Danh mục đang giữ" (dùng `price_at_eval`, không tốn quota real-time)
- ✅ Đổi màu cảnh báo cho "Tiền mặt chưa đầu tư" khi âm
- ✅ Đánh dấu đã đọc + xóa alert (đã có sẵn trong code Dashboard)

**Đang làm (07/07/2026):**
- 🔄 Audit Log — thêm cột `data_snapshot` (JSONB) vào `evaluation_history`, lưu toàn bộ raw indicators từ `/api/analyze` (đã có sẵn trong bộ nhớ khi `evaluate` gọi `analyze`, không tốn thêm request), + xây UI khối "Lịch sử đánh giá" trên Dashboard

**Chưa làm, theo thứ tự ưu tiên đã thống nhất:**
- ⬜ Chẩn đoán vì sao cron không chạy đúng lịch
- ⬜ Data Quality Score (theo dõi field thiếu/timeout từ Yahoo/Alpha Vantage/Groq, phản ánh vào Confidence Score)
- ⬜ Backtest Engine (CAGR, Max Drawdown, Sharpe, Win Rate, Turnover vs SPY — lưu ý: bị giới hạn bởi thiếu dữ liệu fundamental lịch sử point-in-time từ API free tier, nên có thể cần thu hẹp phạm vi chỉ backtest tín hiệu kỹ thuật, hoặc cân nhắc nguồn dữ liệu trả phí)
- ⬜ (Không khẩn cấp) Tối ưu kiến trúc: gộp logic `evaluate` + `analyze` thay vì gọi qua HTTP nội bộ

---

## 8. Nếu gặp lỗi không tự sửa được — checklist trước khi hoảng loạn

1. Kiểm tra Vercel Deployments — có deploy nào bị "Error" gần đây không?
2. Kiểm tra Vercel Logs (`vercel logs stock-ai-app-one.vercel.app`) — tìm dòng `error` gần thời điểm xảy ra sự cố
3. Kiểm tra quota Alpha Vantage — nhiều lỗi "ngẫu nhiên" thực chất là do hết 25 request/ngày
4. Xem lại Git commit history — mọi thay đổi đều có message rõ ràng, có thể revert về commit trước nếu cần (`git revert` hoặc rollback trên Vercel Deployments)
5. Đọc lại file này (`ARCHITECTURE.md`) để nhớ lại thiết kế tổng thể trước khi sửa bừa
