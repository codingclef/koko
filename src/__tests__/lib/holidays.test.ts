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

  it('KR 일요일 공휴일의 대체공휴일을 계산한다', () => {
    const holidays = getFallbackHolidaysForRange(2026, 2, ['KR'])

    expect(holidays).toContainEqual(expect.objectContaining({
      date: '2026-03-01',
      countryCode: 'KR',
    }))
    expect(holidays).toContainEqual(expect.objectContaining({
      date: '2026-03-02',
      localName: '대체공휴일',
      countryCode: 'KR',
    }))
  })

  it('JP 연속 휴일 뒤 대체공휴일을 계산한다', () => {
    const holidays = getFallbackHolidaysForRange(2026, 4, ['JP'])

    expect(holidays).toContainEqual(expect.objectContaining({ date: '2026-05-03', localName: '憲法記念日' }))
    expect(holidays).toContainEqual(expect.objectContaining({ date: '2026-05-04', localName: 'みどりの日' }))
    expect(holidays).toContainEqual(expect.objectContaining({ date: '2026-05-05', localName: 'こどもの日' }))
    expect(holidays).toContainEqual(expect.objectContaining({ date: '2026-05-06', localName: '振替休日' }))
  })

  it('캘린더 그리드에 필요한 인접 월과 연도 경계 휴일을 포함한다', () => {
    const may = getFallbackHolidaysForRange(2026, 4, ['JP'])
    const january = getFallbackHolidaysForRange(2026, 0, ['KR'])
    const december = getFallbackHolidaysForRange(2025, 11, ['JP'])

    expect(may).toContainEqual(expect.objectContaining({ date: '2026-04-29', localName: '昭和の日' }))
    expect(january).toContainEqual(expect.objectContaining({ date: '2025-12-25', localName: '크리스마스' }))
    expect(december).toContainEqual(expect.objectContaining({ date: '2026-01-01' }))
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
