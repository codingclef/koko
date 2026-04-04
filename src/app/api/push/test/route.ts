import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import webpush from '@/lib/webpush'

export async function POST(req: NextRequest) {
  const { userId } = await req.json()
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
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
