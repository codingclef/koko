import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dispatchPushNotifications } from '@/lib/push-utils'
import type { EventAction } from '@/types/push'

interface NotifyEventRequest {
  action: EventAction
  eventId: string
}

export async function POST(req: NextRequest) {
  const actorUserId = await getAuthenticatedUserId(req)
  if (!actorUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { action, eventId } = (await req.json()) as NotifyEventRequest

  if (!action || !eventId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // 이벤트를 DB에서 직접 조회해 payload를 구성 (클라이언트 데이터 비신뢰)
  const { data: event } = await supabaseAdmin
    .from('events')
    .select('id, title, start_at, calendar_id, family_id')
    .eq('id', eventId)
    .maybeSingle()

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  // actor가 해당 가족 멤버인지 검증
  const { data: membership } = await supabaseAdmin
    .from('family_members')
    .select('user_id')
    .eq('family_id', event.family_id)
    .eq('user_id', actorUserId)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 알림 대상: calendarId가 있으면 calendar_members, 없으면 family_members (본인 제외)
  let targetUserIds: string[]

  if (event.calendar_id) {
    const { data: members } = await supabaseAdmin
      .from('calendar_members')
      .select('user_id')
      .eq('calendar_id', event.calendar_id)
      .neq('user_id', actorUserId)
    targetUserIds = (members ?? []).map((m) => m.user_id)
  } else {
    const { data: members } = await supabaseAdmin
      .from('family_members')
      .select('user_id')
      .eq('family_id', event.family_id)
      .neq('user_id', actorUserId)
    targetUserIds = (members ?? []).map((m) => m.user_id)
  }

  if (targetUserIds.length === 0) return NextResponse.json({ sent: 0 })

  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, user_id')
    .in('user_id', targetUserIds)

  if (!subs?.length) return NextResponse.json({ sent: 0 })

  const payload = JSON.stringify({
    title: buildTitle(action),
    body: buildBody(action, event.title, event.start_at),
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
