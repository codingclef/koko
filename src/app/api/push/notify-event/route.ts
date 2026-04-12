import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dispatchPushNotifications } from '@/lib/push-utils'

export type EventAction = 'created' | 'updated' | 'deleted'

export interface NotifyEventRequest {
  action: EventAction
  title: string
  startAt: string
  familyId: string
  calendarId: string | null
}

export async function POST(req: NextRequest) {
  const actorUserId = await getAuthenticatedUserId(req)
  if (!actorUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { action, title, startAt, familyId, calendarId } =
    (await req.json()) as NotifyEventRequest

  if (!action || !title || !familyId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // 알림 대상 조회 + 멤버십 검증 (actor 포함해서 전체 조회 후 필터)
  let allUserIds: string[]

  if (calendarId) {
    const { data } = await supabaseAdmin
      .from('calendar_members')
      .select('user_id')
      .eq('calendar_id', calendarId)
    allUserIds = (data ?? []).map((m) => m.user_id)
  } else {
    const { data } = await supabaseAdmin
      .from('family_members')
      .select('user_id')
      .eq('family_id', familyId)
    allUserIds = (data ?? []).map((m) => m.user_id)
  }

  if (!allUserIds.includes(actorUserId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const targetUserIds = allUserIds.filter((id) => id !== actorUserId)
  if (targetUserIds.length === 0) return NextResponse.json({ sent: 0 })

  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, user_id')
    .in('user_id', targetUserIds)

  if (!subs?.length) return NextResponse.json({ sent: 0 })

  const payload = JSON.stringify({
    title: buildTitle(action),
    body: buildBody(action, title, startAt),
    url: '/',
  })

  const result = await dispatchPushNotifications(subs, payload)
  return NextResponse.json(result)
}

function buildTitle(action: EventAction): string {
  if (action === 'created') return '새 일정이 추가됐어요'
  if (action === 'updated') return '일정이 변경됐어요'
  return '일정이 삭제됐어요'
}

function buildBody(action: EventAction, title: string, startAt: string): string {
  if (action === 'deleted') return title
  const d = new Date(startAt)
  const dateStr = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
  return `${title} · ${dateStr}`
}
