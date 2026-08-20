import { useEffect, useState } from 'react'
import { getJsonWithAuth } from '@/lib/api-client'
import type { Holiday } from '@/types/holidays'

/** Test utility: clears the in-memory cache between test cases. */
export function clearHolidayCache() {
  cacheGeneration += 1
  apiCache.clear()
  apiRequests.clear()
}

const apiCache = new Map<string, Holiday[]>()
const apiRequests = new Map<string, Promise<Holiday[]>>()
let cacheGeneration = 0

interface ApiHolidayResult {
  key: string
  holidays: Holiday[]
}

function loadHolidays(cacheKey: string, url: string): Promise<Holiday[]> {
  const cached = apiCache.get(cacheKey)
  if (cached) return Promise.resolve(cached)

  const inFlight = apiRequests.get(cacheKey)
  if (inFlight) return inFlight

  const requestGeneration = cacheGeneration
  const request = getJsonWithAuth<{ holidays?: Holiday[] }>(url)
    .then((body) => Array.isArray(body.holidays) ? body.holidays : [])
    .then((holidays) => {
      if (requestGeneration === cacheGeneration) {
        apiCache.set(cacheKey, holidays)
      }
      return holidays
    })
    .finally(() => {
      if (apiRequests.get(cacheKey) === request) {
        apiRequests.delete(cacheKey)
      }
    })

  apiRequests.set(cacheKey, request)
  return request
}

export function useHolidays(
  year: number,
  month: number,
  countryCodes: string[]
): Holiday[] {
  const countryKey = [...countryCodes].sort().join(',')
  const cacheKey = `${year}-${month}-${countryKey}`
  const [apiResult, setApiResult] = useState<ApiHolidayResult | null>(null)

  useEffect(() => {
    if (!countryKey || apiCache.has(cacheKey)) return

    let cancelled = false
    const params = new URLSearchParams({
      year: String(year),
      month: String(month),
      countries: countryKey,
    })

    loadHolidays(cacheKey, `/api/holidays?${params.toString()}`)
      .then((holidays) => {
        if (!cancelled) setApiResult({ key: cacheKey, holidays })
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [cacheKey, countryKey, month, year])

  if (!countryKey) return []
  return apiCache.get(cacheKey) ?? (apiResult?.key === cacheKey ? apiResult.holidays : [])
}

export type { Holiday }
