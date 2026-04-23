import { render, screen, waitFor } from '@testing-library/react'
import AuthCallbackPage from '@/app/auth/callback/page'

const mockReplace = jest.fn()
let mockErrorParam: string | null = null
let mockNextParam: string | null = null

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === 'error') return mockErrorParam
      if (key === 'next') return mockNextParam
      return null
    },
  }),
}))

const mockGetSession = jest.fn()
const mockOnAuthStateChange = jest.fn()
const mockSignOut = jest.fn()

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
  },
}))

const mockParseInviteCodeFromNext = jest.fn()

jest.mock('@/lib/auth', () => ({
  parseInviteCodeFromNext: (...args: unknown[]) => mockParseInviteCodeFromNext(...args),
}))

const mockPostJsonWithAuth = jest.fn()

jest.mock('@/lib/api-client', () => ({
  postJsonWithAuth: (...args: unknown[]) => mockPostJsonWithAuth(...args),
}))

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockErrorParam = null
    mockNextParam = null
    mockParseInviteCodeFromNext.mockReturnValue(null)
    mockPostJsonWithAuth.mockResolvedValue({ allowed: true, needsOnboarding: false })
    mockGetSession.mockResolvedValue({
      data: { session: { user: { email: 'test@example.com' } } },
    })
    mockOnAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: jest.fn(),
        },
      },
    })
  })

  it('callback 전이 단계에서는 시각적 splash를 렌더링하지 않는다', () => {
    render(<AuthCallbackPage />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('앱 초대 next에서는 appInviteCode만 check-allowed에 보낸다', async () => {
    mockNextParam = '/join-app?code=APP12345'
    mockParseInviteCodeFromNext.mockReturnValue('APP12345')
    render(<AuthCallbackPage />)

    await waitFor(() => {
      expect(mockPostJsonWithAuth).toHaveBeenCalledWith('/api/auth/check-allowed', {
        inviteCode: undefined,
        appInviteCode: 'APP12345',
      })
    })
    expect(mockParseInviteCodeFromNext).toHaveBeenCalledWith('/join-app?code=APP12345')
    expect(mockReplace).toHaveBeenCalledWith('/join-app?code=APP12345')
  })

  it('가족 초대 next에서는 inviteCode만 check-allowed에 보낸다', async () => {
    mockNextParam = '/join?code=FAM123'
    mockParseInviteCodeFromNext.mockReturnValue('FAM123')
    render(<AuthCallbackPage />)

    await waitFor(() => {
      expect(mockPostJsonWithAuth).toHaveBeenCalledWith('/api/auth/check-allowed', {
        inviteCode: 'FAM123',
        appInviteCode: undefined,
      })
    })
    expect(mockParseInviteCodeFromNext).toHaveBeenCalledWith('/join?code=FAM123')
    expect(mockReplace).toHaveBeenCalledWith('/join?code=FAM123')
  })

  it('앱 초대 소비 후 onboarding이 필요하면 onboarding으로 보낸다', async () => {
    mockNextParam = '/join-app?code=APP12345'
    mockParseInviteCodeFromNext.mockReturnValue('APP12345')
    mockPostJsonWithAuth.mockResolvedValue({ allowed: true, needsOnboarding: true })
    render(<AuthCallbackPage />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/onboarding')
    })
  })
})
