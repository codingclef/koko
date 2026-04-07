'use client'

import { Suspense, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { parseInviteCodeFromNext } from '@/lib/auth'
import { postJson } from '@/lib/api-client'

function AuthCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const handledRef = useRef(false)

  useEffect(() => {
    const handleSession = async (email: string) => {
      // 중복 실행 방지 (getSession + onAuthStateChange 둘 다 트리거될 수 있음)
      if (handledRef.current) return
      handledRef.current = true

      const next = searchParams.get('next') ?? '/calendar'
      const inviteCode = parseInviteCodeFromNext(next)

      let allowed = false
      try {
        const body = await postJson<{ allowed: boolean }>('/api/auth/check-allowed', {
          email,
          inviteCode,
        })
        allowed = body.allowed === true
      } catch (e) {
        console.error('[auth/callback] check-allowed failed:', e)
      }

      if (!allowed) {
        await supabase.auth.signOut()
        router.replace('/login?error=unauthorized')
      } else {
        router.replace(next)
      }
    }

    // Supabase가 이미 세션을 처리한 경우 (effect 실행 전 자동 교환 완료)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        handleSession(session.user.email)
      }
    })

    // Supabase가 effect 실행 후 세션을 처리하는 경우
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user?.email) {
        handleSession(session.user.email)
      }
    })

    return () => subscription.unsubscribe()
  }, [router, searchParams])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 rounded-full border-2 border-accent-300 border-t-accent-500 animate-spin" />
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-accent-300 border-t-accent-500 animate-spin" />
      </div>
    }>
      <AuthCallbackInner />
    </Suspense>
  )
}
