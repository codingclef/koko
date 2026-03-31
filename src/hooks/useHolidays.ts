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

/** Parse an ISO date string (YYYY-MM-DD) as local midnight to avoid UTC offset issues. */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toYMD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const SUBSTITUTE_NAME: Record<string, string> = {
  KR: '대체공휴일',
  JP: '振替休日',
}

/**
 * Calculate substitute holidays for countries whose law grants a replacement
 * weekday when a public holiday falls on Sunday.
 * Applies to KR (대체공휴일) and JP (振替休日).
 */
function calcSubstituteHolidays(holidays: Holiday[]): Holiday[] {
  const substitutes: Holiday[] = []
  const allDates = new Set(holidays.map((h) => h.date))

  for (const holiday of holidays) {
    if (!(holiday.countryCode in SUBSTITUTE_NAME)) continue

    const date = parseLocalDate(holiday.date)
    if (date.getDay() !== 0) continue // only process Sundays

    // Find the next non-holiday weekday
    const candidate = new Date(date)
    candidate.setDate(candidate.getDate() + 1)
    while (allDates.has(toYMD(candidate)) || candidate.getDay() === 0) {
      candidate.setDate(candidate.getDate() + 1)
    }

    const substituteDate = toYMD(candidate)
    if (!allDates.has(substituteDate)) {
      allDates.add(substituteDate) // prevent duplicate substitutes
      substitutes.push({
        date: substituteDate,
        localName: SUBSTITUTE_NAME[holiday.countryCode],
        countryCode: holiday.countryCode,
      })
    }
  }

  return substitutes
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

  const substitutes = calcSubstituteHolidays(holidays)
  const all = [...holidays, ...substitutes]
  cache.set(key, all)
  return all
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
          const d = parseLocalDate(h.date)
          return d.getFullYear() === year && d.getMonth() === month
        })
        setHolidays(filtered)
      })
      .catch(() => setHolidays([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, countryKey])

  return holidays
}
