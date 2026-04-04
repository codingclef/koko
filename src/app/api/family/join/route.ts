import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const { userId, inviteCode, displayName } = await req.json()

  if (!userId || !inviteCode) {
    return NextResponse.json({ error: 'userId and inviteCode are required' }, { status: 400 })
  }

  // 초대 코드로 family 조회
  const { data: family } = await supabaseAdmin
    .from('families')
    .select('id')
    .ilike('invite_code', inviteCode)
    .maybeSingle()

  if (!family) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 })
  }

  // 이미 이 family 구성원인지 확인
  const { data: existing } = await supabaseAdmin
    .from('family_members')
    .select('family_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing?.family_id === family.id) {
    return NextResponse.json({ familyId: family.id })
  }

  // 기존 family에서 나가고 새 family에 합류
  if (existing) {
    await supabaseAdmin.from('family_members').delete().eq('user_id', userId)
  }

  const { error } = await supabaseAdmin.from('family_members').insert({
    family_id: family.id,
    user_id: userId,
    display_name: displayName?.trim() || 'Member',
    role: 'member',
  })

  if (error) {
    return NextResponse.json({ error: 'Failed to join family' }, { status: 500 })
  }

  return NextResponse.json({ familyId: family.id })
}
