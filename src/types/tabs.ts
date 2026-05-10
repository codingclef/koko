import type { User } from '@supabase/supabase-js'

export type Tab = 'calendar' | 'reminders' | 'settings'
export const TABS: Tab[] = ['calendar', 'reminders', 'settings']

export interface AuthState {
  user: User | null
  familyId: string | null
  isInitializing: boolean
}
