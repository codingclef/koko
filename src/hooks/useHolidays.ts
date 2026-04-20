import { useMemo } from 'react'
import Holidays from 'date-holidays'

export interface Holiday {
  date: string        // "2026-03-01"
  localName: string   // "삼일절" or "憲法記念日"
  countryCode: string // "KR" or "JP"
}

const COUNTRY_LANGUAGE: Record<string, string> = {
  KR: 'ko',
  JP: 'ja',
}

// date-holidays does not calculate substitute holidays for these countries.
// Custom logic is applied after fetching base holidays.
const NEEDS_CUSTOM_SUBSTITUTE = new Set(['KR'])

const SUBSTITUTE_NAME: Record<string, string> = {
  KR: '대체공휴일',
  JP: '振替休日',
}

// In-memory cache keyed by `${year}-${countryCode}`.
// Holiday rules for a given year are stable, so no invalidation is needed.
const cache = new Map<string, Holiday[]>()

/** Test utility: clears the in-memory cache between test cases. */
export function clearHolidayCache() {
  cache.clear()
}

function toYMD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Calculate substitute holidays for KR (대체공휴일).
 * date-holidays does not include KR substitutes, so we derive them:
 * when a public holiday falls on Sunday, the next non-holiday weekday
 * (Mon–Sat excluded) becomes the substitute.
 */
function calcKrSubstituteHolidays(holidays: Holiday[]): Holiday[] {
  const substitutes: Holiday[] = []
  const allDates = new Set(holidays.map((h) => h.date))

  for (const holiday of holidays) {
    const date = new Date(`${holiday.date}T00:00:00`)
    if (date.getDay() !== 0) continue // only Sundays trigger a substitute

    const candidate = new Date(date)
    candidate.setDate(candidate.getDate() + 1)
    while (
      allDates.has(toYMD(candidate)) ||
      candidate.getDay() === 0 ||
      candidate.getDay() === 6
    ) {
      candidate.setDate(candidate.getDate() + 1)
    }

    const substituteDate = toYMD(candidate)
    if (!allDates.has(substituteDate)) {
      allDates.add(substituteDate) // prevent duplicate substitutes
      substitutes.push({
        date: substituteDate,
        localName: SUBSTITUTE_NAME.KR,
        countryCode: holiday.countryCode,
      })
    }
  }

  return substitutes
}

function getYearHolidays(year: number, countryCode: string): Holiday[] {
  const key = `${year}-${countryCode}`
  if (cache.has(key)) return cache.get(key)!

  const lang = COUNTRY_LANGUAGE[countryCode] ?? 'en'
  const hd = new Holidays(countryCode, { languages: [lang] })
  const holidays: Holiday[] = hd.getHolidays(year)
    .filter((h) => h.type === 'public')
    .map((h) => ({
      date: h.date.slice(0, 10),
      // date-holidays returns substitute names as "原日名 (振替休日)" — normalize to just the substitute label
      localName: h.substitute
        ? (SUBSTITUTE_NAME[countryCode] ?? h.name)
        : h.name,
      countryCode,
    }))

  if (NEEDS_CUSTOM_SUBSTITUTE.has(countryCode)) {
    holidays.push(...calcKrSubstituteHolidays(holidays))
  }

  cache.set(key, holidays)
  return holidays
}

export function useHolidays(
  year: number,
  month: number,
  countryCodes: string[]
): Holiday[] {
  const countryKey = [...countryCodes].sort().join(',')
  return useMemo(() => {
    if (!countryKey) return []

    const prevYear  = month === 0  ? year - 1 : year
    const prevMonth = month === 0  ? 11       : month - 1
    const nextYear  = month === 11 ? year + 1 : year
    const nextMonth = month === 11 ? 0        : month + 1

    const years = [...new Set([prevYear, year, nextYear])]
    const codes = countryKey.split(',')

    return codes
      .flatMap((cc) => years.flatMap((y) => getYearHolidays(y, cc)))
      .filter((h) => {
        const [y, m] = h.date.split('-').map(Number)
        const hMonth = m - 1
        return (
          (y === prevYear && hMonth === prevMonth) ||
          (y === year     && hMonth === month)     ||
          (y === nextYear && hMonth === nextMonth)
        )
      })
  }, [year, month, countryKey])
}
