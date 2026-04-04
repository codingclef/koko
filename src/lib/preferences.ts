import { supabase } from './supabase'
import type { Database } from '@/types/database'

export const APP_THEMES = [
  { key: 'tangerine', label: '탠저린', color: '#fb923c' },
  { key: 'sage',      label: '세이지',   color: '#2dd4bf' },
  { key: 'ocean',     label: '오션',     color: '#38bdf8' },
  { key: 'rose',      label: '로즈',     color: '#fb7185' },
  { key: 'violet',    label: '바이올렛', color: '#a78bfa' },
  { key: 'denim',     label: '데님',     color: '#818cf8' },
] as const

export type AppTheme = typeof APP_THEMES[number]['key']
export const DEFAULT_THEME: AppTheme = 'tangerine'

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
