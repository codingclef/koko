import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const authUser = await getAuthenticatedUser(req)
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [{ data: familyId }, { data: emailRecord }] = await Promise.all([
    supabaseAdmin.rpc('get_my_family', { p_user_id: authUser.id }),
    supabaseAdmin
      .from('allowed_emails')
      .select('app_role')
      .eq('email', authUser.email.toLowerCase())
      .maybeSingle(),
  ])

  return NextResponse.json({
    familyId: familyId ?? null,
    appRole: emailRecord?.app_role ?? 'member',
  })
}
