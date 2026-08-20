'use client'

import { getCalendars, type Calendar } from '@/lib/calendar'
import { useAsyncData } from '@/hooks/useAsyncData'
import { useState } from 'react'

export function useCalendars(familyId: string | null) {
  const [errorFamilyId, setErrorFamilyId] = useState<string | null>(null)
  const { value, loading, error, reload } = useAsyncData<{
    familyId: string | null
    calendars: Calendar[]
  }>({
    enabled: Boolean(familyId),
    initialValue: { familyId: null, calendars: [] },
    reloadKey: familyId,
    load: async () => ({
      familyId,
      calendars: await getCalendars(familyId!),
    }),
    onSuccess: () => {
      setErrorFamilyId(null)
    },
    onError: (e) => {
      setErrorFamilyId(familyId)
      console.error('[useCalendars] fetch failed:', e)
    },
  })

  const hasCurrentFamilyData = Boolean(familyId) && value.familyId === familyId
  const currentError = errorFamilyId === familyId ? error : null

  return {
    calendars: hasCurrentFamilyData ? value.calendars : [],
    loading: familyId
      ? loading || (!hasCurrentFamilyData && !currentError)
      : true,
    error: currentError,
    reload,
  }
}
