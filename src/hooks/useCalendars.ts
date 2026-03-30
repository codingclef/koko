'use client'

import { useEffect, useState } from 'react'
import { getCalendars, type Calendar } from '@/lib/calendar'

export function useCalendars(familyId: string | null) {
  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = async (fid: string) => {
    try {
      const data = await getCalendars(fid)
      setCalendars(data)
    } catch (e) {
      console.error('[useCalendars] fetch failed:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!familyId) return
    refresh(familyId)
  }, [familyId])

  return {
    calendars,
    loading,
    reload: () => { if (familyId) refresh(familyId) },
  }
}
