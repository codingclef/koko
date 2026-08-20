import { renderHook, waitFor } from '@testing-library/react'
import { useCalendars } from '@/hooks/useCalendars'
import * as calendarLib from '@/lib/calendar'
import type { Calendar } from '@/lib/calendar'

jest.mock('@/lib/calendar', () => ({
  getCalendars: jest.fn(),
}))

const mockGetCalendars = calendarLib.getCalendars as jest.MockedFunction<typeof calendarLib.getCalendars>

beforeEach(() => {
  jest.clearAllMocks()
})

describe('useCalendars', () => {
  it('familyId가 없으면 로딩 상태를 유지한다', () => {
    const { result } = renderHook(() => useCalendars(null))
    expect(result.current.loading).toBe(true)
    expect(result.current.calendars).toEqual([])
  })

  it('familyId가 있으면 캘린더를 로드한다', async () => {
    const mockData = [{ id: 'cal-1', name: '가족', color: '#f97316', family_id: 'fam-1', created_by: 'user-1', created_at: '', updated_at: '' }]
    mockGetCalendars.mockResolvedValue(mockData)

    const { result } = renderHook(() => useCalendars('fam-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.calendars).toEqual(mockData)
    expect(mockGetCalendars).toHaveBeenCalledWith('fam-1')
  })

  it('fetch 실패 시 빈 배열을 유지한다', async () => {
    mockGetCalendars.mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useCalendars('fam-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.calendars).toEqual([])
  })

  it('reload를 호출하면 다시 fetch한다', async () => {
    mockGetCalendars.mockResolvedValue([])

    const { result } = renderHook(() => useCalendars('fam-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockGetCalendars.mockResolvedValue([
      { id: 'cal-2', name: '개인', color: '#3b82f6', family_id: 'fam-1', created_by: 'user-1', created_at: '', updated_at: '' },
    ])

    result.current.reload()
    await waitFor(() => expect(result.current.calendars).toHaveLength(1))
    expect(mockGetCalendars).toHaveBeenCalledTimes(2)
  })

  it('familyId가 사라지면 캘린더를 초기화한다', async () => {
    const mockData = [{ id: 'cal-1', name: '가족', color: '#f97316', family_id: 'fam-1', created_by: 'user-1', created_at: '', updated_at: '' }]
    mockGetCalendars.mockResolvedValue(mockData)

    const { result, rerender } = renderHook(({ familyId }) => useCalendars(familyId), {
      initialProps: { familyId: 'fam-1' as string | null },
    })

    await waitFor(() => expect(result.current.calendars).toEqual(mockData))

    rerender({ familyId: null })

    expect(result.current.calendars).toEqual([])
    expect(result.current.loading).toBe(true)
  })

  it('가족 전환 직후에는 이전 가족 캘린더를 노출하지 않는다', async () => {
    const firstFamilyCalendars = [{ id: 'cal-1', name: '가족 1', color: '#f97316', family_id: 'fam-1', created_by: 'user-1', created_at: '', updated_at: '' }]
    const secondFamilyCalendars = [{ id: 'cal-2', name: '가족 2', color: '#3b82f6', family_id: 'fam-2', created_by: 'user-2', created_at: '', updated_at: '' }]
    let resolveSecond: (value: typeof firstFamilyCalendars) => void = () => undefined

    mockGetCalendars.mockImplementation((familyId) => {
      if (familyId === 'fam-1') return Promise.resolve(firstFamilyCalendars)
      return new Promise((resolve) => {
        resolveSecond = resolve
      })
    })

    const { result, rerender } = renderHook(({ familyId }) => useCalendars(familyId), {
      initialProps: { familyId: 'fam-1' as string | null },
    })
    await waitFor(() => expect(result.current.calendars).toEqual(firstFamilyCalendars))

    rerender({ familyId: 'fam-2' })
    expect(result.current.calendars).toEqual([])
    expect(result.current.loading).toBe(true)

    resolveSecond(secondFamilyCalendars)
    await waitFor(() => expect(result.current.calendars).toEqual(secondFamilyCalendars))
  })

  it('가족 전환 직후에는 이전 가족의 로드 오류를 노출하지 않는다', async () => {
    let resolveSecond: (value: Calendar[]) => void = () => undefined
    mockGetCalendars.mockImplementation((familyId) => {
      if (familyId === 'fam-1') return Promise.reject(new Error('family 1 failed'))
      return new Promise((resolve) => {
        resolveSecond = resolve
      })
    })

    const { result, rerender } = renderHook(({ familyId }) => useCalendars(familyId), {
      initialProps: { familyId: 'fam-1' },
    })
    await waitFor(() => expect(result.current.error).toEqual(expect.any(Error)))

    rerender({ familyId: 'fam-2' })
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(true)

    resolveSecond([])
    await waitFor(() => expect(result.current.loading).toBe(false))
  })
})
