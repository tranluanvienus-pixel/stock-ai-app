import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!

// Dùng ở phía client/trình duyệt (quyền hạn chế, tôn trọng RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Dùng ở phía server/API route (toàn quyền, bỏ qua RLS) — KHÔNG BAO GIỜ import file này vào code chạy ở trình duyệt
export const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey)