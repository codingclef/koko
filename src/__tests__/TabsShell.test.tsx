import { render, screen } from '@testing-library/react'
import { TabsShell } from '@/components/TabsShell'

const mockReplace = jest.fn()
let mockTabParam: string | null = null

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  useSearchParams: () => ({ get: () => mockTabParam }),
}))

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, loading: true }),
}))

jest.mock('@/hooks/useFamily', () => ({
  useFamily: () => ({ familyId: null, loading: true }),
}))

jest.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({ preferences: null, updatePreferences: jest.fn() }),
}))

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), channel: jest.fn(), removeChannel: jest.fn() },
}))

jest.mock('@/lib/push', () => ({
  registerPushSubscription: jest.fn(),
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
})
