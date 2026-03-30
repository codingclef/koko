import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type Calendar = Database['public']['Tables']['calendars']['Row']
export type CalendarEvent = Database['public']['Tables']['events']['Row']
export type EventReminder = Database['public']['Tables']['event_reminders']['Row']

export const CALENDAR_COLORS = [
  '#f97316', // orange
  '#3b82f6', // blue
  '#22c55e', // green
  '#a855f7', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#ef4444', // red
  '#eab308', // yellow
]

export const REMINDER_OPTIONS: { label: string; minutes: number }[] = [
  { label: '5분 전', minutes: 5 },
  { label: '10분 전', minutes: 10 },
  { label: '30분 전', minutes: 30 },
  { label: '1시간 전', minutes: 60 },
  { label: '2시간 전', minutes: 120 },
  { label: '1일 전', minutes: 1440 },
  { label: '2일 전', minutes: 2880 },
  { label: '1주 전', minutes: 10080 },
]

// ── Calendars ──────────────────────────────────────────────

export async function getCalendars(familyId: string): Promise<Calendar[]> {
  const { data, error } = await supabase
    .from('calendars')
    .select('*')
    .eq('family_id', familyId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createCalendar(
  familyId: string,
  userId: string,
  name: string,
  color: string
): Promise<Calendar> {
  const { data, error } = await supabase
    .from('calendars')
    .insert({ family_id: familyId, created_by: userId, name, color })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCalendar(
  calendarId: string,
  updates: { name?: string; color?: string }
): Promise<void> {
  const { error } = await supabase
    .from('calendars')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', calendarId)
  if (error) throw error
}

export async function deleteCalendar(calendarId: string): Promise<void> {
  const { error } = await supabase.from('calendars').delete().eq('id', calendarId)
  if (error) throw error
}

// ── Events ─────────────────────────────────────────────────

export async function getEventsByMonth(
  familyId: string,
  year: number,
  month: number // 0-indexed (0=January)
): Promise<CalendarEvent[]> {
  const start = new Date(year, month, 1).toISOString()
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString()

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('family_id', familyId)
    .gte('start_at', start)
    .lte('start_at', end)
    .order('start_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function createEvent(params: {
  familyId: string
  userId: string
  calendarId: string | null
  title: string
  description: string | null
  startAt: string
  endAt: string | null
  isAllDay: boolean
}): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('events')
    .insert({
      family_id: params.familyId,
      created_by: params.userId,
      calendar_id: params.calendarId,
      title: params.title,
      description: params.description,
      start_at: params.startAt,
      end_at: params.endAt,
      is_all_day: params.isAllDay,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateEvent(
  eventId: string,
  updates: {
    calendarId?: string | null
    title?: string
    description?: string | null
    startAt?: string
    endAt?: string | null
    isAllDay?: boolean
  }
): Promise<void> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (updates.calendarId !== undefined) payload.calendar_id = updates.calendarId
  if (updates.title !== undefined) payload.title = updates.title
  if (updates.description !== undefined) payload.description = updates.description
  if (updates.startAt !== undefined) payload.start_at = updates.startAt
  if (updates.endAt !== undefined) payload.end_at = updates.endAt
  if (updates.isAllDay !== undefined) payload.is_all_day = updates.isAllDay

  const { error } = await supabase.from('events').update(payload).eq('id', eventId)
  if (error) throw error
}

export async function deleteEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', eventId)
  if (error) throw error
}

// ── Reminders ──────────────────────────────────────────────

export async function getReminders(eventId: string): Promise<EventReminder[]> {
  const { data, error } = await supabase
    .from('event_reminders')
    .select('*')
    .eq('event_id', eventId)
    .order('remind_minutes_before', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function setReminders(eventId: string, minutesList: number[]): Promise<void> {
  const { error: delError } = await supabase
    .from('event_reminders')
    .delete()
    .eq('event_id', eventId)
  if (delError) throw delError
  if (minutesList.length === 0) return
  const { error } = await supabase
    .from('event_reminders')
    .insert(minutesList.map((m) => ({ event_id: eventId, remind_minutes_before: m })))
  if (error) throw error
}
