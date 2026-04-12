import { supabaseAdmin } from '@/lib/supabase-admin'
import webpush from '@/lib/webpush'

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
