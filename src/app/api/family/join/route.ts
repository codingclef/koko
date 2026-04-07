import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { inviteCode, displayName } = await req.json()

  if (!inviteCode) {
    return NextResponse.json({ error: 'inviteCode is required' }, { status: 400 })
  }

  const { data: familyId, error } = await supabaseAdmin.rpc('join_family_by_invite_code', {
    p_user_id: userId,
    p_invite_code: inviteCode,
    p_display_name: displayName?.trim() || null,
  })

  if (error) {
    console.error('[API /family/join] join_family_by_invite_code error:', error)
    return NextResponse.json({ error: 'Failed to join family' }, { status: 500 })
  }

  if (!familyId) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 })
  }

  return NextResponse.json({ familyId })
}
