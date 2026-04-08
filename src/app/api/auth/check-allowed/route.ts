import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const { email, inviteCode, appInviteCode } = await req.json() as {
    email?: string
    inviteCode?: string
    appInviteCode?: string
  }

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
    return NextResponse.json({ allowed: true, needsOnboarding: false })
  }

  // 2. 앱 초대 코드로 진입한 경우 → DB 함수로 원자 소비 (동시 요청 방지)
  if (appInviteCode) {
    const { data: consumed, error: rpcError } = await supabaseAdmin.rpc('consume_app_invite', {
      p_code: appInviteCode,
      p_email: normalizedEmail,
    })

    if (rpcError) {
      console.error('[check-allowed] consume_app_invite error:', rpcError)
      return NextResponse.json({ error: 'DB error', allowed: false }, { status: 500 })
    }

    if (consumed) {
      return NextResponse.json({ allowed: true, needsOnboarding: true })
    }
  }

  // 3. 가족 초대 코드로 진입한 경우 → allowed_emails에 추가 후 허용 (가족 합류는 /join 페이지에서)
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

      return NextResponse.json({ allowed: true, needsOnboarding: false })
    }
  }

  return NextResponse.json({ allowed: false })
}
