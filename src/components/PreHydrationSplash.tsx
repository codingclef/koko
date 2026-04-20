'use client'

import { useEffect, useState } from 'react'

export function PreHydrationSplash() {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    setHidden(true)
  }, [])

  if (hidden) return null

  return (
    <div
      role="status"
      aria-label="앱을 불러오는 중"
      id="koko-pre-splash"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--background)]"
    >
      {/* next/image requires hydration; this splash must render before hydration */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.webp"
        alt=""
        width={96}
        height={96}
        className="rounded-full bg-[var(--surface-overlay)] p-6 ring-1 ring-[var(--surface-ring)]"
      />
    </div>
  )
}
