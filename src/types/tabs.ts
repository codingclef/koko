import type { User } from '@supabase/supabase-js'

export type Tab = 'calendar' | 'shopping' | 'settings'
export const TABS: Tab[] = ['calendar', 'shopping', 'settings']

export interface AuthState {
  user: User | null
  familyId: string | null
  isInitializing: boolean
}
