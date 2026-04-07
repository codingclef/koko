'use client'

import { getCalendars, type Calendar } from '@/lib/calendar'
import { useAsyncData } from '@/hooks/useAsyncData'

export function useCalendars(familyId: string | null) {
  const { value: calendars, loading, error, reload } = useAsyncData<Calendar[]>({
    enabled: Boolean(familyId),
    initialValue: [],
    reloadKey: familyId,
    load: () => getCalendars(familyId!),
    onError: (e) => {
      console.error('[useCalendars] fetch failed:', e)
    },
  })

  return {
    calendars,
    loading,
    error,
    reload,
  }
}
