/**
 * @jest-environment node
 */
import { POST } from '@/app/api/app-invite/route'
import { NextRequest } from 'next/server'

const mockGetAuthenticatedUser = jest.fn()
const mockIsAppAdmin = jest.fn()
const mockFrom = jest.fn()

jest.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: (...args: unknown[]) => mockGetAuthenticatedUser(...args),
  isAppAdmin: (...args: unknown[]) => mockIsAppAdmin(...args),
}))

jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}))

describe('POST /api/app-invite', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue({ id: 'admin-1', email: 'admin@example.com' })
    mockIsAppAdmin.mockResolvedValue(true)
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null }) }),
      }),
      insert: (values: { code: string }) => ({
        select: () => ({
          single: async () => ({ data: { id: 'invite-1', code: values.code }, error: null }),
        }),
      }),
    })
  })

  it('Math.random 없이 8자리 앱 초대 코드를 만든다', async () => {
    const randomSpy = jest.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not generate invite codes')
    })
    try {
      const req = new NextRequest('http://localhost/api/app-invite', { method: 'POST' })
      const res = await POST(req)
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.invite.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
      expect(randomSpy).not.toHaveBeenCalled()
    } finally {
      randomSpy.mockRestore()
    }
  })
})
