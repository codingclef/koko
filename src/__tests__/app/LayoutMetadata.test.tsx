jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}))

jest.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('@/lib/preferences', () => ({
  THEME_STORAGE_KEY: 'koko_theme',
}))

import { metadata, viewport } from '@/app/layout'

describe('RootLayout metadata', () => {
  it('상단 시스템 바 색을 라이트/다크 배경색으로 분리한다', () => {
    expect(viewport.themeColor).toEqual([
      { media: '(prefers-color-scheme: light)', color: '#fafaf9' },
      { media: '(prefers-color-scheme: dark)', color: '#0f0e0d' },
    ])
  })

  it('고정 주황색 theme-color 메타를 남기지 않는다', () => {
    expect(metadata.other).toEqual({
      'mobile-web-app-capable': 'yes',
    })
  })
})
