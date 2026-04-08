import { renderHook, waitFor } from '@testing-library/react'
import { useFamily } from '@/hooks/useFamily'
import type { User } from '@supabase/supabase-js'

const mockUser = { id: 'user-1', email: 'test@example.com' } as User
const mockPostJsonWithAuth = jest.fn()

jest.mock('@/lib/api-client', () => ({
  postJsonWithAuth: (...args: unknown[]) => mockPostJsonWithAuth(...args),
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockPostJsonWithAuth.mockResolvedValue({ familyId: 'fam-1', appRole: 'member' })
})

describe('useFamily', () => {
  it('user가 null이면 familyId가 null이고 loading은 true로 유지된다', () => {
    const { result } = renderHook(() => useFamily(null))
    expect(result.current.familyId).toBeNull()
    expect(result.current.appRole).toBe('member')
    expect(result.current.loading).toBe(true)
  })

  it('API 성공 시 familyId와 appRole이 설정되고 loading이 false가 된다', async () => {
    const { result } = renderHook(() => useFamily(mockUser))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.familyId).toBe('fam-1')
    expect(result.current.appRole).toBe('member')
    expect(mockPostJsonWithAuth).toHaveBeenCalledWith('/api/family/me')
  })

  it('admin인 경우 appRole이 admin으로 설정된다', async () => {
    mockPostJsonWithAuth.mockResolvedValue({ familyId: 'fam-1', appRole: 'admin' })
    const { result } = renderHook(() => useFamily(mockUser))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.appRole).toBe('admin')
  })

  it('familyId가 null인 경우 (앱 초대 신규 유저) null을 반환한다', async () => {
    mockPostJsonWithAuth.mockResolvedValue({ familyId: null, appRole: 'member' })
    const { result } = renderHook(() => useFamily(mockUser))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.familyId).toBeNull()
  })

  it('API 응답이 ok가 아니면 familyId는 null이다', async () => {
    mockPostJsonWithAuth.mockRejectedValue(new Error('Internal Server Error'))

    const { result } = renderHook(() => useFamily(mockUser))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.familyId).toBeNull()
  })

  it('fetch 예외 발생 시 familyId는 null이다', async () => {
    mockPostJsonWithAuth.mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useFamily(mockUser))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.familyId).toBeNull()
  })

  it('user가 사라지면 familyId를 초기화한다', async () => {
    const { result, rerender } = renderHook(({ user }) => useFamily(user), {
      initialProps: { user: mockUser as User | null },
    })

    await waitFor(() => expect(result.current.familyId).toBe('fam-1'))

    rerender({ user: null })

    expect(result.current.familyId).toBeNull()
    expect(result.current.loading).toBe(true)
  })
})
