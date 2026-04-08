import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

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

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(accessToken)

  if (error || !user?.email) return null
  return { id: user.id, email: user.email }
}
