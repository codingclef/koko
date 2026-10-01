/**
 * @jest-environment node
 */
import { POST } from '@/app/api/family/me/route'
import { NextRequest } from 'next/server'

const mockGetAuthenticatedSessionUser = jest.fn()
jest.mock('@/lib/api-auth', () => ({
  getAuthenticatedSessionUser: (...args: unknown[]) => mockGetAuthenticatedSessionUser(...args),
}))

function makeRequest() {
  return new NextRequest('http://localhost/api/family/me', { method: 'POST' })
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  mockGetAuthenticatedSessionUser.mockResolvedValue({
    id: 'user-1', email: 'test@example.com', appRole: 'member', familyId: 'fam-1',
  })
})
afterEach(() => jest.restoreAllMocks())

describe('POST /api/family/me', () => {
  it('현재 접근 권한이 없는 계정은 401을 반환한다', async () => {
    mockGetAuthenticatedSessionUser.mockResolvedValue(null)
    expect((await POST(makeRequest())).status).toBe(401)
  })

  it('현재 계정 조회를 한 번만 수행하고 familyId와 appRole을 반환한다', async () => {
    const req = makeRequest()
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ familyId: 'fam-1', appRole: 'member' })
    expect(mockGetAuthenticatedSessionUser).toHaveBeenCalledTimes(1)
    expect(mockGetAuthenticatedSessionUser).toHaveBeenCalledWith(req)
  })

  it('가족이 없는 허용된 사용자도 정상 응답한다', async () => {
    mockGetAuthenticatedSessionUser.mockResolvedValue({ appRole: 'member', familyId: null })
    expect(await (await POST(makeRequest())).json()).toEqual({ familyId: null, appRole: 'member' })
  })

  it('관리자 역할을 유지한다', async () => {
    mockGetAuthenticatedSessionUser.mockResolvedValue({ appRole: 'admin', familyId: 'fam-1' })
    expect(await (await POST(makeRequest())).json()).toEqual({ familyId: 'fam-1', appRole: 'admin' })
  })

  it('활성 계정이어도 허용 목록에 없으면 401을 반환한다', async () => {
    mockGetAuthenticatedSessionUser.mockResolvedValue({ appRole: null, familyId: 'fam-1' })
    expect((await POST(makeRequest())).status).toBe(401)
  })

  it('현재 계정 조회 오류는 500으로 처리한다', async () => {
    mockGetAuthenticatedSessionUser.mockRejectedValue(new Error('DB unavailable'))
    expect((await POST(makeRequest())).status).toBe(500)
    expect(console.error).toHaveBeenCalledWith('[API /family/me] bootstrap lookup failed:', expect.any(Error))
  })
})
