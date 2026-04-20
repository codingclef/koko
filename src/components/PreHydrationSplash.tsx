'use client'

import { useEffect, useRef } from 'react'

export function PreHydrationSplash() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el) el.style.display = 'none'
  }, [])

  return (
    <div
      ref={ref}
      role="status"
      aria-label="앱을 불러오는 중"
      id="koko-pre-splash"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        id="koko-pre-splash-logo"
        style={{ borderRadius: '9999px', padding: '24px', boxShadow: '0 0 0 1px rgba(0,0,0,0.05)' }}
      >
        {/* next/image requires hydration; this splash must render before hydration */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.webp" alt="" width={96} height={96} />
      </div>
    </div>
  )
}
