import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type UserCalendarPreference =
  Database['public']['Tables']['user_calendar_preferences']['Row']

export async function getUserCalendarPreferences(
  userId: string
): Promise<UserCalendarPreference[]> {
  const { data, error } = await supabase
    .from('user_calendar_preferences')
    .select('*')
    .eq('user_id', userId)

  if (error) throw error
  return data ?? []
}

export async function upsertUserCalendarLabelColor(
  userId: string,
  calendarId: string,
  lastLabelColor: string | null
): Promise<UserCalendarPreference> {
  const { data, error } = await supabase
    .from('user_calendar_preferences')
    .upsert(
      {
        user_id: userId,
        calendar_id: calendarId,
        last_label_color: lastLabelColor,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,calendar_id' }
    )
    .select()
    .single()

  if (error) throw error
  return data
}
