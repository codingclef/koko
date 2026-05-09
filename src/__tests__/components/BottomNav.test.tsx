import { render, screen } from '@testing-library/react'
import { BottomNav } from '@/components/BottomNav'

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}))

import { usePathname } from 'next/navigation'
const mockUsePathname = usePathname as jest.Mock

describe('BottomNav', () => {
  it('리마인더와 설정 탭이 렌더링된다', () => {
    mockUsePathname.mockReturnValue('/')
    render(<BottomNav />)
    expect(screen.getByText('리마인더')).toBeInTheDocument()
    expect(screen.getByText('설정')).toBeInTheDocument()
  })

  it('/reminders 경로에서 리마인더 탭이 활성화된다', () => {
    mockUsePathname.mockReturnValue('/reminders')
    render(<BottomNav />)
    const reminderLink = screen.getByText('리마인더').closest('a')
    expect(reminderLink).toHaveClass('text-accent-500')
  })

  it('/reminders/list-1 경로에서도 리마인더 탭이 활성화된다', () => {
    mockUsePathname.mockReturnValue('/reminders/list-1')
    render(<BottomNav />)
    const reminderLink = screen.getByText('리마인더').closest('a')
    expect(reminderLink).toHaveClass('text-accent-500')
  })

  it('/settings 경로에서 설정 탭이 활성화된다', () => {
    mockUsePathname.mockReturnValue('/settings')
    render(<BottomNav />)
    const settingsLink = screen.getByText('설정').closest('a')
    expect(settingsLink).toHaveClass('text-accent-500')
  })

  it('활성화되지 않은 탭은 기본 색상이다', () => {
    mockUsePathname.mockReturnValue('/reminders')
    render(<BottomNav />)
    const settingsLink = screen.getByText('설정').closest('a')
    expect(settingsLink).not.toHaveClass('text-accent-500')
  })

  it('링크의 href가 올바르다', () => {
    mockUsePathname.mockReturnValue('/')
    render(<BottomNav />)
    expect(screen.getByText('리마인더').closest('a')).toHaveAttribute('href', '/reminders')
    expect(screen.getByText('설정').closest('a')).toHaveAttribute('href', '/settings')
  })
})
