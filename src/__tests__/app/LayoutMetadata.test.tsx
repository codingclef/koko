jest.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}))

import RootLayout, { metadata, viewport } from '@/app/layout'

describe('RootLayout metadata', () => {
  it('상단 시스템 바 색을 라이트/다크 배경색으로 분리한다', () => {
    expect(viewport.themeColor).toEqual([
      { media: '(prefers-color-scheme: light)', color: '#fafaf9' },
      { media: '(prefers-color-scheme: dark)', color: '#0f0e0d' },
    ])
  })

  it('viewport-fit cover를 설정한다', () => {
    expect(viewport.viewportFit).toBe('cover')
  })

  it('iOS 상태바를 black-translucent로 설정한다', () => {
    expect(metadata.appleWebApp).toMatchObject({ statusBarStyle: 'black-translucent' })
  })

  it('고정 주황색 theme-color 메타를 남기지 않는다', () => {
    expect(metadata.other).toEqual({
      'mobile-web-app-capable': 'yes',
    })
  })

  it('루트 layout은 동적 cookie 조회 없이 동기적으로 렌더링된다', () => {
    const layout = RootLayout({ children: null })

    expect(layout).not.toBeInstanceOf(Promise)
    expect(layout.props['data-theme']).toBeUndefined()
  })

  it('첫 paint 전 theme script가 localStorage와 cookie fallback을 유지한다', () => {
    const layout = RootLayout({ children: null })
    const head = layout.props.children[0]
    const script = head.props.children[0]
    const scriptBody = script.props.dangerouslySetInnerHTML.__html as string

    expect(scriptBody).toContain("var k='koko_theme'")
    expect(scriptBody).toContain('localStorage.getItem(k)')
    expect(scriptBody).toContain('try{ls=localStorage.getItem(k);}catch(e){}')
    expect(scriptBody).toContain('document.cookie.match')
  })
})
