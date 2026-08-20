import { act, renderHook, waitFor } from '@testing-library/react'
import { useHolidays, clearHolidayCache } from '@/hooks/useHolidays'
import { getJsonWithAuth } from '@/lib/api-client'
import type { Holiday } from '@/types/holidays'

jest.mock('@/lib/api-client', () => ({
  getJsonWithAuth: jest.fn(),
}))

const mockGetJsonWithAuth = getJsonWithAuth as jest.MockedFunction<typeof getJsonWithAuth>

const krHolidays: Holiday[] = [
  { date: '2026-03-01', localName: '3·1절', countryCode: 'KR' },
  { date: '2026-03-02', localName: '대체공휴일', countryCode: 'KR' },
]

beforeEach(() => {
  clearHolidayCache()
  jest.restoreAllMocks()
  mockGetJsonWithAuth.mockReset()
})

describe('useHolidays', () => {
  it('countryCodes가 빈 배열이면 요청하지 않고 빈 배열을 반환한다', () => {
    const { result } = renderHook(() => useHolidays(2026, 2, []))

    expect(result.current).toEqual([])
    expect(mockGetJsonWithAuth).not.toHaveBeenCalled()
  })

  it('서버 응답 전에는 빈 배열을 반환하고 응답 후 휴일을 반영한다', async () => {
    mockGetJsonWithAuth.mockResolvedValue({ holidays: krHolidays })

    const { result } = renderHook(() => useHolidays(2026, 2, ['KR']))

    expect(result.current).toEqual([])
    await waitFor(() => expect(result.current).toEqual(krHolidays))
    expect(mockGetJsonWithAuth).toHaveBeenCalledWith('/api/holidays?year=2026&month=2&countries=KR')
  })

  it('국가 코드를 정렬해 같은 조합은 하나의 캐시 키와 요청을 사용한다', async () => {
    mockGetJsonWithAuth.mockResolvedValue({ holidays: krHolidays })

    const first = renderHook(() => useHolidays(2026, 2, ['JP', 'KR']))
    await waitFor(() => expect(first.result.current).toEqual(krHolidays))
    first.unmount()

    const second = renderHook(() => useHolidays(2026, 2, ['KR', 'JP']))

    expect(second.result.current).toEqual(krHolidays)
    expect(mockGetJsonWithAuth).toHaveBeenCalledTimes(1)
    expect(mockGetJsonWithAuth).toHaveBeenCalledWith('/api/holidays?year=2026&month=2&countries=JP%2CKR')
  })

  it('동일 범위의 동시 요청을 하나의 in-flight 요청으로 공유한다', async () => {
    let resolveRequest: ((value: { holidays: Holiday[] }) => void) | null = null
    mockGetJsonWithAuth.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve
    }))

    const { result } = renderHook(() => [
      useHolidays(2026, 2, ['KR']),
      useHolidays(2026, 2, ['KR']),
    ])

    expect(mockGetJsonWithAuth).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolveRequest?.({ holidays: krHolidays })
    })
    await waitFor(() => {
      expect(result.current[0]).toEqual(krHolidays)
      expect(result.current[1]).toEqual(krHolidays)
    })
  })

  it('이전 범위의 늦은 응답이 현재 범위 휴일을 덮어쓰지 않는다', async () => {
    let resolveKr: ((value: { holidays: Holiday[] }) => void) | null = null
    let resolveJp: ((value: { holidays: Holiday[] }) => void) | null = null
    const jpHolidays: Holiday[] = [
      { date: '2026-05-03', localName: '憲法記念日', countryCode: 'JP' },
    ]

    mockGetJsonWithAuth.mockImplementation((url) => new Promise((resolve) => {
      if (String(url).includes('countries=KR')) resolveKr = resolve
      else resolveJp = resolve
    }))

    const { result, rerender } = renderHook(
      ({ month, countries }) => useHolidays(2026, month, countries),
      { initialProps: { month: 2, countries: ['KR'] } }
    )

    rerender({ month: 4, countries: ['JP'] })
    await act(async () => {
      resolveJp?.({ holidays: jpHolidays })
    })
    await waitFor(() => expect(result.current).toEqual(jpHolidays))

    await act(async () => {
      resolveKr?.({ holidays: krHolidays })
    })
    expect(result.current).toEqual(jpHolidays)
  })

  it('서버 요청이 실패해도 화면 렌더를 막지 않고 빈 배열을 유지한다', async () => {
    mockGetJsonWithAuth.mockRejectedValue(new Error('network unavailable'))

    const { result } = renderHook(() => useHolidays(2026, 2, ['KR']))

    await waitFor(() => expect(mockGetJsonWithAuth).toHaveBeenCalledTimes(1))
    expect(result.current).toEqual([])
  })
})
