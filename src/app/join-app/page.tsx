'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Home } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

function JoinAppInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const code = searchParams.get('code')?.toUpperCase() ?? ''

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      // 비로그인 → 로그인 페이지로, next에 이 URL을 보존
      router.replace(`/login?next=/join-app${code ? `?code=${code}` : ''}`)
    } else {
      // 이미 로그인된 사용자 → 앱으로
      router.replace('/calendar')
    }
  }, [user, authLoading, router, code])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 rounded-full border-2 border-accent-300 border-t-accent-500 animate-spin" />
    </div>
  )
}

function JoinAppFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-50 dark:bg-accent-950/40 mb-4">
        <Home size={32} className="text-accent-400" />
      </div>
      <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">Koko</h1>
      <p className="text-sm text-stone-400 dark:text-stone-500 mt-2">초대 링크 확인 중...</p>
    </div>
  )
}

export default function JoinAppPage() {
  return (
    <Suspense fallback={<JoinAppFallback />}>
      <JoinAppInner />
    </Suspense>
  )
}
