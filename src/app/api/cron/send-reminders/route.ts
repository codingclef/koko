import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import type { Database } from '@/types/database'

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

webpush.setVapidDetails(
  'mailto:koko@family.app',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

function formatReminderBody(eventStart: string): string {
  const d = new Date(eventStart)
  return `${d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} ${d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 일정이 있습니다`
}

export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. 발송 대상 리마인더를 원자적으로 조회 + sent_at 마킹 (중복 방지)
  const { data: reminders, error: rpcError } = await supabaseAdmin.rpc(
    'get_and_mark_due_reminders'
  )
  if (rpcError) {
    console.error('[send-reminders] rpc error:', rpcError)
    return NextResponse.json({ error: 'RPC failed' }, { status: 500 })
  }
  if (!reminders?.length) return NextResponse.json({ sent: 0 })

  // 2. 해당 family 구성원 조회
  const familyIds = [...new Set(reminders.map((r) => r.family_id))]
  const { data: members } = await supabaseAdmin
    .from('family_members')
    .select('user_id, family_id')
    .in('family_id', familyIds)

  if (!members?.length) return NextResponse.json({ sent: 0 })

  // 3. 구성원의 push 구독 조회
  const userIds = [...new Set(members.map((m) => m.user_id))]
  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, user_id')
    .in('user_id', userIds)

  if (!subs?.length) return NextResponse.json({ sent: 0 })

  // family_id → user_ids 매핑
  const usersByFamily = new Map<string, string[]>()
  for (const m of members) {
    const arr = usersByFamily.get(m.family_id) ?? []
    arr.push(m.user_id)
    usersByFamily.set(m.family_id, arr)
  }

  const successIds: string[] = []
  const staleIds: string[] = []

  // 4. 각 리마인더를 가족 구성원 전체에게 발송
  await Promise.all(
    reminders.map(async (reminder) => {
      const memberUserIds = usersByFamily.get(reminder.family_id) ?? []
      const familySubs = subs.filter((s) => s.user_id && memberUserIds.includes(s.user_id))
      const payload = JSON.stringify({
        title: reminder.event_title,
        body: formatReminderBody(reminder.event_start),
        url: '/',
      })

      await Promise.all(
        familySubs.map(async (sub) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload
            )
            successIds.push(sub.id)
          } catch (err: unknown) {
            const status = (err as { statusCode?: number }).statusCode
            if (status === 404 || status === 410) {
              staleIds.push(sub.id)
            }
          }
        })
      )
    })
  )

  // 5. last_used_at 갱신 + 만료 구독 삭제
  await Promise.all([
    successIds.length
      ? supabaseAdmin
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .in('id', successIds)
      : Promise.resolve(),
    staleIds.length
      ? supabaseAdmin.from('push_subscriptions').delete().in('id', staleIds)
      : Promise.resolve(),
  ])

  return NextResponse.json({ sent: successIds.length, removed: staleIds.length })
}
