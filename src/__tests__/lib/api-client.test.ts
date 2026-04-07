import { ApiClientError, getAuthHeaders, postJson, postJsonWithAuth } from '@/lib/api-client'

const mockGetSession = jest.fn()

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({
    data: {
      session: {
        access_token: 'token-123',
      },
    },
  })
})

describe('getAuthHeaders', () => {
  it('세션 access token으로 Authorization 헤더를 만든다', async () => {
    await expect(getAuthHeaders()).resolves.toEqual({
      Authorization: 'Bearer token-123',
    })
  })

  it('세션이 없으면 에러를 던진다', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    await expect(getAuthHeaders()).rejects.toThrow('No active session')
  })
})

describe('postJson', () => {
  it('JSON POST 요청을 보내고 응답 body를 반환한다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ familyId: 'fam-1' }),
    } as Response)

    await expect(postJson<{ familyId: string }>('/api/family', { test: true })).resolves.toEqual({
      familyId: 'fam-1',
    })

    expect(global.fetch).toHaveBeenCalledWith('/api/family', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true }),
    })
  })

  it('JSON 에러 응답은 ApiClientError로 변환한다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Unauthorized' }),
      text: async () => '',
    } as unknown as Response)

    await expect(postJson('/api/family')).rejects.toEqual(
      new ApiClientError('Unauthorized', 401)
    )
  })
})

describe('postJsonWithAuth', () => {
  it('Authorization 헤더를 포함해 요청한다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response)

    await postJsonWithAuth('/api/family/join', { inviteCode: 'ABC123' })

    expect(global.fetch).toHaveBeenCalledWith('/api/family/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-123',
      },
      body: JSON.stringify({ inviteCode: 'ABC123' }),
    })
  })
})
