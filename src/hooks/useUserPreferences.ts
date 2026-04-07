import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getUserPreferences, upsertUserPreferences, persistTheme, type AppTheme, type UserPreferences } from '@/lib/preferences'

export function useUserPreferences(user: User | null) {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async (userId: string) => {
    try {
      const data = await getUserPreferences(userId)
      setPreferences(data)
      if (data?.app_theme) persistTheme(data.app_theme as AppTheme)
    } catch {
      setPreferences(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    load(user.id)
  }, [user])

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
