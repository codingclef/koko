import { renderHook, waitFor } from '@testing-library/react'
import { useAuth } from '@/hooks/useAuth'

const mockGetSession = jest.fn()
const mockOnAuthStateChange = jest.fn()

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
  },
}))

const mockUser = { id: 'user-1', email: 'test@example.com' }
const mockUnsubscribe = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: mockUnsubscribe } },
  })
})

describe('useAuth', () => {
  it('초기 상태는 loading=true, user=null이다', () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const { result } = renderHook(() => useAuth())
    expect(result.current.loading).toBe(true)
    expect(result.current.user).toBeNull()
  })

  it('세션이 있으면 user가 설정된다', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: mockUser } } })
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toEqual(mockUser)
  })

  it('세션이 없으면 user가 null이다', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
  })

  it('getSession 에러 발생 시 loading이 false가 된다', async () => {
    mockGetSession.mockRejectedValue(new Error('network error'))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
  })

  it('onAuthStateChange 콜백으로 user가 업데이트된다', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    let authCallback: ((event: string, session: unknown) => void) | null = null
    mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      authCallback = cb
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } }
    })

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    authCallback!('SIGNED_IN', { user: mockUser })
    await waitFor(() => expect(result.current.user).toEqual(mockUser))
  })

  it('언마운트 시 구독이 해제된다', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const { unmount } = renderHook(() => useAuth())
    await waitFor(() => {})
    unmount()
    expect(mockUnsubscribe).toHaveBeenCalled()
  })
})
