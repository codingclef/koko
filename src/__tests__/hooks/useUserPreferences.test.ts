import { renderHook, act, waitFor } from '@testing-library/react'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import * as preferencesLib from '@/lib/preferences'
import { THEME_STORAGE_KEY } from '@/lib/preferences'
import type { User } from '@supabase/supabase-js'

jest.mock('@/lib/preferences', () => ({
  getUserPreferences: jest.fn(),
  upsertUserPreferences: jest.fn(),
  THEME_STORAGE_KEY: 'koko_theme',
  persistTheme: jest.fn(),
}))

const mockGetUserPreferences = preferencesLib.getUserPreferences as jest.MockedFunction<
  typeof preferencesLib.getUserPreferences
>
const mockUpsertUserPreferences = preferencesLib.upsertUserPreferences as jest.MockedFunction<
  typeof preferencesLib.upsertUserPreferences
>
const mockPersistTheme = preferencesLib.persistTheme as jest.MockedFunction<
  typeof preferencesLib.persistTheme
>

const mockUser = { id: 'user-1' } as User

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
})

describe('useUserPreferences', () => {
  it('user가 없으면 fetch하지 않고 preferences=null을 유지한다', () => {
    // useCalendars와 동일하게 user가 없으면 loading은 true 유지 (fetch 미실행)
    const { result } = renderHook(() => useUserPreferences(null))
    expect(result.current.preferences).toBeNull()
    expect(mockGetUserPreferences).not.toHaveBeenCalled()
  })

  it('user가 있으면 preferences를 로드한다', async () => {
    const mockData = {
      user_id: 'user-1',
      holiday_countries: ['KR', 'JP'],
      app_theme: 'tangerine',
      show_lunar: false,
      created_at: '',
      updated_at: '',
    }
    mockGetUserPreferences.mockResolvedValue(mockData)

    const { result } = renderHook(() => useUserPreferences(mockUser))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.preferences).toEqual(mockData)
    expect(mockGetUserPreferences).toHaveBeenCalledWith('user-1')
  })

  it('설정이 없으면 (null 반환) preferences=null을 유지한다', async () => {
    mockGetUserPreferences.mockResolvedValue(null)

    const { result } = renderHook(() => useUserPreferences(mockUser))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.preferences).toBeNull()
  })

  it('fetch 실패 시 preferences=null을 유지한다', async () => {
    mockGetUserPreferences.mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useUserPreferences(mockUser))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.preferences).toBeNull()
  })

  it('updatePreferences 호출 시 upsert 후 state를 갱신한다', async () => {
    mockGetUserPreferences.mockResolvedValue(null)
    const updated = {
      user_id: 'user-1',
      holiday_countries: ['KR'],
      app_theme: 'tangerine',
      show_lunar: false,
      created_at: '',
      updated_at: '',
    }
    mockUpsertUserPreferences.mockResolvedValue(updated)

    const { result } = renderHook(() => useUserPreferences(mockUser))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updatePreferences({ holiday_countries: ['KR'] })
    })

    expect(mockUpsertUserPreferences).toHaveBeenCalledWith('user-1', { holiday_countries: ['KR'] })
    expect(result.current.preferences).toEqual(updated)
  })

  it('preferences 로드 시 persistTheme을 호출한다', async () => {
    const mockData = {
      user_id: 'user-1',
      holiday_countries: ['KR'],
      app_theme: 'ocean',
      show_lunar: false,
      created_at: '',
      updated_at: '',
    }
    mockGetUserPreferences.mockResolvedValue(mockData)

    const { result } = renderHook(() => useUserPreferences(mockUser))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockPersistTheme).toHaveBeenCalledWith('ocean')
  })

  it('app_theme이 없는 preferences 로드 시 persistTheme을 호출하지 않는다', async () => {
    mockGetUserPreferences.mockResolvedValue(null)

    const { result } = renderHook(() => useUserPreferences(mockUser))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockPersistTheme).not.toHaveBeenCalled()
  })

  it('updatePreferences 후 persistTheme을 호출한다', async () => {
    mockGetUserPreferences.mockResolvedValue(null)
    const updated = {
      user_id: 'user-1',
      holiday_countries: ['KR'],
      app_theme: 'violet',
      show_lunar: false,
      created_at: '',
      updated_at: '',
    }
    mockUpsertUserPreferences.mockResolvedValue(updated)

    const { result } = renderHook(() => useUserPreferences(mockUser))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updatePreferences({ app_theme: 'violet' })
    })

    expect(mockPersistTheme).toHaveBeenCalledWith('violet')
  })

  it('user가 없을 때 updatePreferences를 호출해도 upsert하지 않는다', async () => {
    const { result } = renderHook(() => useUserPreferences(null))

    await act(async () => {
      await result.current.updatePreferences({ holiday_countries: ['KR'] })
    })

    expect(mockUpsertUserPreferences).not.toHaveBeenCalled()
  })
})
