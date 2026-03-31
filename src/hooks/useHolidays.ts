import { useEffect, useState } from 'react'

export interface Holiday {
  date: string        // "2026-03-01"
  localName: string   // "삼일절" or "春分の日"
  countryCode: string // "KR" or "JP"
}

interface NagerHoliday {
  date: string
  localName: string
  name: string
  countryCode: string
  types: string[]
}

// In-memory cache keyed by `${year}-${countryCode}`.
// Holidays for a given year are stable, so no invalidation is needed.
const cache = new Map<string, Holiday[]>()

/** Test utility: clears the in-memory cache between test cases. */
export function clearHolidayCache() {
  cache.clear()
}

async function fetchYearHolidays(year: number, countryCode: string): Promise<Holiday[]> {
  const key = `${year}-${countryCode}`
  if (cache.has(key)) return cache.get(key)!

  const res = await fetch(
    `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`
  )
  if (!res.ok) return []

  const data: NagerHoliday[] = await res.json()
  const holidays: Holiday[] = data.map((h) => ({
    date: h.date,
    localName: h.localName,
    countryCode: h.countryCode,
  }))
  cache.set(key, holidays)
  return holidays
}

export function useHolidays(
  year: number,
  month: number,
  countryCodes: string[]
): Holiday[] {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const countryKey = countryCodes.join(',')

  useEffect(() => {
    if (countryCodes.length === 0) {
      setHolidays([])
      return
    }

    Promise.all(countryCodes.map((cc) => fetchYearHolidays(year, cc)))
      .then((results) => {
        const filtered = results.flat().filter((h) => {
          const d = new Date(h.date)
          return d.getFullYear() === year && d.getMonth() === month
        })
        setHolidays(filtered)
      })
      .catch(() => setHolidays([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, countryKey])

  return holidays
}
