import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedSessionUser } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedSessionUser(req)
    if (!user?.appRole) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ familyId: user.familyId ?? null, appRole: user.appRole })
  } catch (error) {
    console.error('[API /family/me] bootstrap lookup failed:', error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}
