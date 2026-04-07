import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const authorization = req.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null

  const accessToken = authorization.slice('Bearer '.length).trim()
  if (!accessToken) return null

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(accessToken)

  if (error || !user) return null
  return user.id
}
