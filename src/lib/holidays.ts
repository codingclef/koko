import Holidays from 'date-holidays'

export interface Holiday {
  date: string
  localName: string
  countryCode: string
}

const COUNTRY_LANGUAGE: Record<string, string> = {
  KR: 'ko',
  JP: 'ja',
}

const NEEDS_CUSTOM_SUBSTITUTE = new Set(['KR'])

const SUBSTITUTE_NAME: Record<string, string> = {
  KR: '대체공휴일',
  JP: '振替休日',
}

const DISPLAY_NAME_ALIAS: Record<string, string> = {
  기독탄신일: '크리스마스',
}

const fallbackCache = new Map<string, Holiday[]>()

export function clearFallbackHolidayCache() {
  fallbackCache.clear()
}

export function normalizeHolidayName(name: string): string {
  return DISPLAY_NAME_ALIAS[name] ?? name
}

export function toYMD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function calcKrSubstituteHolidays(holidays: Holiday[]): Holiday[] {
  const substitutes: Holiday[] = []
  const allDates = new Set(holidays.map((h) => h.date))

  for (const holiday of holidays) {
    const date = new Date(`${holiday.date}T00:00:00`)
    if (date.getDay() !== 0) continue

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
      allDates.add(substituteDate)
      substitutes.push({
        date: substituteDate,
        localName: SUBSTITUTE_NAME.KR,
        countryCode: holiday.countryCode,
      })
    }
  }

  return substitutes
}

export function getFallbackYearHolidays(year: number, countryCode: string): Holiday[] {
  const key = `${year}-${countryCode}`
  if (fallbackCache.has(key)) return fallbackCache.get(key)!

  const lang = COUNTRY_LANGUAGE[countryCode] ?? 'en'
  const hd = new Holidays(countryCode, { languages: [lang] })
  const holidays: Holiday[] = hd.getHolidays(year)
    .filter((h) => h.type === 'public')
    .map((h) => ({
      date: h.date.slice(0, 10),
      localName: normalizeHolidayName(
        h.substitute ? (SUBSTITUTE_NAME[countryCode] ?? h.name) : h.name
      ),
      countryCode,
    }))

  if (NEEDS_CUSTOM_SUBSTITUTE.has(countryCode)) {
    holidays.push(...calcKrSubstituteHolidays(holidays))
  }

  fallbackCache.set(key, holidays)
  return holidays
}

export function getAdjacentMonths(year: number, month: number) {
  const prevYear = month === 0 ? year - 1 : year
  const prevMonth = month === 0 ? 11 : month - 1
  const nextYear = month === 11 ? year + 1 : year
  const nextMonth = month === 11 ? 0 : month + 1

  return { prevYear, prevMonth, nextYear, nextMonth }
}

export function filterHolidaysForAdjacentMonths(
  holidays: Holiday[],
  year: number,
  month: number
): Holiday[] {
  const { prevYear, prevMonth, nextYear, nextMonth } = getAdjacentMonths(year, month)

  return holidays.filter((h) => {
    const [y, m] = h.date.split('-').map(Number)
    const hMonth = m - 1
    return (
      (y === prevYear && hMonth === prevMonth) ||
      (y === year && hMonth === month) ||
      (y === nextYear && hMonth === nextMonth)
    )
  })
}

export function getFallbackHolidaysForRange(
  year: number,
  month: number,
  countryCodes: string[]
): Holiday[] {
  const { prevYear, nextYear } = getAdjacentMonths(year, month)
  const years = [...new Set([prevYear, year, nextYear])]

  return filterHolidaysForAdjacentMonths(
    countryCodes.flatMap((cc) => years.flatMap((y) => getFallbackYearHolidays(y, cc))),
    year,
    month
  )
}
