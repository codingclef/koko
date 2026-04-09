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

  it('callback 실패 에러는 표시만 하고 자동 재시도하지 않는다', () => {
    mockErrorParam = 'auth_callback_failed'

    render(<LoginPage />)

    expect(screen.getByText('로그인 처리 중 문제가 발생했어요. 다시 시도해주세요.')).toBeInTheDocument()
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
