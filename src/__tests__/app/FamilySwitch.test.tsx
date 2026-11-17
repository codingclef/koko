import { act, fireEvent, render, screen } from '@testing-library/react'
import { TabsShell } from '@/components/TabsShell'
import { postJsonWithAuth } from '@/lib/api-client'

jest.mock('@/lib/api-client', () => ({ postJsonWithAuth: jest.fn(), ApiClientError: Error }))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/calendar',
  useSearchParams: () => new URLSearchParams(window.location.search),
}))
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'tester' }, loading: false }) }))
jest.mock('@/hooks/useCalendars', () => ({
  useCalendars: (familyId: string | null) => ({ calendars: [], loading: familyId === 'new-family' }),
}))
jest.mock('@/hooks/useUserPreferences', () => ({ useUserPreferences: () => ({ preferences: null }) }))
jest.mock('@/components/tabs/CalendarTab', () => ({
  CalendarTab: ({ familyId }: { familyId: string }) => <output data-testid="calendar-family">{familyId}</output>,
}))
jest.mock('@/components/tabs/ReminderTab', () => ({
  ReminderTab: ({ familyId }: { familyId: string }) => <output data-testid="reminder-family">{familyId}</output>,
}))
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/lib/family', () => ({
  getFamilyInfo: jest.fn().mockResolvedValue({ name: '기존 가족', invite_code: 'ABCDEF' }),
  getFamilyMembers: jest.fn().mockResolvedValue([]),
  getMyFamilyMember: jest.fn().mockResolvedValue(null),
}))
jest.mock('@/lib/push', () => ({ syncPushSubscriptionIfGranted: jest.fn().mockResolvedValue('connected') }))
jest.mock('next-themes', () => ({ useTheme: () => ({}) }))

it.each(['new-family', 'old-family'])('uses the join response for %s with no app restart', async (joinedFamilyId) => {
  window.history.replaceState(null, '', '/calendar?tab=settings')
  let joined = false
  const api = jest.mocked(postJsonWithAuth)
  api.mockClear()
  api.mockImplementation(async (path) => {
    if (path === '/api/family/join') {
      joined = true
      return { familyId: joinedFamilyId } as never
    }
    if (joined) throw new Error('temporary family lookup failure')
    return { familyId: 'old-family', appRole: 'member' } as never
  })
  const view = render(<TabsShell />)
  fireEvent.click(await screen.findByRole('button', { name: /가족.*기존 가족/ }))
  fireEvent.change(screen.getByRole('textbox', { name: '초대 코드' }), { target: { value: 'ABC123' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '합류' })) })
  expect(joined).toBe(true)
  expect(window.location.search).toEqual('?tab=reminders')
  view.rerender(<TabsShell />)
  expect(await screen.findByTestId('reminder-family')).toHaveTextContent(joinedFamilyId)
  expect(screen.getByTestId('calendar-family')).toHaveTextContent(joinedFamilyId)
  expect(screen.queryByText('앱을 시작하지 못했어요')).not.toBeInTheDocument()
  expect(api.mock.calls.filter(([path]) => path === '/api/family/me')).toHaveLength(1)
})
