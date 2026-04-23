import {
  filterHolidaysForAdjacentMonths,
  getAdjacentMonths,
  getFallbackHolidaysForRange,
  normalizeHolidayName,
  type Holiday,
} from '@/lib/holidays'

const KASI_ENDPOINT =
  'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo'

let hasWarnedAboutKeyExpiry = false
const kasiYearCache = new Map<number, Promise<Holiday[]>>()

export function clearKasiHolidayCache() {
  kasiYearCache.clear()
  hasWarnedAboutKeyExpiry = false
}

interface KasiHolidayItem {
  dateName?: unknown
  isHoliday?: unknown
  locdate?: unknown
}

interface KasiHolidayResponse {
  response?: {
    header?: {
      resultCode?: unknown
      resultMsg?: unknown
    }
    body?: {
      items?: {
        item?: KasiHolidayItem | KasiHolidayItem[]
      }
    }
  }
}

export function getKasiApiKeyExpiryWarning(
  expiresAt: string | undefined,
  now = new Date()
): string | null {
  if (!expiresAt) return null

  const expiry = new Date(`${expiresAt}T00:00:00Z`)
  if (Number.isNaN(expiry.getTime())) {
    return 'KASI_HOLIDAY_API_KEY_EXPIRES_AT is invalid. Use YYYY-MM-DD.'
  }

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const daysLeft = Math.ceil((expiry.getTime() - today) / 86_400_000)

  if (daysLeft < 0) {
    return `KASI holiday API key expired on ${expiresAt}.`
  }

  if (daysLeft <= 90) {
    return `KASI holiday API key expires on ${expiresAt} (${daysLeft} days left).`
  }

  return null
}

function warnIfKasiApiKeyExpiring() {
  if (hasWarnedAboutKeyExpiry) return

  const warning = getKasiApiKeyExpiryWarning(process.env.KASI_HOLIDAY_API_KEY_EXPIRES_AT)
  if (warning) {
    hasWarnedAboutKeyExpiry = true
    console.warn(warning)
  }
}

function normalizeLocdate(locdate: unknown): string | null {
  const raw = String(locdate ?? '')
  if (!/^\d{8}$/.test(raw)) return null
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

function normalizeKasiItems(raw: KasiHolidayItem | KasiHolidayItem[] | undefined): KasiHolidayItem[] {
  if (!raw) return []
  return Array.isArray(raw) ? raw : [raw]
}

export function normalizeKasiServiceKey(key: string): string {
  if (!/%[0-9A-Fa-f]{2}/.test(key)) return key

  try {
    return decodeURIComponent(key)
  } catch {
    return key
  }
}

async function fetchKasiYearHolidaysUncached(year: number): Promise<Holiday[]> {
  const rawKey = process.env.KASI_HOLIDAY_API_KEY
  if (!rawKey) throw new Error('KASI_HOLIDAY_API_KEY is not configured')
  const key = normalizeKasiServiceKey(rawKey)

  warnIfKasiApiKeyExpiring()

  const url = new URL(KASI_ENDPOINT)
  url.searchParams.set('ServiceKey', key)
  url.searchParams.set('solYear', String(year))
  url.searchParams.set('numOfRows', '100')
  url.searchParams.set('_type', 'json')

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`KASI holiday API failed with status ${response.status}`)
  }

  const data = await response.json() as KasiHolidayResponse
  const header = data.response?.header
  if (header?.resultCode !== '00') {
    throw new Error(`KASI holiday API error: ${String(header?.resultMsg ?? 'unknown')}`)
  }

  return normalizeKasiItems(data.response?.body?.items?.item)
    .filter((item) => item.isHoliday === 'Y')
    .map((item) => {
      const date = normalizeLocdate(item.locdate)
      const name = typeof item.dateName === 'string' ? item.dateName : ''
      if (!date || !name) return null
      return {
        date,
        localName: normalizeHolidayName(name),
        countryCode: 'KR',
      }
    })
    .filter((item): item is Holiday => item !== null)
}

export async function fetchKasiYearHolidays(year: number): Promise<Holiday[]> {
  const cached = kasiYearCache.get(year)
  if (cached) return cached

  const request = fetchKasiYearHolidaysUncached(year).catch((error) => {
    kasiYearCache.delete(year)
    throw error
  })
  kasiYearCache.set(year, request)
  return request
}

export async function getHolidaysForRange(
  year: number,
  month: number,
  countryCodes: string[]
): Promise<Holiday[]> {
  const uniqueCountryCodes = [...new Set(countryCodes)]
  const fallbackCountryCodes = uniqueCountryCodes.filter((cc) => cc !== 'KR')
  const holidays = getFallbackHolidaysForRange(year, month, fallbackCountryCodes)

  if (uniqueCountryCodes.includes('KR')) {
    try {
      const { prevYear, nextYear } = getAdjacentMonths(year, month)
      const years = [...new Set([prevYear, year, nextYear])]
      const krHolidays = (await Promise.all(years.map(fetchKasiYearHolidays))).flat()
      holidays.push(...filterHolidaysForAdjacentMonths(krHolidays, year, month))
    } catch (error) {
      console.warn('Falling back to local KR holiday rules.', error)
      holidays.push(...getFallbackHolidaysForRange(year, month, ['KR']))
    }
  }

  return holidays.sort((a, b) => a.date.localeCompare(b.date) || a.countryCode.localeCompare(b.countryCode))
}
