import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const { userId } = await req.json()

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  // DB 함수로 원자적 처리 — race condition 방지
  const { data: familyId, error } = await supabaseAdmin.rpc('get_or_create_family', {
    p_user_id: userId,
  })

  if (error || !familyId) {
    console.error('[API /family] get_or_create_family error:', error)
    return NextResponse.json({ error: 'Failed to get or create family' }, { status: 500 })
  }

  return NextResponse.json({ familyId })
}
