import { after, NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEventNotification } from '@/lib/push-utils'
import type { RecurrenceScope } from '@/types/recurrence'
import { VALID_SCOPES } from '@/types/recurrence'
import { ALLOWED_LABEL_COLORS } from '@/lib/label-colors'

interface RecurrenceInput {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  daysOfWeek?: number[]
  dayOfMonth?: number | null
  endDate?: string | null
}

interface UpdateEventRequest {
  calendarId?: string | null
  title?: string
  description?: string | null
  startAt?: string
  endAt?: string | null
  localStartDate?: string
  localEndDate?: string
  startTime?: string | null
  endTime?: string | null
  isAllDay?: boolean
  reminderMinutes?: number[]
  labelColor?: string | null
  recurrence?: RecurrenceInput | null
  // series-only
  scope?: RecurrenceScope
  anchorOccurrenceDate?: string | null
}

type UpdateResult = {
  is_changed: boolean
  family_id: string
  new_calendar_id: string | null
  new_title: string
  new_start_at: string
  series_id?: string | null
  scope?: string | null
}

type DeleteResult = {
  family_id: string
  calendar_id: string | null
  title: string
  start_at: string
  series_id?: string | null
  scope?: string | null
}

function getIsoDatePart(value: string): string {
  return new Date(value).toISOString().slice(0, 10)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actorUserId = await getAuthenticatedUserId(req)
  if (!actorUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: eventId } = await params
  const body = (await req.json()) as UpdateEventRequest

  const scope = body.scope
  if (scope !== undefined && !VALID_SCOPES.includes(scope)) {
    return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
  }

  if ('labelColor' in body && body.labelColor !== null && body.labelColor !== undefined
      && !ALLOWED_LABEL_COLORS.has(body.labelColor)) {
    return NextResponse.json({ error: 'Invalid label color' }, { status: 400 })
  }
  if (scope === 'following' && !body.anchorOccurrenceDate) {
    return NextResponse.json({ error: 'anchorOccurrenceDate required for following scope' }, { status: 400 })
  }

  const requestedOccurrenceDate = body.localStartDate ?? (body.startAt ? getIsoDatePart(body.startAt) : null)
  const isScopedDateChange = Boolean(
    scope &&
    scope !== 'single' &&
    requestedOccurrenceDate &&
    body.anchorOccurrenceDate &&
    requestedOccurrenceDate !== body.anchorOccurrenceDate
  )
  const isFollowingRecurrenceChange = Boolean(
    scope === 'following' &&
    body.recurrence
  )

  if (isScopedDateChange && scope !== 'following') {
    return NextResponse.json(
      { error: 'Changing occurrence date is only supported for following scope' },
      { status: 400 }
    )
  }

  // ── Series update ────────────────────────────────────────
  if (scope) {
    const startTime = body.startTime ?? (body.startAt ? new Date(body.startAt).toISOString().slice(11, 19) : null)
    const endTime = body.endTime ?? (body.endAt ? new Date(body.endAt).toISOString().slice(11, 19) : null)

    if (isScopedDateChange || isFollowingRecurrenceChange) {
      const anchorOccurrenceDate = body.anchorOccurrenceDate
      if (!body.startAt) {
        return NextResponse.json({ error: 'startAt required for following split' }, { status: 400 })
      }
      if (!anchorOccurrenceDate) {
        return NextResponse.json({ error: 'anchorOccurrenceDate required for following scope' }, { status: 400 })
      }
      if (!body.localStartDate) {
        return NextResponse.json({ error: 'localStartDate required for following split' }, { status: 400 })
      }

      const { data: result, error } = await supabaseAdmin.rpc('split_recurring_series_following_authorized', {
        p_actor_user_id:          actorUserId,
        p_event_id:               eventId,
        p_anchor_occurrence_date: anchorOccurrenceDate,
        p_local_start_date:       body.localStartDate,
        p_title:                  body.title ?? null,
        p_description:            body.description ?? null,
        p_has_description:        'description' in body,
        p_start_at:               body.startAt,
        p_end_at:                 body.endAt ?? null,
        p_has_end_at:             'endAt' in body,
        p_is_all_day:             body.isAllDay ?? null,
        p_calendar_id:            body.calendarId ?? null,
        p_has_calendar_id:        'calendarId' in body,
        p_reminder_minutes:       body.reminderMinutes ?? null,
        p_label_color:            body.labelColor ?? null,
        p_has_label_color:        'labelColor' in body,
        p_freq:                   body.recurrence?.freq ?? null,
        p_interval:               body.recurrence?.interval ?? null,
        p_days_of_week:           body.recurrence?.daysOfWeek ?? null,
        p_day_of_month:           body.recurrence?.dayOfMonth ?? null,
        p_end_date:               body.recurrence?.endDate ?? null,
        p_should_update_end_date: Boolean(body.recurrence),
      })

      if (error) {
        if (error.message === 'not_found')        return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        if (error.message === 'not_series_event') return NextResponse.json({ error: 'Not a series event' }, { status: 400 })
        if (error.message === 'anchor_required')  return NextResponse.json({ error: 'anchorOccurrenceDate required for following scope' }, { status: 400 })
        if (error.message === 'local_start_date_required') return NextResponse.json({ error: 'localStartDate required for following date change' }, { status: 400 })
        if (error.message === 'start_at_required') return NextResponse.json({ error: 'startAt required for following date change' }, { status: 400 })
        if (error.message === 'invalid_start_date') return NextResponse.json({ error: 'startAt must be on or after anchorOccurrenceDate' }, { status: 400 })
        if (error.message === 'invalid_interval') return NextResponse.json({ error: 'Invalid recurrence interval' }, { status: 400 })
        if (error.message === 'invalid_frequency') return NextResponse.json({ error: 'Invalid recurrence frequency' }, { status: 400 })
        if (error.message === 'no_future_occurrences') return NextResponse.json({ error: 'No future occurrences would be created' }, { status: 400 })
        if (error.message === 'forbidden')        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        return NextResponse.json({ error: 'Failed to split recurring event' }, { status: 500 })
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

    const { data: result, error } = await supabaseAdmin.rpc('update_series_authorized', {
      p_actor_user_id:          actorUserId,
      p_event_id:               eventId,
      p_scope:                  scope,
      p_anchor_occurrence_date: body.anchorOccurrenceDate ?? null,
      p_title:                  body.title ?? null,
      p_description:            body.description ?? null,
      p_has_description:        'description' in body,
      p_start_at:               body.startAt ?? null,
      p_end_at:                 body.endAt ?? null,
      p_has_end_at:             'endAt' in body,
      p_start_time:             startTime,
      p_end_time:               endTime,
      p_is_all_day:             body.isAllDay ?? null,
      p_calendar_id:            body.calendarId ?? null,
      p_has_calendar_id:        'calendarId' in body,
      p_reminder_minutes:       body.reminderMinutes ?? null,
      p_label_color:            body.labelColor ?? null,
      p_has_label_color:        'labelColor' in body,
    })

    if (error) {
      if (error.message === 'not_found')       return NextResponse.json({ error: 'Event not found' }, { status: 404 })
      if (error.message === 'not_series_event') return NextResponse.json({ error: 'Not a series event' }, { status: 400 })
      if (error.message === 'forbidden')       return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      return NextResponse.json({ error: 'Failed to update recurring event' }, { status: 500 })
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

  // ── Single event update ───────────────────────────────────
  const { data: result, error } = await supabaseAdmin.rpc('update_event_authorized', {
    p_actor_user_id:    actorUserId,
    p_event_id:         eventId,
    p_title:            body.title ?? null,
    p_description:      body.description ?? null,
    p_has_description:  'description' in body,
    p_start_at:         body.startAt ?? null,
    p_end_at:           body.endAt ?? null,
    p_has_end_at:       'endAt' in body,
    p_is_all_day:       body.isAllDay ?? null,
    p_calendar_id:      body.calendarId ?? null,
    p_has_calendar_id:  'calendarId' in body,
    p_reminder_minutes: body.reminderMinutes ?? null,
    p_label_color:      body.labelColor ?? null,
    p_has_label_color:  'labelColor' in body,
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
  const url   = new URL(req.url)
  const scope = url.searchParams.get('scope') as RecurrenceScope | null
  const anchorOccurrenceDate = url.searchParams.get('anchorOccurrenceDate')

  if (scope !== null && !VALID_SCOPES.includes(scope)) {
    return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
  }
  if (scope === 'following' && !anchorOccurrenceDate) {
    return NextResponse.json({ error: 'anchorOccurrenceDate required for following scope' }, { status: 400 })
  }

  // ── Series delete ────────────────────────────────────────
  if (scope && scope !== 'single') {
    const { data: deleted, error } = await supabaseAdmin.rpc('delete_series_authorized', {
      p_actor_user_id:          actorUserId,
      p_event_id:               eventId,
      p_scope:                  scope,
      p_anchor_occurrence_date: anchorOccurrenceDate ?? null,
    })

    if (error) {
      if (error.message === 'not_found')       return NextResponse.json({ error: 'Event not found' }, { status: 404 })
      if (error.message === 'not_series_event') return NextResponse.json({ error: 'Not a series event' }, { status: 400 })
      if (error.message === 'forbidden')       return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      return NextResponse.json({ error: 'Failed to delete series events' }, { status: 500 })
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

  // ── Single event delete ──────────────────────────────────
  if (scope === 'single') {
    const { data: deleted, error } = await supabaseAdmin.rpc('delete_series_authorized', {
      p_actor_user_id:          actorUserId,
      p_event_id:               eventId,
      p_scope:                  'single',
      p_anchor_occurrence_date: null,
    })

    if (error) {
      if (error.message === 'not_found')  return NextResponse.json({ error: 'Event not found' }, { status: 404 })
      if (error.message === 'forbidden')  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

  // ── Regular (non-series) hard delete ─────────────────────
  const { data: deleted, error } = await supabaseAdmin.rpc('delete_event_authorized', {
    p_actor_user_id: actorUserId,
    p_event_id:      eventId,
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
