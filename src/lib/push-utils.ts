import { supabaseAdmin } from '@/lib/supabase-admin'
import webpush from '@/lib/webpush'
import type { EventAction } from '@/types/push'

type PushSub = { id: string; endpoint: string; p256dh: string; auth: string }

/** push 구독 목록에 payload를 발송하고 만료 구독을 정리한다. */
export async function dispatchPushNotifications(
  subs: PushSub[],
  payload: string
): Promise<{ sent: number; removed: number }> {
  const successIds: string[] = []
  const staleIds: string[] = []

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
        successIds.push(sub.id)
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) staleIds.push(sub.id)
      }
    })
  )

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

  return { sent: successIds.length, removed: staleIds.length }
}

export interface EventNotificationParams {
  familyId: string
  calendarId: string | null
  actorUserId: string
  action: EventAction
  eventTitle: string
  eventStartAt: string
}

/**
 * 이벤트 action에 따라 가족/캘린더 멤버에게 푸시 알림을 발송한다.
 * actor 본인은 제외된다.
 */
export async function sendEventNotification(params: EventNotificationParams): Promise<void> {
  const { familyId, calendarId, actorUserId, action, eventTitle, eventStartAt } = params

  let targetUserIds: string[]

  if (calendarId) {
    const { data: members } = await supabaseAdmin
      .from('calendar_members')
      .select('user_id')
      .eq('calendar_id', calendarId)
      .neq('user_id', actorUserId)
    targetUserIds = (members ?? []).map((m) => m.user_id)
  } else {
    const { data: members } = await supabaseAdmin
      .from('family_members')
      .select('user_id')
      .eq('family_id', familyId)
      .neq('user_id', actorUserId)
    targetUserIds = (members ?? []).map((m) => m.user_id)
  }

  if (targetUserIds.length === 0) return

  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', targetUserIds)

  if (!subs?.length) return

  const payload = JSON.stringify({
    title: buildEventNotificationTitle(action),
    body: buildEventNotificationBody(action, eventTitle, eventStartAt),
    url: '/',
  })

  await dispatchPushNotifications(subs, payload)
}

export function fireEventNotification(params: EventNotificationParams): void {
  void sendEventNotification(params).catch((err) =>
    console.error('[push-utils] sendEventNotification failed:', err)
  )
}

function buildEventNotificationTitle(action: EventAction): string {
  if (action === 'created') return '새 일정이 추가됐어요'
  if (action === 'updated') return '일정이 변경됐어요'
  return '일정이 삭제됐어요'
}

function buildEventNotificationBody(action: EventAction, title: string, startAt: string): string {
  if (action === 'deleted') return title
  const d = new Date(startAt)
  const dateStr = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
  return `${title} · ${dateStr}`
}
