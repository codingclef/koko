import { render, screen } from '@testing-library/react'
import { TabsShell } from '@/components/TabsShell'
import { registerPushSubscription } from '@/lib/push'

const mockReplace = jest.fn()
let mockTabParam: string | null = null
let mockAuthLoading = false
let mockAuthUser: { id: string } | null = { id: 'user-1' }

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  useSearchParams: () => ({ get: () => mockTabParam }),
}))

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockAuthUser, loading: mockAuthLoading }),
}))

jest.mock('@/hooks/useFamily', () => ({
  useFamily: () => ({ familyId: null, loading: false }),
}))

jest.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({ preferences: null, updatePreferences: jest.fn() }),
}))

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), channel: jest.fn(), removeChannel: jest.fn() },
}))

jest.mock('@/lib/push', () => ({
  registerPushSubscription: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/components/AppSplash', () => ({
  AppSplash: () => <div data-testid="app-splash" />,
}))

jest.mock('@/components/tabs/CalendarTab', () => ({
  CalendarTab: () => <div data-testid="calendar-tab" />,
}))

jest.mock('@/components/tabs/ShoppingTab', () => ({
  ShoppingTab: () => <div data-testid="shopping-tab" />,
}))

jest.mock('@/components/tabs/SettingsTab', () => ({
  SettingsTab: () => <div data-testid="settings-tab" />,
}))

jest.mock('@/components/BottomNav', () => ({
  BottomNav: () => <div data-testid="bottom-nav" />,
}))

describe('TabsShell', () => {
  beforeEach(() => {
    mockReplace.mockClear()
    mockTabParam = null
    mockAuthLoading = false
    mockAuthUser = { id: 'user-1' }
  })

  it('인증 로딩 중에는 AppSplash를 표시한다', () => {
    mockAuthLoading = true
    mockAuthUser = null
    render(<TabsShell />)
    expect(screen.getByTestId('app-splash')).toBeInTheDocument()
    expect(screen.queryByTestId('bottom-nav')).not.toBeInTheDocument()
  })

  it('미인증 상태에서는 탭을 렌더링하지 않는다', () => {
    mockAuthUser = null
    render(<TabsShell />)
    expect(screen.queryByTestId('bottom-nav')).not.toBeInTheDocument()
  })

  it('?tab 파라미터가 없으면 캘린더 탭이 표시된다', () => {
    render(<TabsShell />)
    expect(screen.getByTestId('calendar-tab').parentElement).toHaveStyle({ display: 'contents' })
    expect(screen.getByTestId('shopping-tab').parentElement).toHaveStyle({ display: 'none' })
  })

  it('?tab=shopping 파라미터가 있으면 쇼핑 탭이 활성화된다', () => {
    mockTabParam = 'shopping'
    render(<TabsShell />)
    expect(screen.getByTestId('shopping-tab').parentElement).toHaveStyle({ display: 'contents' })
    expect(screen.getByTestId('calendar-tab').parentElement).toHaveStyle({ display: 'none' })
  })

  it('유효하지 않은 ?tab 값이면 캘린더 탭이 표시된다', () => {
    mockTabParam = 'invalid'
    render(<TabsShell />)
    expect(screen.getByTestId('calendar-tab').parentElement).toHaveStyle({ display: 'contents' })
    expect(screen.getByTestId('shopping-tab').parentElement).toHaveStyle({ display: 'none' })
  })

  it('초기 진입 시 자동으로 푸시 구독을 요청하지 않는다', () => {
    render(<TabsShell />)
    expect(registerPushSubscription).not.toHaveBeenCalled()
  })
})
