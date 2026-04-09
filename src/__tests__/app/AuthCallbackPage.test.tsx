import { render, screen } from '@testing-library/react'
import AuthCallbackPage from '@/app/auth/callback/page'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
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

jest.mock('@/components/AppSplash', () => ({
  AppSplash: () => <div data-testid="app-splash" />,
}))

describe('AuthCallbackPage', () => {
  it('callback 처리 중에는 스피너 대신 AppSplash를 표시한다', () => {
    render(<AuthCallbackPage />)

    expect(screen.getByTestId('app-splash')).toBeInTheDocument()
  })
})
