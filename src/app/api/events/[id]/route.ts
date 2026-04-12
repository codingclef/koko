import { NextRequest, NextResponse } from 'next/server'
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
  const actorUserId = await getAuthenticatedUserId(req)
  if (!actorUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: eventId } = await params
  const body = (await req.json()) as UpdateEventRequest

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('events')
    .select('id, title, start_at, end_at, description, calendar_id, is_all_day, family_id')
    .eq('id', eventId)
    .maybeSingle()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  if (!(await canWriteEvent(existing, actorUserId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 대상 캘린더가 바뀌는 경우 target 캘린더 접근 권한도 검증
  if (body.calendarId !== undefined && body.calendarId !== null && body.calendarId !== existing.calendar_id) {
    const hasTargetAccess = await assertCalendarWriteAccess(existing.family_id, body.calendarId, actorUserId)
    if (!hasTargetAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const updates: Record<string, unknown> = {}
  if (body.title !== undefined) updates.title = body.title
  if (body.description !== undefined) updates.description = body.description
  if (body.startAt !== undefined) updates.start_at = body.startAt
  if (body.endAt !== undefined) updates.end_at = body.endAt
  if (body.isAllDay !== undefined) updates.is_all_day = body.isAllDay
  if (body.calendarId !== undefined) updates.calendar_id = body.calendarId

  const changed = Object.entries(updates).some(
    ([k, v]) => existing[k as keyof typeof existing] !== v
  )

  const { error: updateError } = await supabaseAdmin
    .from('events')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', eventId)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 })
  }

  if (body.reminderMinutes !== undefined) {
    const { error: deleteError } = await supabaseAdmin
      .from('event_reminders')
      .delete()
      .eq('event_id', eventId)
    if (deleteError) {
      return NextResponse.json({ error: 'Failed to update reminders' }, { status: 500 })
    }

    if (body.reminderMinutes.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('event_reminders')
        .insert(body.reminderMinutes.map((m) => ({ event_id: eventId, remind_minutes_before: m })))
      if (insertError) {
        return NextResponse.json({ error: 'Failed to update reminders' }, { status: 500 })
      }
    }
  }

  if (changed) {
    void sendEventNotification({
      familyId: existing.family_id,
      calendarId: (updates.calendar_id !== undefined ? updates.calendar_id : existing.calendar_id) as string | null,
      actorUserId,
      action: 'updated',
      eventTitle: (updates.title ?? existing.title) as string,
      eventStartAt: (updates.start_at ?? existing.start_at) as string,
    })
  }

  return new NextResponse(null, { status: 204 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actorUserId = await getAuthenticatedUserId(req)
  if (!actorUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: eventId } = await params

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('events')
    .select('id, title, start_at, calendar_id, family_id')
    .eq('id', eventId)
    .maybeSingle()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  if (!(await canWriteEvent(existing, actorUserId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error: deleteError } = await supabaseAdmin
    .from('events')
    .delete()
    .eq('id', eventId)

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 })
  }

  void sendEventNotification({
    familyId: existing.family_id,
    calendarId: existing.calendar_id,
    actorUserId,
    action: 'deleted',
    eventTitle: existing.title,
    eventStartAt: existing.start_at,
  })

  return new NextResponse(null, { status: 204 })
}
