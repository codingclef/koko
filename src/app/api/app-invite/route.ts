import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, isAppAdmin } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

const INVITE_EXPIRY_DAYS = 7

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// GET /api/app-invite — 유효한 초대 목록 조회 (admin only)
export async function GET(req: NextRequest) {
  const authUser = await getAuthenticatedUser(req)
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!(await isAppAdmin(authUser.email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: invites, error } = await supabaseAdmin
    .from('app_invites')
    .select('id, code, created_at, expires_at, used_by_email, used_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[API /app-invite] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 })
  }

  return NextResponse.json({ invites })
}

// POST /api/app-invite — 새 앱 초대 생성 (admin only)
export async function POST(req: NextRequest) {
  const authUser = await getAuthenticatedUser(req)
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!(await isAppAdmin(authUser.email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS)

  // 충돌 없는 고유 코드 생성
  let code = generateCode()
  let attempts = 0
  while (attempts < 5) {
    const { data: existing } = await supabaseAdmin
      .from('app_invites')
      .select('id')
      .eq('code', code)
      .maybeSingle()
    if (!existing) break
    code = generateCode()
    attempts++
  }

  const { data: invite, error } = await supabaseAdmin
    .from('app_invites')
    .insert({
      code,
      created_by: authUser.id,
      expires_at: expiresAt.toISOString(),
    })
    .select('id, code, expires_at')
    .single()

  if (error || !invite) {
    console.error('[API /app-invite] POST error:', error)
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
  }

  return NextResponse.json({ invite }, { status: 201 })
}
