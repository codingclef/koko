import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

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

export async function getAllowedAppRole(email: string): Promise<'admin' | 'member' | null> {
  const record = await getAllowedEmailRecord(email)
  if (!record) return null
  return record.app_role === 'admin' ? 'admin' : 'member'
}

export async function isAppAdmin(email: string): Promise<boolean> {
  return await getAllowedAppRole(email) === 'admin'
}

export async function getAuthenticatedSessionUser(
  req: NextRequest
): Promise<{ id: string; email: string; appRole: 'admin' | 'member' | null; familyId: string | null } | null> {
  const authorization = req.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null

  const accessToken = authorization.slice('Bearer '.length).trim()
  if (!accessToken) return null

  // Validate the JWT locally, then check live account/access state in one DB request.
  const { data, error } = await supabaseAdmin.auth.getClaims(accessToken)

  if (error || !data?.claims) return null
  const { sub: id, email } = data.claims as { sub?: string; email?: string }
  if (!id || !email) return null
  const { data: access, error: accessError } = await supabaseAdmin.rpc('get_app_access', { p_user_id: id })
  if (accessError) {
    console.error('[api-auth] live access lookup failed:', accessError)
    throw new Error('Live access lookup failed')
  }
  if (!access) return null
  const record = access as { email: string; app_role: string | null; family_id: string | null }
  if (!record.email) return null
  return {
    id,
    email: record.email,
    appRole: record.app_role === 'admin' ? 'admin' : record.app_role === 'member' ? 'member' : null,
    familyId: record.family_id,
  }
}

export async function getAuthenticatedUser(
  req: NextRequest
): Promise<{ id: string; email: string } | null> {
  const user = await getAuthenticatedSessionUser(req)
  if (!user) return null

  return user.appRole ? { id: user.id, email: user.email } : null
}
