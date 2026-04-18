import { after, NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEventNotification } from '@/lib/push-utils'

interface RecurrenceInput {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  daysOfWeek?: number[]
  dayOfMonth?: number | null
  endDate?: string | null
}

interface CreateEventRequest {
  calendarId: string | null
  title: string
  description: string | null
  startAt: string
  endAt: string | null
  isAllDay: boolean
  reminderMinutes: number[]
  recurrence?: RecurrenceInput | null
}

export async function POST(req: NextRequest) {
  const actorUserId = await getAuthenticatedUserId(req)
  if (!actorUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as CreateEventRequest
  const { calendarId, title, description, startAt, endAt, isAllDay, reminderMinutes, recurrence } = body

  if (!title || !startAt) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // ── Recurring event ──────────────────────────────────────
  if (recurrence) {
    const { data, error } = await supabaseAdmin.rpc('create_recurring_series_authorized', {
      p_actor_user_id:    actorUserId,
      p_calendar_id:      calendarId,
      p_title:            title,
      p_description:      description,
      p_start_at:         startAt,
      p_end_at:           endAt,
      p_is_all_day:       isAllDay,
      p_reminder_minutes: reminderMinutes,
      p_freq:             recurrence.freq,
      p_interval:         recurrence.interval,
      p_days_of_week:     recurrence.daysOfWeek ?? [],
      p_day_of_month:     recurrence.dayOfMonth ?? null,
      p_end_date:         recurrence.endDate ?? null,
    })

    if (error) {
      if (error.message === 'no_family')  return NextResponse.json({ error: 'Family not found' }, { status: 403 })
      if (error.message === 'forbidden')  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      return NextResponse.json({ error: 'Failed to create recurring events' }, { status: 500 })
    }

    const result = data as { series_id: string; event_count: number }[] | null
    if (!result?.length) {
      return NextResponse.json({ error: 'Failed to create recurring events' }, { status: 500 })
    }

    after(async () => {
      const { data: firstEvent } = await supabaseAdmin
        .from('events')
        .select('family_id, calendar_id')
        .eq('series_id', result[0].series_id)
        .order('series_occurrence_date', { ascending: true })
        .limit(1)
        .single()

      if (firstEvent) {
        await sendEventNotification({
          familyId: firstEvent.family_id,
          calendarId: firstEvent.calendar_id,
          actorUserId,
          action: 'created',
          eventTitle: title,
          eventStartAt: startAt,
        })
      }
    })

    return NextResponse.json({ seriesId: result[0].series_id, eventCount: result[0].event_count }, { status: 201 })
  }

  // ── Single event ─────────────────────────────────────────
  const { data: events, error } = await supabaseAdmin.rpc('create_event_authorized', {
    p_actor_user_id:    actorUserId,
    p_calendar_id:      calendarId,
    p_title:            title,
    p_description:      description,
    p_start_at:         startAt,
    p_end_at:           endAt,
    p_is_all_day:       isAllDay,
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
