import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TabsShell } from '@/components/TabsShell'
import { registerPushSubscription, syncPushSubscriptionIfGranted } from '@/lib/push'

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
const mockLoadReminderTab = jest.fn()
const mockLoadSettingsTab = jest.fn()

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
  syncPushSubscriptionIfGranted: jest.fn().mockResolvedValue('connected'),
}))

jest.mock('@/components/tab-loaders', () => ({
  loadReminderTab: () => mockLoadReminderTab(),
  loadSettingsTab: () => mockLoadSettingsTab(),
}))

jest.mock('@/components/AppSplash', () => ({
  AppSplash: () => <div data-testid="app-splash" />,
}))

jest.mock('@/components/tabs/CalendarTab', () => ({
  CalendarTab: ({ calendarsLoading, calendarsError }: {
    calendarsLoading: boolean
    calendarsError: unknown
  }) => (
    <div
      data-testid="calendar-tab"
      data-calendars-loading={String(calendarsLoading)}
      data-calendars-error={String(Boolean(calendarsError))}
    />
  ),
}))

jest.mock('@/components/tabs/ReminderTab', () => ({
  ReminderTab: () => <div data-testid="reminder-tab" />,
}))

jest.mock('@/components/tabs/SettingsTab', () => ({
  SettingsTab: () => <div data-testid="settings-tab" />,
}))

jest.mock('@/components/BottomNav', () => ({
  BottomNav: ({ onTabChange }: {
    onTabChange: (tab: 'calendar' | 'reminders' | 'settings') => void
  }) => (
    <div data-testid="bottom-nav">
      <button onClick={() => onTabChange('calendar')}>캘린더 탭</button>
      <button onClick={() => onTabChange('reminders')}>리마인더 탭</button>
      <button onClick={() => onTabChange('settings')}>설정 탭</button>
    </div>
  ),
}))

describe('TabsShell', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/calendar')
    mockReplace.mockClear()
    mockReloadFamily.mockClear()
    mockReloadCalendars.mockClear()
    ;(registerPushSubscription as jest.Mock).mockClear()
    ;(syncPushSubscriptionIfGranted as jest.Mock).mockClear()
    mockTabParam = null
    mockAuthLoading = false
    mockFamilyLoading = false
    mockCalendarsLoading = false
    mockFamilyError = null
    mockCalendarsError = null
    mockAuthUser = { id: 'user-1' }
    mockLoadReminderTab.mockReset()
    mockLoadReminderTab.mockResolvedValue(() => <div data-testid="reminder-tab" />)
    mockLoadSettingsTab.mockReset()
    mockLoadSettingsTab.mockResolvedValue(() => <div data-testid="settings-tab" />)
    jest.useRealTimers()
  })

  afterEach(() => {
    jest.restoreAllMocks()
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

  it('캘린더 데이터 로딩 중에는 viewport가 안정될 때까지 splash를 유지한다', () => {
    mockCalendarsLoading = true
    render(<TabsShell />)
    expect(screen.getByTestId('app-splash')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-tab')).not.toBeInTheDocument()
    expect(screen.queryByTestId('bottom-nav')).not.toBeInTheDocument()
  })

  it('캘린더 데이터 로딩이 끝나면 splash를 닫고 셸을 마운트한다', () => {
    mockCalendarsLoading = true
    const { rerender } = render(<TabsShell />)

    mockCalendarsLoading = false
    rerender(<TabsShell />)

    expect(screen.queryByTestId('app-splash')).not.toBeInTheDocument()
    expect(screen.getByTestId('calendar-tab')).toBeInTheDocument()
    expect(screen.getByTestId('bottom-nav')).toBeInTheDocument()
  })

  it('브라우저 모드에 맞는 viewport CSS 변수로 셸을 채운다', () => {
    render(<TabsShell />)

    const shell = screen.getByTestId('tabs-shell')
    expect(shell).toHaveClass('overflow-hidden')
    expect(shell).not.toHaveClass('fixed', 'inset-0')
    expect(shell).toHaveStyle({ height: 'var(--app-viewport-height)' })
    expect(shell).toHaveStyle({ paddingTop: 'env(safe-area-inset-top, 0px)' })
  })

  it('미인증 상태에서는 탭을 렌더링하지 않는다', () => {
    mockAuthUser = null
    render(<TabsShell />)
    expect(screen.queryByTestId('bottom-nav')).not.toBeInTheDocument()
  })

  it('?tab 파라미터가 없으면 캘린더 탭이 표시된다', () => {
    render(<TabsShell />)
    expect(screen.getByTestId('calendar-tab').parentElement).not.toHaveClass('hidden')
    expect(screen.queryByTestId('reminder-tab')).not.toBeInTheDocument()
  })

  it('?tab=reminders 파라미터가 있으면 리마인더 탭이 활성화된다', async () => {
    mockTabParam = 'reminders'
    render(<TabsShell />)
    expect((await screen.findByTestId('reminder-tab')).parentElement).not.toHaveClass('hidden')
    expect(screen.getByTestId('calendar-tab').parentElement).toHaveClass('hidden')
  })

  it('유효하지 않은 ?tab 값이면 캘린더 탭이 표시된다', () => {
    mockTabParam = 'invalid'
    render(<TabsShell />)
    expect(screen.getByTestId('calendar-tab').parentElement).not.toHaveClass('hidden')
    expect(screen.queryByTestId('reminder-tab')).not.toBeInTheDocument()
  })

  it('탭 전환은 셸을 다시 탐색하지 않고 URL만 교체한다', async () => {
    const replaceState = jest.spyOn(window.history, 'replaceState')
    const user = userEvent.setup()

    render(<TabsShell />)
    await user.click(screen.getByRole('button', { name: '리마인더 탭' }))

    expect(replaceState).toHaveBeenCalledWith(null, '', '/calendar?tab=reminders')
    expect(mockReplace).not.toHaveBeenCalled()
    replaceState.mockRestore()
  })

  it('다른 탭으로 전환하면 리마인더 상세 파라미터를 제거한다', async () => {
    window.history.replaceState(null, '', '/calendar?tab=reminders&list=list-1')
    const user = userEvent.setup()

    render(<TabsShell />)
    await user.click(screen.getByRole('button', { name: '설정 탭' }))

    expect(window.location.pathname).toBe('/calendar')
    expect(window.location.search).toBe('?tab=settings')
  })

  it('캘린더 진입 후 idle 시점에 리마인더와 설정 탭을 hidden 상태로 예열한다', async () => {
    jest.useFakeTimers()

    render(<TabsShell />)

    expect(screen.getByTestId('calendar-tab').parentElement).not.toHaveClass('hidden')
    expect(screen.queryByTestId('reminder-tab')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-tab')).not.toBeInTheDocument()

    await act(async () => {
      jest.advanceTimersByTime(1300)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(syncPushSubscriptionIfGranted).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('reminder-tab')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-tab')).not.toBeInTheDocument()

    await act(async () => {
      jest.advanceTimersByTime(1300)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByTestId('reminder-tab').parentElement).toHaveClass('hidden')
    expect(screen.queryByTestId('settings-tab')).not.toBeInTheDocument()

    await act(async () => {
      jest.advanceTimersByTime(1300)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByTestId('settings-tab').parentElement).toHaveClass('hidden')
  })

  it('셸 준비 직후 리마인더 코드는 예열하지만 탭 데이터 effect는 idle 전까지 시작하지 않는다', () => {
    render(<TabsShell />)

    expect(mockLoadReminderTab).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('reminder-tab')).not.toBeInTheDocument()
  })

  it('리마인더 코드 예열 실패가 캘린더 셸을 다시 splash로 돌리지 않는다', async () => {
    const preloadError = new Error('chunk failed')
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockLoadReminderTab.mockRejectedValueOnce(preloadError)

    render(<TabsShell />)
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.queryByTestId('app-splash')).not.toBeInTheDocument()
    expect(screen.getByTestId('calendar-tab')).toBeInTheDocument()
    expect(warn).toHaveBeenCalledWith(
      '[TabsShell] reminder tab chunk preload failed:',
      preloadError
    )
  })

  it('초기 진입 시 자동으로 푸시 구독을 요청하지 않는다', () => {
    render(<TabsShell />)
    expect(registerPushSubscription).not.toHaveBeenCalled()
  })

  it('가족 초기 로딩 실패 시 splash 위 에러 다이얼로그를 표시한다', () => {
    mockFamilyError = new Error('family failed')
    render(<TabsShell />)

    expect(screen.getByTestId('app-splash')).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('앱을 시작하지 못했어요')).toBeInTheDocument()
  })

  it('가족 초기 로딩 다시 시도 시 가족과 캘린더 로드를 모두 재시도한다', async () => {
    mockFamilyError = new Error('family failed')
    const user = userEvent.setup()

    render(<TabsShell />)
    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(mockReloadFamily).toHaveBeenCalled()
    expect(mockReloadCalendars).toHaveBeenCalled()
  })

  it('캘린더 로드 실패는 앱 전체를 막지 않고 캘린더 탭에 전달한다', () => {
    mockCalendarsError = new Error('calendar failed')
    render(<TabsShell />)

    expect(screen.queryByTestId('app-splash')).not.toBeInTheDocument()
    expect(screen.getByTestId('calendar-tab')).toHaveAttribute('data-calendars-error', 'true')
    expect(screen.getByTestId('bottom-nav')).toBeInTheDocument()
  })

  it('캘린더 로드 실패 중에도 URL로 선택한 리마인더 탭을 연다', async () => {
    mockTabParam = 'reminders'
    mockCalendarsError = new Error('calendar failed')
    render(<TabsShell />)

    expect((await screen.findByTestId('reminder-tab')).parentElement).not.toHaveClass('hidden')
    expect(screen.queryByTestId('app-splash')).not.toBeInTheDocument()
  })
})
