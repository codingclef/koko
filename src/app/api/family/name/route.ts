import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function PATCH(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { familyId, name } = await req.json() as { familyId?: string; name?: string }
  if (!familyId || !name?.trim()) {
    return NextResponse.json({ error: 'familyId and name are required' }, { status: 400 })
  }

  // 요청자가 해당 가족의 멤버인지 확인
  const { data: membership } = await supabaseAdmin
    .from('family_members')
    .select('id')
    .eq('family_id', familyId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from('families')
    .update({ name: name.trim() })
    .eq('id', familyId)

  if (error) {
    console.error('[API /family/name] update error:', error)
    return NextResponse.json({ error: 'Failed to update family name' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
