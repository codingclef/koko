import { useEffect, useMemo, useState } from 'react'
import {
  clearFallbackHolidayCache,
  getFallbackHolidaysForRange,
  type Holiday,
} from '@/lib/holidays'
import { getJsonWithAuth } from '@/lib/api-client'

/** Test utility: clears the in-memory cache between test cases. */
export function clearHolidayCache() {
  clearFallbackHolidayCache()
  apiCache.clear()
}

const apiCache = new Map<string, Holiday[]>()
interface ApiHolidayResult {
  key: string
  holidays: Holiday[]
}

export function useHolidays(
  year: number,
  month: number,
  countryCodes: string[]
): Holiday[] {
  const countryKey = [...countryCodes].sort().join(',')
  const fallbackHolidays = useMemo(() => {
    if (!countryKey) return []
    return getFallbackHolidaysForRange(year, month, countryKey.split(','))
  }, [year, month, countryKey])

  const cacheKey = `${year}-${month}-${countryKey}`
  const [apiResult, setApiResult] = useState<ApiHolidayResult | null>(null)

  useEffect(() => {
    if (!countryKey || apiCache.has(cacheKey)) return

    const controller = new AbortController()
    const params = new URLSearchParams({
      year: String(year),
      month: String(month),
      countries: countryKey,
    })

    getJsonWithAuth<{ holidays?: Holiday[] }>(`/api/holidays?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((body) => {
        const nextHolidays = Array.isArray(body.holidays) ? body.holidays : fallbackHolidays
        apiCache.set(cacheKey, nextHolidays)
        setApiResult({ key: cacheKey, holidays: nextHolidays })
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
      })

    return () => controller.abort()
  }, [cacheKey, countryKey, fallbackHolidays, month, year])

  return apiCache.get(cacheKey) ?? (apiResult?.key === cacheKey ? apiResult.holidays : fallbackHolidays)
}

export type { Holiday }
