import { after, NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
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

  const { data: events, error } = await supabaseAdmin.rpc('create_event_authorized', {
    p_actor_user_id: actorUserId,
    p_calendar_id: calendarId,
    p_title: title,
    p_description: description,
    p_start_at: startAt,
    p_end_at: endAt,
    p_is_all_day: isAllDay,
    p_reminder_minutes: reminderMinutes,
  })

  if (error) {
    if (error.message === 'no_family') return NextResponse.json({ error: 'Family not found' }, { status: 403 })
    if (error.message === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 })
  }

  if (!events?.length) {
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 })
  }

  after(async () => {
    await sendEventNotification({
      familyId: events[0].family_id,
      calendarId,
      actorUserId,
      action: 'created',
      eventTitle: title,
      eventStartAt: startAt,
    })
  })

  return NextResponse.json(events[0], { status: 201 })
}
