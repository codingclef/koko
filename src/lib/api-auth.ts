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

export async function isAppAdmin(email: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('allowed_emails')
    .select('app_role')
    .eq('email', email.toLowerCase())
    .maybeSingle()
  return data?.app_role === 'admin'
}

export async function getAuthenticatedUser(
  req: NextRequest
): Promise<{ id: string; email: string } | null> {
  const authorization = req.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null

  const accessToken = authorization.slice('Bearer '.length).trim()
  if (!accessToken) return null

  const { data, error } = await supabaseAdmin.auth.getClaims(accessToken)

  if (error || !data?.claims) return null
  const { sub: id, email } = data.claims as { sub?: string; email?: string }
  if (!id || !email) return null
  return { id, email }
}
