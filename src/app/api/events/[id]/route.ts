import { after, NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEventNotification } from '@/lib/push-utils'
import type { RecurrenceScope } from '@/types/recurrence'
import { VALID_SCOPES } from '@/types/recurrence'
import { ALLOWED_LABEL_COLORS } from '@/lib/label-colors'
import { REMINDER_TIME_ZONE } from '@/lib/reminders'

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

function getDateInReminderTimeZone(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: REMINDER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return `${year}-${month}-${day}`
}

function getTodayInReminderTimeZone(): string {
  return getDateInReminderTimeZone(new Date())
}

function isDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function addYears(date: string, years: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCFullYear(value.getUTCFullYear() + years)
  return value.toISOString().slice(0, 10)
}

function getRegularConversionError(body: UpdateEventRequest): string | null {
  const recurrence = body.recurrence
  if (!recurrence || !body.title?.trim() || !body.startAt || !body.endAt
      || !isDateString(body.localStartDate) || !isDateString(body.localEndDate)
      || typeof body.isAllDay !== 'boolean' || !Array.isArray(body.reminderMinutes)) {
    return 'Invalid recurrence conversion request'
  }
  if (body.localStartDate < getTodayInReminderTimeZone()) {
    return 'Past events cannot be converted to recurring events'
  }
  if (body.localStartDate !== body.localEndDate) {
    return 'Multi-day events cannot be converted to recurring events'
  }

  const startAt = new Date(body.startAt)
  const endAt = new Date(body.endAt)
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt < startAt) {
    return 'Invalid event range'
  }
  if (
    getDateInReminderTimeZone(startAt) !== body.localStartDate
    || getDateInReminderTimeZone(endAt) !== body.localEndDate
  ) {
    return 'Invalid local event date'
  }
  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(recurrence.freq)) {
    return 'Invalid recurrence frequency'
  }
  if (!Number.isInteger(recurrence.interval) || recurrence.interval < 1) {
    return 'Invalid recurrence interval'
  }

  if (recurrence.freq === 'weekly' && recurrence.daysOfWeek?.length) {
    const uniqueDays = new Set(recurrence.daysOfWeek)
    if (
      uniqueDays.size !== recurrence.daysOfWeek.length
      || recurrence.daysOfWeek.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
    ) {
      return 'Invalid recurrence days'
    }

    const startDay = new Date(`${body.localStartDate}T00:00:00Z`).getUTCDay()
    if (!uniqueDays.has(startDay)) {
      return 'The recurrence days must include the event start day'
    }
  }

  if (
    recurrence.freq === 'monthly'
    && recurrence.dayOfMonth !== undefined
    && recurrence.dayOfMonth !== null
    && (!Number.isInteger(recurrence.dayOfMonth) || recurrence.dayOfMonth < 1 || recurrence.dayOfMonth > 31)
  ) {
    return 'Invalid recurrence day of month'
  }

  if (
    recurrence.endDate !== undefined
    && recurrence.endDate !== null
    && (!isDateString(recurrence.endDate)
      || recurrence.endDate < body.localStartDate
      || recurrence.endDate > addYears(body.localStartDate, 2))
  ) {
    return 'Invalid recurrence end date'
  }

  if (body.reminderMinutes.some((minutes) => !Number.isInteger(minutes) || minutes <= 0)) {
    return 'Invalid reminder minutes'
  }
  return null
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

  // ── Regular event -> recurring series ─────────────────────
  if (!scope && body.recurrence) {
    const validationError = getRegularConversionError(body)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const { data: result, error } = await supabaseAdmin.rpc(
      'convert_event_to_recurring_series_authorized',
      {
        p_actor_user_id:    actorUserId,
        p_event_id:         eventId,
        p_calendar_id:      body.calendarId ?? null,
        p_title:            body.title!,
        p_description:      body.description ?? null,
        p_start_at:         body.startAt!,
        p_end_at:           body.endAt!,
        p_local_start_date: body.localStartDate!,
        p_local_end_date:   body.localEndDate!,
        p_is_all_day:       body.isAllDay!,
        p_reminder_minutes: body.reminderMinutes!,
        p_freq:             body.recurrence.freq,
        p_interval:         body.recurrence.interval,
        p_days_of_week:     body.recurrence.daysOfWeek ?? [],
        p_day_of_month:     body.recurrence.dayOfMonth ?? null,
        p_end_date:         body.recurrence.endDate ?? null,
        p_label_color:      body.labelColor ?? null,
        p_today:            getTodayInReminderTimeZone(),
      }
    )

    if (error) {
      if (error.message === 'not_found') return NextResponse.json({ error: 'Event not found' }, { status: 404 })
      if (error.message === 'already_recurring') return NextResponse.json({ error: 'Event is already recurring' }, { status: 409 })
      if (error.message === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (error.message === 'past_event') return NextResponse.json({ error: 'Past events cannot be converted to recurring events' }, { status: 400 })
      if (error.message === 'multi_day_event') return NextResponse.json({ error: 'Multi-day events cannot be converted to recurring events' }, { status: 400 })
      if (error.message === 'start_day_not_selected') return NextResponse.json({ error: 'The recurrence days must include the event start day' }, { status: 400 })
      if (error.message.startsWith('invalid_')) return NextResponse.json({ error: 'Invalid recurrence conversion request' }, { status: 400 })
      return NextResponse.json({ error: 'Failed to convert event to recurring series' }, { status: 500 })
    }

    const { family_id, new_calendar_id, new_title, new_start_at } = result as UpdateResult
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
    return new NextResponse(null, { status: 204 })
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
