import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import type { RecurrenceRule } from '@/types/recurrence'

export type Calendar = Database['public']['Tables']['calendars']['Row']
export type CalendarMember = Database['public']['Tables']['calendar_members']['Row']
export type CalendarEvent = Database['public']['Tables']['events']['Row']
export type EventReminder = Database['public']['Tables']['event_reminders']['Row']
export type FamilyMember = Database['public']['Tables']['family_members']['Row']
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

export type SaveResult = { status: 'success' } | { status: 'partial' }

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

// ── Family Members ─────────────────────────────────────────

export async function getFamilyMembers(familyId: string): Promise<FamilyMember[]> {
  const { data, error } = await supabase
    .from('family_members')
    .select('*')
    .eq('family_id', familyId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

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
    .from('calendars')
    .insert({ family_id: familyId, created_by: userId, name, color })
    .select()
    .single()
  if (error) throw error

  // Step 1: 생성자를 owner로 먼저 단독 insert
  // (bootstrap RLS 정책 케이스 A — owner 레코드가 없는 상태에서 첫 레코드 등록)
  const { error: ownerError } = await supabase
    .from('calendar_members')
    .insert({ calendar_id: data.id, user_id: userId, role: 'owner' })
  if (ownerError) throw ownerError

  // Step 2: 나머지 멤버 insert
  // (owner 레코드가 존재하므로 RLS 케이스 B 통과)
  const newMembers = memberUserIds
    .filter((id) => id !== userId)
    .map((id) => ({ calendar_id: data.id, user_id: id, role: 'member' as const }))
  if (newMembers.length > 0) {
    const { error: memberError } = await supabase.from('calendar_members').insert(newMembers)
    if (memberError) throw memberError
  }

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

/** 캘린더 멤버 목록을 일괄 교체 (owner는 항상 유지) */
export async function setCalendarMembers(
  calendarId: string,
  ownerUserId: string,
  memberUserIds: string[]
): Promise<void> {
  // owner 제외한 기존 멤버 전체 삭제
  const { error: delError } = await supabase
    .from('calendar_members')
    .delete()
    .eq('calendar_id', calendarId)
    .neq('user_id', ownerUserId)
  if (delError) throw delError

  const newMembers = memberUserIds
    .filter((id) => id !== ownerUserId)
    .map((id) => ({ calendar_id: calendarId, user_id: id, role: 'member' as const }))

  if (newMembers.length === 0) return

  const { error } = await supabase.from('calendar_members').insert(newMembers)
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
    .eq('is_cancelled', false)
    .gte('start_at', start)
    .lte('start_at', end)
    .order('start_at', { ascending: true })

  if (error) throw error
  return data ?? []
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
