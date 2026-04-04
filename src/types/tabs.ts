import type { User } from '@supabase/supabase-js'

export interface AuthState {
  user: User | null
  familyId: string | null
  isInitializing: boolean
}
