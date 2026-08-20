import { NextRequest, NextResponse } from 'next/server'
import { getAllowedAppRole, getAuthenticatedSessionUser } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const authUser = await getAuthenticatedSessionUser(req)
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let familyResult: Awaited<ReturnType<typeof supabaseAdmin.rpc>>
  let appRole: 'admin' | 'member' | null

  try {
    ;[familyResult, appRole] = await Promise.all([
      supabaseAdmin.rpc('get_my_family', { p_user_id: authUser.id }),
      getAllowedAppRole(authUser.email),
    ])
  } catch (error) {
    console.error('[API /family/me] bootstrap lookup failed:', error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  if (!appRole) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: familyId, error: familyError } = familyResult

  if (familyError) {
    console.error('[API /family/me] get_my_family error:', familyError)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  return NextResponse.json({
    familyId: familyId ?? null,
    appRole,
  })
}
