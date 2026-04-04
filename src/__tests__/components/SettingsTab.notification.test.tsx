import { render, screen, fireEvent, act } from '@testing-library/react'
import { SettingsTab } from '@/components/tabs/SettingsTab'
import { registerPushSubscription } from '@/lib/push'
import type { User } from '@supabase/supabase-js'

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { invite_code: 'ABC123' } }),
    })),
    auth: { signOut: jest.fn() },
  },
}))
jest.mock('@/lib/family', () => ({
  getMyFamilyMember: jest.fn().mockResolvedValue({ display_name: '테스트' }),
  updateMyDisplayName: jest.fn(),
}))
jest.mock('@/lib/push', () => ({
  registerPushSubscription: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }))

const mockUser = { id: 'user-1', email: 'test@example.com' } as User

const defaultProps = {
  onNavigateToTab: jest.fn(),
  preferences: null,
  updatePreferences: jest.fn(),
  user: mockUser,
  familyId: 'family-1',
  isInitializing: false,
}

describe('SettingsTab 알림 섹션', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('권한이 default일 때 "알림 허용하기" 버튼이 표시된다', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'default', requestPermission: jest.fn().mockResolvedValue('granted') },
      configurable: true,
    })

    await act(async () => { render(<SettingsTab {...defaultProps} />) })

    expect(screen.getByText('알림 허용하기')).toBeInTheDocument()
  })

  it('권한이 granted일 때 허용 상태 메시지가 표시된다', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'granted' },
      configurable: true,
    })

    await act(async () => { render(<SettingsTab {...defaultProps} />) })

    expect(screen.getByText('알림이 허용되어 있습니다')).toBeInTheDocument()
  })

  it('권한이 denied일 때 차단 안내 메시지가 표시된다', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'denied' },
      configurable: true,
    })

    await act(async () => { render(<SettingsTab {...defaultProps} />) })

    expect(screen.getByText('알림이 차단되어 있습니다')).toBeInTheDocument()
  })

  it('"알림 허용하기" 버튼 클릭 시 registerPushSubscription이 호출된다', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'default', requestPermission: jest.fn().mockResolvedValue('granted') },
      configurable: true,
    })

    await act(async () => { render(<SettingsTab {...defaultProps} />) })

    await act(async () => {
      fireEvent.click(screen.getByText('알림 허용하기'))
    })

    expect(registerPushSubscription).toHaveBeenCalledWith('user-1')
  })

  it('Notification 미지원 환경에서는 알림 섹션이 표시되지 않는다', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).Notification

    await act(async () => { render(<SettingsTab {...defaultProps} />) })

    expect(screen.queryByText('알림')).not.toBeInTheDocument()
  })
})
