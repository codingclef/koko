import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TabsShell } from '@/components/TabsShell'
import { registerPushSubscription } from '@/lib/push'

const mockReplace = jest.fn()
let mockTabParam: string | null = null
let mockAuthLoading = false
let mockFamilyLoading = false
let mockCalendarsLoading = false
let mockAuthUser: { id: string } | null = { id: 'user-1' }
let mockFamilyError: Error | null = null
let mockCalendarsError: Error | null = null
const mockReloadFamily = jest.fn().mockResolvedValue(undefined)
const mockReloadCalendars = jest.fn().mockResolvedValue(undefined)

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  useSearchParams: () => ({ get: () => mockTabParam }),
}))

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockAuthUser, loading: mockAuthLoading }),
}))

jest.mock('@/hooks/useFamily', () => ({
  useFamily: () => ({
    familyId: 'fam-1',
    appRole: 'member',
    loading: mockFamilyLoading,
    error: mockFamilyError,
    reload: mockReloadFamily,
  }),
}))

jest.mock('@/hooks/useCalendars', () => ({
  useCalendars: () => ({
    calendars: [],
    loading: mockCalendarsLoading,
    error: mockCalendarsError,
    reload: mockReloadCalendars,
  }),
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
    mockReloadFamily.mockClear()
    mockReloadCalendars.mockClear()
    mockTabParam = null
    mockAuthLoading = false
    mockFamilyLoading = false
    mockCalendarsLoading = false
    mockFamilyError = null
    mockCalendarsError = null
    mockAuthUser = { id: 'user-1' }
  })

  it('인증 로딩 중에는 AppSplash를 표시한다', () => {
    mockAuthLoading = true
    mockAuthUser = null
    render(<TabsShell />)
    expect(screen.getByTestId('app-splash')).toBeInTheDocument()
    expect(screen.queryByTestId('bottom-nav')).not.toBeInTheDocument()
  })

  it('인증 완료 후 가족 데이터 로딩 중에도 AppSplash를 표시한다', () => {
    mockAuthLoading = false
    mockFamilyLoading = true
    render(<TabsShell />)
    expect(screen.getByTestId('app-splash')).toBeInTheDocument()
    expect(screen.queryByTestId('bottom-nav')).not.toBeInTheDocument()
  })

  it('캘린더 데이터 로딩 중에도 AppSplash를 표시한다', () => {
    mockCalendarsLoading = true
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
    expect(screen.getByTestId('calendar-tab').parentElement).toHaveStyle({ display: 'flex' })
    expect(screen.getByTestId('shopping-tab').parentElement).toHaveStyle({ display: 'none' })
  })

  it('?tab=shopping 파라미터가 있으면 쇼핑 탭이 활성화된다', () => {
    mockTabParam = 'shopping'
    render(<TabsShell />)
    expect(screen.getByTestId('shopping-tab').parentElement).toHaveStyle({ display: 'block' })
    expect(screen.getByTestId('calendar-tab').parentElement).toHaveStyle({ display: 'none' })
  })

  it('유효하지 않은 ?tab 값이면 캘린더 탭이 표시된다', () => {
    mockTabParam = 'invalid'
    render(<TabsShell />)
    expect(screen.getByTestId('calendar-tab').parentElement).toHaveStyle({ display: 'flex' })
    expect(screen.getByTestId('shopping-tab').parentElement).toHaveStyle({ display: 'none' })
  })

  it('초기 진입 시 자동으로 푸시 구독을 요청하지 않는다', () => {
    render(<TabsShell />)
    expect(registerPushSubscription).not.toHaveBeenCalled()
  })

  it('초기 로딩 실패 시 splash 위 에러 다이얼로그를 표시한다', () => {
    mockCalendarsError = new Error('calendar failed')
    render(<TabsShell />)

    expect(screen.getByTestId('app-splash')).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('앱을 시작하지 못했어요')).toBeInTheDocument()
  })

  it('다시 시도 버튼 클릭 시 가족과 캘린더 로드를 모두 재시도한다', async () => {
    mockCalendarsError = new Error('calendar failed')
    const user = userEvent.setup()

    render(<TabsShell />)
    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(mockReloadFamily).toHaveBeenCalled()
    expect(mockReloadCalendars).toHaveBeenCalled()
  })
})
