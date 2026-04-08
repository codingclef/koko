import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { name } = await req.json() as { name?: string }
  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const { data: familyId, error } = await supabaseAdmin.rpc('create_family_with_name', {
    p_user_id: userId,
    p_name: name.trim(),
  })

  if (error || !familyId) {
    console.error('[API /family/create] create_family_with_name error:', error)
    return NextResponse.json({ error: 'Failed to create family' }, { status: 500 })
  }

  return NextResponse.json({ familyId })
}
