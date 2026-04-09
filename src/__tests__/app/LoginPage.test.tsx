import { render, screen } from '@testing-library/react'
import LoginPage from '@/app/login/page'

const mockReplace = jest.fn()
let mockAuthLoading = false
let mockAuthUser: { id: string } | null = null
let mockErrorParam: string | null = null

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === 'next') return null
      if (key === 'error') return mockErrorParam
      return null
    },
  }),
}))

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockAuthUser, loading: mockAuthLoading }),
}))

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: jest.fn(),
    },
  },
}))

jest.mock('@/components/AppSplash', () => ({
  AppSplash: () => <div data-testid="app-splash" />,
}))

describe('LoginPage', () => {
  beforeEach(() => {
    mockReplace.mockClear()
    mockAuthLoading = false
    mockAuthUser = null
    mockErrorParam = null
  })

  it('인증 확인 중에는 스피너 대신 AppSplash를 표시한다', () => {
    mockAuthLoading = true

    render(<LoginPage />)

    expect(screen.getByTestId('app-splash')).toBeInTheDocument()
    expect(screen.queryByText('Google로 로그인')).not.toBeInTheDocument()
  })
})
