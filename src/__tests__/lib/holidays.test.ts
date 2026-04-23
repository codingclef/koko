import {
  getFallbackHolidaysForRange,
  normalizeHolidayName,
} from '@/lib/holidays'
import { getKasiApiKeyExpiryWarning, normalizeKasiServiceKey } from '@/lib/kasi-holidays'

describe('holiday helpers', () => {
  it('기독탄신일 표시명을 크리스마스로 정규화한다', () => {
    expect(normalizeHolidayName('기독탄신일')).toBe('크리스마스')
  })

  it('fallback 휴일도 표시명 alias를 적용한다', () => {
    const holidays = getFallbackHolidaysForRange(2026, 0, ['KR'])
    const christmas = holidays.find((h) => h.date === '2025-12-25')
    expect(christmas?.localName).toBe('크리스마스')
  })

  it('API 키 만료 90일 이내이면 경고 문구를 반환한다', () => {
    const warning = getKasiApiKeyExpiryWarning(
      '2028-04-23',
      new Date('2028-01-24T00:00:00Z')
    )
    expect(warning).toContain('2028-04-23')
    expect(warning).toContain('90 days left')
  })

  it('API 키 만료까지 90일보다 많이 남으면 경고하지 않는다', () => {
    expect(getKasiApiKeyExpiryWarning(
      '2028-04-23',
      new Date('2028-01-23T00:00:00Z')
    )).toBeNull()
  })

  it('URL-encoded KASI 인증키는 한 번 decode한다', () => {
    expect(normalizeKasiServiceKey('abc%2Bdef%3D')).toBe('abc+def=')
  })
})
