import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/types/database'

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { userId } = await req.json()

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  // 이미 가족에 속해 있는지 확인 (여러 개면 가장 오래된 것 사용)
  const { data: memberships } = await supabaseAdmin
    .from('family_members')
    .select('family_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (memberships && memberships.length > 0) {
    return NextResponse.json({ familyId: memberships[0].family_id })
  }

  // 새 가족 생성 — family 먼저 insert
  const { data: family, error: familyError } = await supabaseAdmin
    .from('families')
    .insert({ name: 'Our Family' })
    .select('id')
    .single()

  if (familyError || !family) {
    console.error('[API /family] family insert error:', familyError)
    return NextResponse.json({ error: 'Failed to create family' }, { status: 500 })
  }

  // member insert — 이미 있으면(race condition) 무시하고 기존 행 반환
  const { error: memberError } = await supabaseAdmin
    .from('family_members')
    .insert({
      family_id: family.id,
      user_id: userId,
      display_name: 'Me',
      role: 'admin',
    })

  if (memberError) {
    // race condition으로 이미 member가 생성된 경우 → 기존 family 조회
    const { data: existing } = await supabaseAdmin
      .from('family_members')
      .select('family_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (existing) {
      return NextResponse.json({ familyId: existing.family_id })
    }

    console.error('[API /family] member insert error:', memberError)
    return NextResponse.json({ error: 'Failed to create family member' }, { status: 500 })
  }

  return NextResponse.json({ familyId: family.id })
}
