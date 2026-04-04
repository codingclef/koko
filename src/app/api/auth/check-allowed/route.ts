import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const { email, inviteCode } = await req.json()

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  const normalizedEmail = email.toLowerCase()

  // 1. allowed_emails 테이블에 있으면 바로 허용
  const { data: existing, error: dbError } = await supabaseAdmin
    .from('allowed_emails')
    .select('email')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (dbError) {
    console.error('[check-allowed] DB error:', dbError)
    return NextResponse.json({ error: 'DB error', allowed: false }, { status: 500 })
  }

  if (existing) {
    return NextResponse.json({ allowed: true })
  }

  // 2. 유효한 초대 코드로 들어온 경우 → allowed_emails에 추가 후 허용
  if (inviteCode) {
    const { data: family } = await supabaseAdmin
      .from('families')
      .select('id')
      .ilike('invite_code', inviteCode)
      .maybeSingle()

    if (family) {
      await supabaseAdmin
        .from('allowed_emails')
        .insert({ email: normalizedEmail })

      return NextResponse.json({ allowed: true })
    }
  }

  return NextResponse.json({ allowed: false })
}
