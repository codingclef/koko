import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { SettingsTab } from '@/components/tabs/SettingsTab'
import { getFamilyInfo, getFamilyMembers } from '@/lib/family'
import { registerPushSubscription } from '@/lib/push'
import { supabase } from '@/lib/supabase'
import { DEFAULT_THEME } from '@/lib/preferences'
import type { User } from '@supabase/supabase-js'

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signOut: jest.fn() },
  },
}))
jest.mock('@/lib/family', () => ({
  getFamilyInfo: jest.fn().mockResolvedValue({ name: '우리 가족', invite_code: 'ABC123' }),
  getFamilyMembers: jest.fn().mockResolvedValue([]),
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

async function navigateToFamily() {
  await act(async () => { render(<SettingsTab {...defaultProps} />) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /가족/ })) })
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

  it('상단 사용자 요약에 이메일이 표시된다', async () => {
    await act(async () => { render(<SettingsTab {...defaultProps} />) })
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
  })

  it('가족 메뉴에 가족 이름 서브타이틀이 표시된다', async () => {
    await act(async () => { render(<SettingsTab {...defaultProps} />) })
    await act(async () => {})
    expect(screen.getByText('우리 가족')).toBeInTheDocument()
  })

  it('계정과 환경 설정 메뉴를 명확한 그룹과 아이콘으로 구분한다', async () => {
    await act(async () => { render(<SettingsTab {...defaultProps} />) })

    expect(screen.getByRole('heading', { name: '나와 가족' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '화면 및 알림' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /계정/ }).querySelector('svg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /캘린더/ }).querySelector('svg')).toBeInTheDocument()
  })

  it('캘린더와 앱 메뉴에 현재 설정 요약을 표시한다', async () => {
    await act(async () => {
      render(
        <SettingsTab
          {...defaultProps}
          preferences={{
            user_id: 'user-1',
            holiday_countries: ['KR', 'JP'],
            show_lunar: true,
            app_theme: DEFAULT_THEME,
            last_label_color: null,
            created_at: '',
            updated_at: '',
          }}
        />
      )
    })

    expect(screen.getByText('휴일 2개 국가 · 음력 표시')).toBeInTheDocument()
    expect(screen.getByText('알림 및 테마 · 탠저린')).toBeInTheDocument()
  })

  it('메인 뷰는 max-w 제약 없이 풀 너비 컨테이너를 사용한다', async () => {
    await act(async () => { render(<SettingsTab {...defaultProps} />) })
    const container = screen.getByTestId('settings-main-container')
    expect(container).toBeInTheDocument()
    expect(container.className).not.toContain('max-w-lg')
  })

  it('메인 뷰는 다른 탭과 같은 압축된 상단 여백을 사용한다', async () => {
    await act(async () => { render(<SettingsTab {...defaultProps} />) })
    const container = screen.getByTestId('settings-main-container')
    expect(container.className).toContain('pt-2')
    expect(container.className).toContain('min-h-full')
    expect(container.className).not.toContain('min-h-screen')
    expect(container.className).not.toContain('py-8')
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
    const container = screen.getByTestId('settings-subview-container')
    expect(container).toBeInTheDocument()
    expect(container.className).toContain('pt-2')
    expect(container.className).not.toContain('py-8')
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

describe('SettingsTab 가족 서브뷰 — 구성원', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getFamilyInfo as jest.Mock).mockResolvedValue({ name: '우리 가족', invite_code: 'ABC123' })
    ;(getFamilyMembers as jest.Mock).mockResolvedValue([
      {
        id: 'member-1',
        family_id: 'family-1',
        user_id: 'user-1',
        display_name: 'Jay',
        role: 'member',
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'member-2',
        family_id: 'family-1',
        user_id: 'user-2',
        display_name: 'JGBB',
        role: 'member',
        created_at: '2026-01-02T00:00:00Z',
      },
    ])
  })

  it('현재 가족의 구성원 수와 이름을 읽기 전용으로 표시한다', async () => {
    await navigateToFamily()

    const section = screen.getByTestId('family-members-section')
    expect(await within(section).findByText('Jay')).toBeInTheDocument()
    expect(within(section).getByText('JGBB')).toBeInTheDocument()
    expect(within(section).getByText('2명')).toBeInTheDocument()
    expect(within(section).getByText('나')).toBeInTheDocument()
    expect(within(section).queryByRole('button')).not.toBeInTheDocument()
  })

  it('구성원 조회 실패 시 가족 화면을 유지하고 해당 영역만 다시 시도한다', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    ;(getFamilyMembers as jest.Mock)
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce([
        {
          id: 'member-1',
          family_id: 'family-1',
          user_id: 'user-1',
          display_name: 'Jay',
          role: 'member',
          created_at: '2026-01-01T00:00:00Z',
        },
      ])

    await navigateToFamily()

    expect(await screen.findByText('구성원을 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '가족' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByText('Jay')).toBeInTheDocument()
    expect(error).toHaveBeenCalled()
  })

  it('가족 전환 중 이전 가족의 늦은 응답을 표시하지 않는다', async () => {
    let resolveFirst: ((members: unknown[]) => void) | undefined
    const firstRequest = new Promise<unknown[]>((resolve) => {
      resolveFirst = resolve
    })
    ;(getFamilyMembers as jest.Mock)
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce([
        {
          id: 'member-2',
          family_id: 'family-2',
          user_id: 'user-2',
          display_name: '새 가족',
          role: 'member',
          created_at: '2026-01-02T00:00:00Z',
        },
      ])

    let renderResult: ReturnType<typeof render>
    await act(async () => {
      renderResult = render(<SettingsTab {...defaultProps} />)
    })
    fireEvent.click(screen.getByRole('button', { name: /가족/ }))
    renderResult!.rerender(<SettingsTab {...defaultProps} familyId="family-2" />)

    expect(await screen.findByText('새 가족')).toBeInTheDocument()

    await act(async () => {
      resolveFirst?.([
        {
          id: 'member-1',
          family_id: 'family-1',
          user_id: 'user-1',
          display_name: '이전 가족',
          role: 'member',
          created_at: '2026-01-01T00:00:00Z',
        },
      ])
      await firstRequest
    })

    expect(screen.queryByText('이전 가족')).not.toBeInTheDocument()
    expect(screen.getByText('새 가족')).toBeInTheDocument()
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
