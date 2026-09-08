import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import type { RecurrenceRule } from '@/types/recurrence'
export { getFamilyMembers, type FamilyMember } from '@/lib/family'

export type Calendar = Database['public']['Tables']['calendars']['Row']
export type CalendarMember = Database['public']['Tables']['calendar_members']['Row']
export type CalendarEvent = Database['public']['Tables']['events']['Row']
export type EventReminder = Database['public']['Tables']['event_reminders']['Row']
export type EventSuggestion = Pick<
  CalendarEvent,
  'id' | 'title' | 'calendar_id' | 'start_at' | 'end_at' | 'is_all_day' | 'label_color'
> & {
  event_reminders: Pick<EventReminder, 'remind_minutes_before'>[]
}
type RecurrenceRuleRow = Database['public']['Tables']['recurrence_rules']['Row']
type RecurrenceSeriesRow = Database['public']['Tables']['recurrence_series']['Row']

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

export const CALENDAR_COLOR_NAMES: Record<string, string> = {
  '#f97316': '주황색',
  '#3b82f6': '파란색',
  '#22c55e': '초록색',
  '#a855f7': '보라색',
  '#ec4899': '분홍색',
  '#14b8a6': '청록색',
  '#ef4444': '빨간색',
  '#eab308': '노란색',
}

export { LABEL_COLORS, LABEL_COLOR_NAMES } from './label-colors'

export function moveEventToDate(event: CalendarEvent, targetDate: Date): CalendarEvent {
  const start = new Date(event.start_at)
  if (
    start.getFullYear() === targetDate.getFullYear() &&
    start.getMonth() === targetDate.getMonth() &&
    start.getDate() === targetDate.getDate()
  ) return event

  const nextStart = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
    start.getHours(),
    start.getMinutes(),
    start.getSeconds(),
    start.getMilliseconds()
  )
  const end = event.end_at ? new Date(event.end_at) : null
  let nextEnd = end
    ? new Date(nextStart.getTime() + end.getTime() - start.getTime())
    : null

  if (event.is_all_day && end) {
    const daySpan = Math.round((
      Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) -
      Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
    ) / 86_400_000)
    nextEnd = new Date(nextStart)
    nextEnd.setDate(nextEnd.getDate() + daySpan)
  }

  return {
    ...event,
    start_at: nextStart.toISOString(),
    end_at: nextEnd?.toISOString() ?? null,
  }
}

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
  color: string,
  memberUserIds: string[] = []
): Promise<Calendar> {
  const { data, error } = await supabase
    .rpc('create_calendar_with_members_authorized', {
      p_actor_user_id: userId,
      p_family_id: familyId,
      p_name: name,
      p_color: color,
      p_member_user_ids: memberUserIds,
    })
  if (error) throw error
  if (!data) throw new Error('Calendar creation returned no data')
  return data
}

export async function updateCalendar(
  calendarId: string,
  userId: string,
  updates: { name: string; color: string },
  memberUserIds: string[] | null
): Promise<void> {
  const { error } = await supabase.rpc('update_calendar_with_members_authorized', {
    p_actor_user_id: userId,
    p_calendar_id: calendarId,
    p_name: updates.name,
    p_color: updates.color,
    p_member_user_ids: memberUserIds,
  })
  if (error) throw error
}

export async function deleteCalendar(calendarId: string): Promise<void> {
  const { error } = await supabase.from('calendars').delete().eq('id', calendarId)
  if (error) throw error
}

// ── Calendar Members ───────────────────────────────────────

export async function getCalendarMembers(calendarId: string): Promise<CalendarMember[]> {
  const { data, error } = await supabase
    .from('calendar_members')
    .select('*')
    .eq('calendar_id', calendarId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

/** 여러 캘린더의 멤버를 한 번에 조회 */
export async function getCalendarMembersForCalendars(
  calendarIds: string[]
): Promise<CalendarMember[]> {
  if (calendarIds.length === 0) return []
  const { data, error } = await supabase
    .from('calendar_members')
    .select('*')
    .in('calendar_id', calendarIds)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

// ── Events ─────────────────────────────────────────────────

export async function getEventsByRange(
  familyId: string,
  start: Date,
  endExclusive: Date
): Promise<CalendarEvent[]> {
  const startIso = start.toISOString()
  const endExclusiveIso = endExclusive.toISOString()

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('family_id', familyId)
    .eq('is_cancelled', false)
    .lt('start_at', endExclusiveIso)
    .or(`start_at.gte.${startIso},and(is_all_day.eq.true,end_at.gte.${startIso})`)
    .order('start_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function getEventSuggestions(
  familyId: string,
  userId: string,
  prefix: string
): Promise<EventSuggestion[]> {
  const pattern = `${prefix.trim().replace(/[\\%_]/g, '\\$&')}%`
  const { data, error } = await supabase
    .from('events')
    .select('id,title,calendar_id,start_at,end_at,is_all_day,label_color,event_reminders(remind_minutes_before)')
    .eq('family_id', familyId)
    .eq('created_by', userId)
    .eq('is_cancelled', false)
    .is('series_id', null)
    .ilike('title', pattern)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) throw error

  const seen = new Set<string>()
  return (data ?? []).filter((event) => {
    const key = event.title.trim().toLocaleLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 5)
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

function toRecurrenceRule(rule: RecurrenceRuleRow): RecurrenceRule {
  return {
    freq: rule.freq,
    interval: rule.interval,
    ...(rule.days_of_week ? { daysOfWeek: rule.days_of_week } : {}),
    ...(rule.day_of_month ? { dayOfMonth: rule.day_of_month } : {}),
    ...(rule.end_date ? { endDate: rule.end_date } : {}),
  }
}

export async function getRecurrenceRule(seriesId: string): Promise<RecurrenceRule | null> {
  const { data: series, error: seriesError } = await supabase
    .from('recurrence_series')
    .select('rule_id')
    .eq('id', seriesId)
    .maybeSingle<Pick<RecurrenceSeriesRow, 'rule_id'>>()

  if (seriesError) throw seriesError
  if (!series) return null

  const { data: rule, error: ruleError } = await supabase
    .from('recurrence_rules')
    .select('*')
    .eq('id', series.rule_id)
    .maybeSingle<RecurrenceRuleRow>()

  if (ruleError) throw ruleError
  return rule ? toRecurrenceRule(rule) : null
}
