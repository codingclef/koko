import { render } from '@testing-library/react'
import { TabsShell } from '@/components/TabsShell'

const mockReplace = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
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
  })

  function mockTab(tab: string | null) {
    jest.spyOn(global, 'URLSearchParams').mockImplementation(
      () => ({ get: () => tab }) as unknown as URLSearchParams
    )
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('?tab=shopping 파라미터가 있으면 router.replace로 URL을 정리한다', () => {
    mockTab('shopping')
    render(<TabsShell />)
    expect(mockReplace).toHaveBeenCalledWith('/calendar')
  })

  it('?tab 파라미터가 없으면 router.replace를 호출하지 않는다', () => {
    mockTab(null)
    render(<TabsShell />)
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('유효하지 않은 ?tab 값이면 router.replace를 호출하지 않는다', () => {
    mockTab('invalid')
    render(<TabsShell />)
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
