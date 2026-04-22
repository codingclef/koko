import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dispatchPushNotifications } from '@/lib/push-utils'

const REMINDER_TIME_ZONE = 'Asia/Tokyo'

export function formatReminderBody(eventStart: string, isAllDay: boolean): string {
  const d = new Date(eventStart)
  const dateStr = d.toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    timeZone: REMINDER_TIME_ZONE,
  })

  if (isAllDay) return `${dateStr} 종일 일정이 있습니다`

  const timeStr = d.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: REMINDER_TIME_ZONE,
  })
  return `${dateStr} ${timeStr} 일정이 있습니다`
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

  // 4. 각 리마인더를 가족 구성원 전체에게 발송
  let totalSent = 0
  let totalRemoved = 0

  await Promise.all(
    reminders.map(async (reminder) => {
      const memberUserIds = new Set(usersByFamily.get(reminder.family_id) ?? [])
      const familySubs = subs.filter((s) => s.user_id && memberUserIds.has(s.user_id))
      const payload = JSON.stringify({
        title: reminder.event_title,
        body: formatReminderBody(reminder.event_start, reminder.is_all_day),
        url: '/',
      })

      const { sent, removed } = await dispatchPushNotifications(familySubs, payload)
      totalSent += sent
      totalRemoved += removed
    })
  )

  return NextResponse.json({ sent: totalSent, removed: totalRemoved })
}
