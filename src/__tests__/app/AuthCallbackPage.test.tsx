import { render, screen } from '@testing-library/react'
import AuthCallbackPage from '@/app/auth/callback/page'

const mockReplace = jest.fn()
let mockErrorParam: string | null = null

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => ({
    get: (key: string) => key === 'error' ? mockErrorParam : null,
  }),
}))

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn(() => ({
        data: {
          subscription: {
            unsubscribe: jest.fn(),
          },
        },
      })),
      signOut: jest.fn(),
    },
  },
}))

jest.mock('@/lib/auth', () => ({
  parseInviteCodeFromNext: jest.fn(() => null),
}))

jest.mock('@/lib/api-client', () => ({
  postJson: jest.fn(),
}))

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    mockReplace.mockClear()
    mockErrorParam = null
  })

  it('callback 전이 단계에서는 시각적 splash를 렌더링하지 않는다', () => {
    render(<AuthCallbackPage />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
