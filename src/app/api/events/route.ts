import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId, assertCalendarWriteAccess } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEventNotification } from '@/lib/push-utils'

interface CreateEventRequest {
  calendarId: string | null
  title: string
  description: string | null
  startAt: string
  endAt: string | null
  isAllDay: boolean
  reminderMinutes: number[]
}

export async function POST(req: NextRequest) {
  const actorUserId = await getAuthenticatedUserId(req)
  if (!actorUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as CreateEventRequest
  const { calendarId, title, description, startAt, endAt, isAllDay, reminderMinutes } = body

  if (!title || !startAt) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data: member } = await supabaseAdmin
    .from('family_members')
    .select('family_id')
    .eq('user_id', actorUserId)
    .maybeSingle()

  if (!member) {
    return NextResponse.json({ error: 'Family not found' }, { status: 403 })
  }

  if (calendarId) {
    const hasAccess = await assertCalendarWriteAccess(member.family_id, calendarId, actorUserId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from('events')
    .insert({
      family_id: member.family_id,
      created_by: actorUserId,
      calendar_id: calendarId,
      title,
      description,
      start_at: startAt,
      end_at: endAt,
      is_all_day: isAllDay,
    })
    .select()
    .single()

  if (eventError || !event) {
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 })
  }

  if (reminderMinutes.length > 0) {
    const { error: reminderError } = await supabaseAdmin
      .from('event_reminders')
      .insert(reminderMinutes.map((m) => ({ event_id: event.id, remind_minutes_before: m })))
    if (reminderError) {
      return NextResponse.json({ error: 'Failed to save reminders' }, { status: 500 })
    }
  }

  void sendEventNotification({
    familyId: member.family_id,
    calendarId,
    actorUserId,
    action: 'created',
    eventTitle: title,
    eventStartAt: startAt,
  })

  return NextResponse.json(event, { status: 201 })
}
