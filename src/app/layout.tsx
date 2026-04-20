import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from 'next-themes'
import { cookies } from 'next/headers'
import { THEME_STORAGE_KEY } from '@/lib/preferences'
import { PreHydrationSplash } from '@/components/PreHydrationSplash'
import './globals.css'

export const metadata: Metadata = {
  title: 'Koko',
  description: '가족과 함께하는 패밀리 허브',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Koko',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafaf9' },
    { media: '(prefers-color-scheme: dark)', color: '#0f0e0d' },
  ],
}

// Prevents FOUC: localStorage takes priority; cookie is the SSR-safe fallback
// Must run before first paint, so it lives in <head> as a blocking inline script
const HEAD_SCRIPT = `(function(){var k='koko_theme';var ls=localStorage.getItem(k);if(ls){document.documentElement.setAttribute('data-theme',ls);return;}var m=document.cookie.match('(?:^|;)\\s*'+k+'=([^;]+)');if(m)document.documentElement.setAttribute('data-theme',m[1]);})();`

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const theme = cookieStore.get(THEME_STORAGE_KEY)?.value

  return (
    <html
      lang="ko"
      className="h-full antialiased"
      suppressHydrationWarning
      data-theme={theme || undefined}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: HEAD_SCRIPT }} />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-jp.min.css"
        />
        <link rel="preload" href="/logo.webp" as="image" />
        <style dangerouslySetInnerHTML={{ __html: `@media(prefers-color-scheme:dark){#koko-pre-splash{background:#0f0e0d}}` }} />
      </head>
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        <PreHydrationSplash />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
