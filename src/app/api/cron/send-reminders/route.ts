import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dispatchPushNotifications } from '@/lib/push-utils'
import { REMINDER_TIME_ZONE } from '@/lib/reminders'

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

  // 1. 발송 대상을 임시 점유한다. 실제 발송 뒤에만 sent_at을 기록한다.
  const { data: reminders, error: rpcError } = await supabaseAdmin.rpc(
    'claim_due_reminders'
  )
  if (rpcError) {
    console.error('[send-reminders] rpc error:', rpcError)
    return NextResponse.json({ error: 'RPC failed' }, { status: 500 })
  }
  if (!reminders?.length) return NextResponse.json({ sent: 0 })

  // 2. 해당 family 구성원 조회
  const familyIds = [...new Set(reminders.map((r) => r.family_id))]
  const { data: members, error: membersError } = await supabaseAdmin
    .from('family_members')
    .select('user_id, family_id')
    .in('family_id', familyIds)

  if (membersError) {
    console.error('[send-reminders] family members error:', membersError)
    return NextResponse.json({ error: 'Family members failed' }, { status: 500 })
  }

  // 3. 구성원의 push 구독 조회
  const userIds = [...new Set((members ?? []).map((m) => m.user_id))]
  const { data: subs, error: subsError } = userIds.length
    ? await supabaseAdmin
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth, user_id')
        .in('user_id', userIds)
    : { data: [], error: null }

  if (subsError) {
    console.error('[send-reminders] push subscriptions error:', subsError)
    return NextResponse.json({ error: 'Push subscriptions failed' }, { status: 500 })
  }

  // family_id → user_ids 매핑
  const usersByFamily = new Map<string, string[]>()
  for (const m of members ?? []) {
    const arr = usersByFamily.get(m.family_id) ?? []
    arr.push(m.user_id)
    usersByFamily.set(m.family_id, arr)
  }

  // 4. 각 리마인더를 가족 구성원 전체에게 발송
  const results = await Promise.all(
    reminders.map(async (reminder) => {
      const memberUserIds = new Set(usersByFamily.get(reminder.family_id) ?? [])
      const familySubs = (subs ?? []).filter((s) => s.user_id && memberUserIds.has(s.user_id))
      if (familySubs.length === 0) {
        return { reminderId: reminder.reminder_id, sent: 0, removed: 0, acknowledge: true }
      }

      const payload = JSON.stringify({
        title: reminder.event_title,
        body: formatReminderBody(reminder.event_start, reminder.is_all_day),
        url: '/',
      })

      const { sent, removed, failed } = await dispatchPushNotifications(familySubs, payload)
      return {
        reminderId: reminder.reminder_id,
        sent,
        removed,
        acknowledge: sent > 0 || failed === 0,
      }
    })
  )

  const acknowledgedIds = results.filter((result) => result.acknowledge).map((result) => result.reminderId)
  if (acknowledgedIds.length > 0) {
    const { error: ackError } = await supabaseAdmin.rpc('acknowledge_reminders', {
      p_reminder_ids: acknowledgedIds,
    })
    if (ackError) {
      console.error('[send-reminders] acknowledge error:', ackError)
      return NextResponse.json({ error: 'Acknowledge failed' }, { status: 500 })
    }
  }

  return NextResponse.json({
    sent: results.reduce((sum, result) => sum + result.sent, 0),
    removed: results.reduce((sum, result) => sum + result.removed, 0),
    retry: results.length - acknowledgedIds.length,
  })
}
