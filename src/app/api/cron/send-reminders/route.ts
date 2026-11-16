import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dispatchPushNotifications } from '@/lib/push-utils'
import { REMINDER_TIME_ZONE } from '@/lib/reminders'
import { isAuthorizedCronRequest } from '@/lib/cron-auth'

function formatReminderBody(eventStart: string, isAllDay: boolean): string {
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
  if (!isAuthorizedCronRequest(req)) {
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

  const familyIds = [...new Set(reminders.filter((r) => !r.calendar_id).map((r) => r.family_id))]
  const calendarIds = [...new Set(reminders.flatMap((r) => r.calendar_id ? [r.calendar_id] : []))]
  const [familyResult, calendarResult] = await Promise.all([
    familyIds.length
      ? supabaseAdmin.from('family_members').select('user_id, family_id').in('family_id', familyIds)
      : { data: [], error: null },
    calendarIds.length
      ? supabaseAdmin.from('calendar_members').select('user_id, calendar_id').in('calendar_id', calendarIds)
      : { data: [], error: null },
  ])

  if (familyResult.error || calendarResult.error) {
    console.error('[send-reminders] recipient lookup error:', familyResult.error ?? calendarResult.error)
    return NextResponse.json({ error: familyResult.error ? 'Family members failed' : 'Calendar members failed' }, { status: 500 })
  }

  const usersByScope = new Map<string, Set<string>>()
  for (const member of [...(familyResult.data ?? []), ...(calendarResult.data ?? [])]) {
    const key = 'calendar_id' in member ? `calendar:${member.calendar_id}` : `family:${member.family_id}`
    const users = usersByScope.get(key) ?? new Set<string>()
    users.add(member.user_id)
    usersByScope.set(key, users)
  }
  const userIds = [...new Set([...usersByScope.values()].flatMap((users) => [...users]))]
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

  // One claim token covers all rules due at the same time on one occurrence.
  const claims = new Map<string, typeof reminders>()
  for (const reminder of reminders) {
    const key = reminder.claim_token ?? reminder.reminder_id
    const group = claims.get(key) ?? []
    group.push(reminder)
    claims.set(key, group)
  }

  const results = await Promise.all(
    [...claims.values()].map(async ([reminder, ...siblings]) => {
      const key = reminder.calendar_id ? `calendar:${reminder.calendar_id}` : `family:${reminder.family_id}`
      const memberUserIds = usersByScope.get(key)
      const recipientSubs = (subs ?? []).filter((s) => s.user_id && memberUserIds?.has(s.user_id))
      const ids = [reminder, ...siblings].map((row) => row.reminder_id)
      const token = reminder.claim_token
      if (recipientSubs.length === 0) {
        return { ids, token, sent: 0, removed: 0, acknowledge: true }
      }

      const payload = JSON.stringify({
        title: reminder.event_title,
        body: formatReminderBody(reminder.event_start, reminder.is_all_day),
        url: '/',
      })

      const { sent, removed, failed } = await dispatchPushNotifications(recipientSubs, payload)
      return {
        ids,
        token,
        sent,
        removed,
        acknowledge: sent > 0 || failed === 0,
      }
    })
  )

  const acknowledged = results.filter((result) => result.acknowledge)
  const acknowledgedIds = acknowledged.flatMap((result) => result.ids)
  const claimTokens = acknowledged.flatMap((result) => result.token ? [result.token] : [])
  if (acknowledgedIds.length > 0) {
    const { error: ackError } = await supabaseAdmin.rpc('acknowledge_reminders', {
      p_reminder_ids: acknowledgedIds,
      ...(claimTokens.length ? { p_claim_tokens: claimTokens } : {}),
    })
    if (ackError) {
      console.error('[send-reminders] acknowledge error:', ackError)
      return NextResponse.json({ error: 'Acknowledge failed' }, { status: 500 })
    }
  }

  return NextResponse.json({
    sent: results.reduce((sum, result) => sum + result.sent, 0),
    removed: results.reduce((sum, result) => sum + result.removed, 0),
    retry: results.length - acknowledged.length,
  })
}
