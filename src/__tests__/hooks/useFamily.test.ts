import { renderHook, waitFor } from '@testing-library/react'
import { useFamily } from '@/hooks/useFamily'
import type { User } from '@supabase/supabase-js'

const mockUser = { id: 'user-1', email: 'test@example.com' } as User

beforeEach(() => {
  jest.clearAllMocks()
})

describe('useFamily', () => {
  it('user가 null이면 familyId가 null이고 loading은 true로 유지된다', () => {
    const { result } = renderHook(() => useFamily(null))
    expect(result.current.familyId).toBeNull()
    expect(result.current.loading).toBe(true)
  })

  it('API 성공 시 familyId가 설정되고 loading이 false가 된다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ familyId: 'fam-1' }),
    } as Response)

    const { result } = renderHook(() => useFamily(mockUser))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.familyId).toBe('fam-1')
    expect(global.fetch).toHaveBeenCalledWith('/api/family', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ userId: 'user-1' }),
    }))
  })

  it('API 응답이 ok가 아니면 familyId는 null이다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      text: async () => 'Internal Server Error',
    } as Response)

    const { result } = renderHook(() => useFamily(mockUser))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.familyId).toBeNull()
  })

  it('fetch 예외 발생 시 familyId는 null이다', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useFamily(mockUser))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.familyId).toBeNull()
  })
})
