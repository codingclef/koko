import { after, NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId, isFamilyMember, assertCalendarWriteAccess } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEventNotification } from '@/lib/push-utils'

interface UpdateEventRequest {
  calendarId?: string | null
  title?: string
  description?: string | null
  startAt?: string
  endAt?: string | null
  isAllDay?: boolean
  reminderMinutes?: number[]
}

async function canWriteEvent(
  existing: { calendar_id: string | null; family_id: string },
  actorUserId: string
): Promise<boolean> {
  if (existing.calendar_id) {
    return assertCalendarWriteAccess(existing.family_id, existing.calendar_id, actorUserId)
  }
  return isFamilyMember(existing.family_id, actorUserId)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t0 = Date.now()
  const actorUserId = await getAuthenticatedUserId(req)
  console.log(`[perf] PATCH /api/events/[id] auth: ${Date.now() - t0}ms`)
  if (!actorUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: eventId } = await params
  const body = (await req.json()) as UpdateEventRequest

  const t1 = Date.now()
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('events')
    .select('id, title, start_at, end_at, description, calendar_id, is_all_day, family_id')
    .eq('id', eventId)
    .maybeSingle()
  console.log(`[perf] PATCH /api/events/[id] event fetch: ${Date.now() - t1}ms`)

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const t2 = Date.now()
  if (!(await canWriteEvent(existing, actorUserId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  console.log(`[perf] PATCH /api/events/[id] access check: ${Date.now() - t2}ms`)

  // 대상 캘린더가 바뀌는 경우 target 캘린더 접근 권한도 검증
  if (body.calendarId !== undefined && body.calendarId !== null && body.calendarId !== existing.calendar_id) {
    const hasTargetAccess = await assertCalendarWriteAccess(existing.family_id, body.calendarId, actorUserId)
    if (!hasTargetAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const newTitle = body.title ?? existing.title
  const newDescription = body.description !== undefined ? body.description : existing.description
  const newStartAt = body.startAt ?? existing.start_at
  const newEndAt = body.endAt !== undefined ? body.endAt : existing.end_at
  const newIsAllDay = body.isAllDay ?? existing.is_all_day
  const newCalendarId = body.calendarId !== undefined ? body.calendarId : existing.calendar_id

  const changed =
    newTitle !== existing.title ||
    newDescription !== existing.description ||
    newStartAt !== existing.start_at ||
    newEndAt !== existing.end_at ||
    newIsAllDay !== existing.is_all_day ||
    newCalendarId !== existing.calendar_id

  const t3 = Date.now()
  const { error: rpcError } = await supabaseAdmin.rpc('update_event_with_reminders', {
    p_event_id: eventId,
    p_title: newTitle,
    p_description: newDescription,
    p_start_at: newStartAt,
    p_end_at: newEndAt,
    p_is_all_day: newIsAllDay,
    p_calendar_id: newCalendarId,
    p_reminder_minutes: body.reminderMinutes ?? null,
  })
  console.log(`[perf] PATCH /api/events/[id] RPC: ${Date.now() - t3}ms | total: ${Date.now() - t0}ms`)

  if (rpcError) {
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 })
  }

  if (changed) {
    after(async () => {
      await sendEventNotification({
        familyId: existing.family_id,
        calendarId: newCalendarId,
        actorUserId,
        action: 'updated',
        eventTitle: newTitle,
        eventStartAt: newStartAt,
      })
    })
  }

  return new NextResponse(null, { status: 204 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t0 = Date.now()
  const actorUserId = await getAuthenticatedUserId(req)
  console.log(`[perf] DELETE /api/events/[id] auth: ${Date.now() - t0}ms`)
  if (!actorUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: eventId } = await params

  const t1 = Date.now()
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('events')
    .select('id, title, start_at, calendar_id, family_id')
    .eq('id', eventId)
    .maybeSingle()
  console.log(`[perf] DELETE /api/events/[id] event fetch: ${Date.now() - t1}ms`)

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const t2 = Date.now()
  if (!(await canWriteEvent(existing, actorUserId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  console.log(`[perf] DELETE /api/events/[id] access check: ${Date.now() - t2}ms`)

  const t3 = Date.now()
  const { error: deleteError } = await supabaseAdmin
    .from('events')
    .delete()
    .eq('id', eventId)
  console.log(`[perf] DELETE /api/events/[id] delete: ${Date.now() - t3}ms | total: ${Date.now() - t0}ms`)

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 })
  }

  after(async () => {
    await sendEventNotification({
      familyId: existing.family_id,
      calendarId: existing.calendar_id,
      actorUserId,
      action: 'deleted',
      eventTitle: existing.title,
      eventStartAt: existing.start_at,
    })
  })

  return new NextResponse(null, { status: 204 })
}
