import { render, screen } from '@testing-library/react'
import { AppSplash } from '@/components/AppSplash'
import { PreHydrationSplash } from '@/components/PreHydrationSplash'

describe('splash logo presentation', () => {
  it('renders the app splash logo directly without a background wrapper', () => {
    render(<AppSplash animateLogo />)

    const splash = screen.getByRole('status', { name: '앱을 불러오는 중' })
    const logo = splash.querySelector('img')

    expect(splash.children).toHaveLength(1)
    expect(logo).toBe(splash.firstElementChild)
    expect(logo).toHaveClass('splash-logo-fade-in')
  })

  it('renders the pre-hydration logo directly without a background wrapper', () => {
    const { container } = render(<PreHydrationSplash />)

    const splash = container.querySelector('#koko-pre-splash')
    const logo = splash?.querySelector('img')

    expect(splash?.children).toHaveLength(1)
    expect(logo).toBe(splash?.firstElementChild)
    expect(container.querySelector('#koko-pre-splash-logo')).not.toBeInTheDocument()
  })
})
