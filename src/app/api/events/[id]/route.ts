import { after, NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
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

type UpdateResult = {
  is_changed: boolean
  family_id: string
  new_calendar_id: string | null
  new_title: string
  new_start_at: string
}

type DeleteResult = {
  family_id: string
  calendar_id: string | null
  title: string
  start_at: string
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actorUserId = await getAuthenticatedUserId(req)
  if (!actorUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: eventId } = await params
  const body = (await req.json()) as UpdateEventRequest

  const { data: result, error } = await supabaseAdmin.rpc('update_event_authorized', {
    p_actor_user_id: actorUserId,
    p_event_id: eventId,
    p_title: body.title ?? null,
    p_description: body.description ?? null,
    p_has_description: 'description' in body,
    p_start_at: body.startAt ?? null,
    p_end_at: body.endAt ?? null,
    p_has_end_at: 'endAt' in body,
    p_is_all_day: body.isAllDay ?? null,
    p_calendar_id: body.calendarId ?? null,
    p_has_calendar_id: 'calendarId' in body,
    p_reminder_minutes: body.reminderMinutes ?? null,
  })

  if (error) {
    if (error.message === 'not_found') return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    if (error.message === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 })
  }

  const { is_changed, family_id, new_calendar_id, new_title, new_start_at } = result as UpdateResult
  if (is_changed) {
    after(async () => {
      await sendEventNotification({
        familyId: family_id,
        calendarId: new_calendar_id,
        actorUserId,
        action: 'updated',
        eventTitle: new_title,
        eventStartAt: new_start_at,
      })
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

  const { data: deleted, error } = await supabaseAdmin.rpc('delete_event_authorized', {
    p_actor_user_id: actorUserId,
    p_event_id: eventId,
  })

  if (error) {
    if (error.message === 'not_found') return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    if (error.message === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 })
  }

  const { family_id, calendar_id, title, start_at } = deleted as DeleteResult
  after(async () => {
    await sendEventNotification({
      familyId: family_id,
      calendarId: calendar_id,
      actorUserId,
      action: 'deleted',
      eventTitle: title,
      eventStartAt: start_at,
    })
  })

  return new NextResponse(null, { status: 204 })
}
