import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { SettingsTab } from '@/components/tabs/SettingsTab'
import { getFamilyInfo } from '@/lib/family'
import { registerPushSubscription } from '@/lib/push'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signOut: jest.fn() },
  },
}))
jest.mock('@/lib/family', () => ({
  getFamilyInfo: jest.fn().mockResolvedValue({ name: '우리 가족', invite_code: 'ABC123' }),
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
  appRole: 'member' as const,
  isInitializing: false,
}

// 앱 서브뷰로 이동하는 헬퍼
async function navigateToApp() {
  await act(async () => { render(<SettingsTab {...defaultProps} />) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /앱/ })) })
}

// 계정 서브뷰로 이동하는 헬퍼
async function navigateToAccount() {
  await act(async () => { render(<SettingsTab {...defaultProps} />) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /계정/ })) })
}

describe('SettingsTab 메인 화면', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getFamilyInfo as jest.Mock).mockResolvedValue({ name: '우리 가족', invite_code: 'ABC123' })
  })

  it('4개 카테고리 메뉴가 표시된다', async () => {
    await act(async () => { render(<SettingsTab {...defaultProps} />) })
    expect(screen.getByText('계정')).toBeInTheDocument()
    expect(screen.getByText('가족')).toBeInTheDocument()
    expect(screen.getByText('캘린더')).toBeInTheDocument()
    expect(screen.getByText('앱')).toBeInTheDocument()
  })

  it('계정 메뉴에 이메일 서브타이틀이 표시된다', async () => {
    await act(async () => { render(<SettingsTab {...defaultProps} />) })
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
  })

  it('가족 메뉴에 가족 이름 서브타이틀이 표시된다', async () => {
    await act(async () => { render(<SettingsTab {...defaultProps} />) })
    await act(async () => {})
    expect(screen.getByText('우리 가족')).toBeInTheDocument()
  })

  it('메인 뷰는 더 넓은 반응형 컨테이너를 사용한다', async () => {
    await act(async () => { render(<SettingsTab {...defaultProps} />) })
    expect(screen.getByTestId('settings-main-container')).toHaveClass('max-w-lg', 'md:max-w-xl', 'xl:max-w-2xl')
  })
})

describe('SettingsTab 앱 서브뷰 — 알림', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getFamilyInfo as jest.Mock).mockResolvedValue({ name: '우리 가족', invite_code: 'ABC123' })
  })

  it('권한이 default일 때 "알림 허용하기" 버튼이 표시된다', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'default', requestPermission: jest.fn().mockResolvedValue('granted') },
      configurable: true,
    })
    await navigateToApp()
    expect(screen.getByText('알림 허용하기')).toBeInTheDocument()
    expect(screen.getByTestId('settings-subview-container')).toHaveClass('max-w-lg', 'xl:max-w-xl')
  })

  it('권한이 granted일 때 허용 상태 메시지가 표시된다', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'granted' },
      configurable: true,
    })
    await navigateToApp()
    expect(screen.getByText('알림이 허용되어 있습니다')).toBeInTheDocument()
  })

  it('권한이 denied일 때 차단 안내 메시지가 표시된다', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'denied' },
      configurable: true,
    })
    await navigateToApp()
    expect(screen.getByText('알림이 차단되어 있습니다')).toBeInTheDocument()
  })

  it('"알림 허용하기" 버튼 클릭 시 registerPushSubscription이 호출된다', async () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'default', requestPermission: jest.fn().mockResolvedValue('granted') },
      configurable: true,
    })
    await navigateToApp()
    await act(async () => { fireEvent.click(screen.getByText('알림 허용하기')) })
    expect(registerPushSubscription).toHaveBeenCalled()
  })

  it('Notification 미지원 환경에서는 알림 섹션이 표시되지 않는다', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).Notification
    await navigateToApp()
    expect(screen.queryByText('알림')).not.toBeInTheDocument()
  })
})

describe('SettingsTab 계정 서브뷰 — 로그아웃 확인', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'granted' },
      configurable: true,
    })
    ;(getFamilyInfo as jest.Mock).mockResolvedValue({ name: '우리 가족', invite_code: 'ABC123' })
  })

  it('로그아웃 버튼 클릭 시 확인 다이얼로그가 표시된다', async () => {
    await navigateToAccount()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /로그아웃/ })) })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('정말 로그아웃 하시겠어요?')).toBeInTheDocument()
  })

  it('취소 버튼 클릭 시 다이얼로그가 닫히고 signOut이 호출되지 않는다', async () => {
    await navigateToAccount()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /로그아웃/ })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '취소' })) })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
  })

  it('다이얼로그의 로그아웃 버튼 클릭 시 signOut이 호출된다', async () => {
    await navigateToAccount()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /로그아웃/ })) })
    const dialog = screen.getByRole('dialog')
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '로그아웃' })) })
    expect(supabase.auth.signOut).toHaveBeenCalled()
  })
})
