import { useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { getUserPreferences, upsertUserPreferences, persistTheme, type AppTheme, type UserPreferences } from '@/lib/preferences'
import { useAsyncData } from '@/hooks/useAsyncData'

export function useUserPreferences(user: User | null) {
  const {
    value: preferences,
    setValue: setPreferences,
    loading,
  } = useAsyncData<UserPreferences | null>({
    enabled: Boolean(user),
    initialValue: null,
    load: () => getUserPreferences(user!.id),
    onSuccess: (data) => {
      if (data?.app_theme) persistTheme(data.app_theme as AppTheme)
    },
  })

  const updatePreferences = useCallback(
    async (updates: Partial<Omit<UserPreferences, 'user_id' | 'created_at' | 'updated_at'>>) => {
      if (!user) return
      const updated = await upsertUserPreferences(user.id, updates)
      setPreferences(updated)
      if (updated.app_theme) persistTheme(updated.app_theme as AppTheme)
    },
    [user]
  )

  return { preferences, loading, updatePreferences }
}
