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
        background: '#fafaf9',
      }}
    >
      {/* next/image requires hydration; this splash must render before hydration */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.webp"
        alt=""
        width={96}
        height={96}
        style={{
          borderRadius: '9999px',
          padding: '24px',
          background: 'rgba(245,245,244,0.8)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.05)',
        }}
      />
    </div>
  )
}
