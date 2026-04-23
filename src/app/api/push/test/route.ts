import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, isAppAdmin } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import webpush from '@/lib/webpush'

export async function POST(req: NextRequest) {
  const authUser = await getAuthenticatedUser(req)
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { userId } = await req.json()
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  if (userId !== authUser.id && !(await isAppAdmin(authUser.email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: subs, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (error || !subs?.length) {
    return NextResponse.json({ error: 'No subscriptions found' }, { status: 404 })
  }

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: 'Koko 알림 테스트', body: '알림이 정상적으로 동작합니다!' })
      )
    )
  )

  return NextResponse.json({ results: results.map((r) => r.status) })
}
