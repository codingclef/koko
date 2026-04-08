import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const authUser = await getAuthenticatedUser(req)
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [{ data: familyId, error: familyError }, { data: emailRecord }] = await Promise.all([
    supabaseAdmin.rpc('get_my_family', { p_user_id: authUser.id }),
    supabaseAdmin
      .from('allowed_emails')
      .select('app_role')
      .eq('email', authUser.email.toLowerCase())
      .maybeSingle(),
  ])

  if (familyError) {
    console.error('[API /family/me] get_my_family error:', familyError)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  return NextResponse.json({
    familyId: familyId ?? null,
    appRole: emailRecord?.app_role ?? 'member',
  })
}
