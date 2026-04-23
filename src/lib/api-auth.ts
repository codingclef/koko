import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function isFamilyMember(familyId: string, userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('family_members')
    .select('user_id')
    .eq('family_id', familyId)
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}

export async function assertCalendarWriteAccess(
  familyId: string,
  calendarId: string,
  userId: string
): Promise<boolean> {
  const [{ data: calendar }, { data: membership }] = await Promise.all([
    supabaseAdmin.from('calendars').select('id').eq('id', calendarId).eq('family_id', familyId).maybeSingle(),
    supabaseAdmin.from('calendar_members').select('user_id').eq('calendar_id', calendarId).eq('user_id', userId).maybeSingle(),
  ])
  return !!calendar && !!membership
}

export async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const user = await getAuthenticatedUser(req)
  return user?.id ?? null
}

async function getAllowedEmailRecord(email: string): Promise<{ app_role: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('allowed_emails')
    .select('app_role')
    .eq('email', email.toLowerCase())
    .maybeSingle()

  if (error) {
    console.error('[api-auth] allowed email lookup failed:', error)
    throw new Error('Allowed email lookup failed')
  }

  return data
}

export async function isAppAdmin(email: string): Promise<boolean> {
  const record = await getAllowedEmailRecord(email)
  return record?.app_role === 'admin'
}

export async function getAuthenticatedSessionUser(
  req: NextRequest
): Promise<{ id: string; email: string } | null> {
  const authorization = req.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null

  const accessToken = authorization.slice('Bearer '.length).trim()
  if (!accessToken) return null

  // getClaims()는 로컬 JWT 검증으로 Auth 서버 왕복을 생략한다.
  // 삭제/비활성화 사용자 반영이 토큰 만료 시점까지 지연될 수 있으나,
  // 이 앱의 위협 모델과 짧은 JWT 만료 주기를 고려해 허용된 트레이드오프다.
  const { data, error } = await supabaseAdmin.auth.getClaims(accessToken)

  if (error || !data?.claims) return null
  const { sub: id, email } = data.claims as { sub?: string; email?: string }
  if (!id || !email) return null
  return { id, email }
}

export async function getAuthenticatedUser(
  req: NextRequest
): Promise<{ id: string; email: string } | null> {
  const user = await getAuthenticatedSessionUser(req)
  if (!user) return null

  const allowedEmail = await getAllowedEmailRecord(user.email)
  if (!allowedEmail) return null

  return user
}
