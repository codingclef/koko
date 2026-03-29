import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // OAuth 코드 교환은 /auth/callback 페이지에서만 수행
    // 자동 교환을 끄지 않으면 Supabase가 먼저 교환해버려서 이메일 체크를 우회함
    detectSessionInUrl: false,
  },
})
