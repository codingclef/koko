import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { SettingsTab } from '@/components/tabs/SettingsTab'
import { getFamilyInviteCode } from '@/lib/family'
import { registerPushSubscription } from '@/lib/push'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signOut: jest.fn() },
  },
}))
jest.mock('@/lib/family', () => ({
  getFamilyInviteCode: jest.fn().mockResolvedValue('ABC123'),
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
    ;(getFamilyInviteCode as jest.Mock).mockResolvedValue('ABC123')
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

    expect(registerPushSubscription).toHaveBeenCalled()
  })

  it('Notification 미지원 환경에서는 알림 섹션이 표시되지 않는다', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).Notification

    await act(async () => { render(<SettingsTab {...defaultProps} />) })

    expect(screen.queryByText('알림')).not.toBeInTheDocument()
  })
})

describe('SettingsTab 로그아웃 확인', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'granted' },
      configurable: true,
    })
  })

  it('로그아웃 버튼 클릭 시 확인 다이얼로그가 표시된다', async () => {
    await act(async () => { render(<SettingsTab {...defaultProps} />) })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /로그아웃/ }))
    })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('정말 로그아웃 하시겠어요?')).toBeInTheDocument()
  })

  it('취소 버튼 클릭 시 다이얼로그가 닫히고 signOut이 호출되지 않는다', async () => {
    await act(async () => { render(<SettingsTab {...defaultProps} />) })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /로그아웃/ }))
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '취소' }))
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
  })

  it('다이얼로그의 로그아웃 버튼 클릭 시 signOut이 호출된다', async () => {
    await act(async () => { render(<SettingsTab {...defaultProps} />) })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /로그아웃/ }))
    })

    const dialog = screen.getByRole('dialog')
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: '로그아웃' }))
    })

    expect(supabase.auth.signOut).toHaveBeenCalled()
  })
})
