import { supabase } from './supabase'
import type { Database } from '@/types/database'

export type UserPreferences = Database['public']['Tables']['user_preferences']['Row']

export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error) {
    // PGRST116: no rows found — not an error, user just has no saved preferences yet
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data
}

export async function upsertUserPreferences(
  userId: string,
  updates: Partial<Omit<UserPreferences, 'user_id' | 'created_at' | 'updated_at'>>
): Promise<UserPreferences> {
  const { data, error } = await supabase
    .from('user_preferences')
    .upsert({ user_id: userId, ...updates, updated_at: new Date().toISOString() })
    .select()
    .single()

  if (error) throw error
  return data
}
