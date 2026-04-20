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
    statusBarStyle: 'black-translucent',
    title: 'Koko',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafaf9' },
    { media: '(prefers-color-scheme: dark)', color: '#0f0e0d' },
  ],
}

// Applies accent theme and dark class before first paint to prevent FOUC.
// next-themes stores dark/light preference under 'theme' key in localStorage.
const HEAD_SCRIPT = `(function(){var de=document.documentElement;var k='koko_theme';var ls=localStorage.getItem(k);if(ls){de.setAttribute('data-theme',ls);}else{var m=document.cookie.match('(?:^|;)\\s*'+k+'=([^;]+)');if(m)de.setAttribute('data-theme',m[1]);}var t=localStorage.getItem('theme');var dark=(t==='dark')||(t!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches);if(dark)de.classList.add('dark');})();`

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
        <style dangerouslySetInnerHTML={{ __html: `#koko-pre-splash{background:#fafaf9}@media(prefers-color-scheme:dark){#koko-pre-splash{background:#0f0e0d}}.dark #koko-pre-splash{background:#0f0e0d}#koko-pre-splash-logo{background:rgba(245,245,244,0.8)}@media(prefers-color-scheme:dark){#koko-pre-splash-logo{background:rgba(255,255,255,0.1)}}.dark #koko-pre-splash-logo{background:rgba(255,255,255,0.1)}` }} />
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
