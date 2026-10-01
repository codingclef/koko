import { fireEvent, render, screen } from '@testing-library/react'
import JoinPage from '@/app/join/page'
import { useSearchParams } from 'next/navigation'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' }, loading: false }) }))
jest.mock('@/hooks/useFamily', () => ({ useFamily: () => ({ loading: false }) }))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: jest.fn(),
}))

it.each(['abc123', 'abcdef0123456789abcdef01'])('가족 초대 링크의 코드 %s를 유지한다', (code) => {
  ;(useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams({ code }))
  render(<JoinPage />)

  const input = screen.getByRole('textbox', { name: '초대 코드' })
  expect(input).toHaveAttribute('maxlength', '24')
  expect(input).toHaveValue(code.toUpperCase())
  expect(screen.getByRole('button', { name: '가족에 합류하기' })).toBeEnabled()

  fireEvent.change(input, { target: { value: 'abcdef0123456789abcdef01' } })
  expect(input).toHaveValue('ABCDEF0123456789ABCDEF01')
})
