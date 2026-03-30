import { render, screen } from '@testing-library/react'
import { BottomNav } from '@/components/BottomNav'

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}))

import { usePathname } from 'next/navigation'
const mockUsePathname = usePathname as jest.Mock

describe('BottomNav', () => {
  it('장바구니와 설정 탭이 렌더링된다', () => {
    mockUsePathname.mockReturnValue('/')
    render(<BottomNav />)
    expect(screen.getByText('장바구니')).toBeInTheDocument()
    expect(screen.getByText('설정')).toBeInTheDocument()
  })

  it('/shopping 경로에서 장바구니 탭이 활성화된다', () => {
    mockUsePathname.mockReturnValue('/shopping')
    render(<BottomNav />)
    const shoppingLink = screen.getByText('장바구니').closest('a')
    expect(shoppingLink).toHaveClass('text-orange-500')
  })

  it('/shopping/list-1 경로에서도 장바구니 탭이 활성화된다', () => {
    mockUsePathname.mockReturnValue('/shopping/list-1')
    render(<BottomNav />)
    const shoppingLink = screen.getByText('장바구니').closest('a')
    expect(shoppingLink).toHaveClass('text-orange-500')
  })

  it('/settings 경로에서 설정 탭이 활성화된다', () => {
    mockUsePathname.mockReturnValue('/settings')
    render(<BottomNav />)
    const settingsLink = screen.getByText('설정').closest('a')
    expect(settingsLink).toHaveClass('text-orange-500')
  })

  it('활성화되지 않은 탭은 기본 색상이다', () => {
    mockUsePathname.mockReturnValue('/shopping')
    render(<BottomNav />)
    const settingsLink = screen.getByText('설정').closest('a')
    expect(settingsLink).not.toHaveClass('text-orange-500')
  })

  it('링크의 href가 올바르다', () => {
    mockUsePathname.mockReturnValue('/')
    render(<BottomNav />)
    expect(screen.getByText('장바구니').closest('a')).toHaveAttribute('href', '/shopping')
    expect(screen.getByText('설정').closest('a')).toHaveAttribute('href', '/settings')
  })
})
