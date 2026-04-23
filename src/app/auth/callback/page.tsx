'use client'

import { Suspense, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { parseInviteCodeFromNext } from '@/lib/auth'
import { postJsonWithAuth } from '@/lib/api-client'

function AuthCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const handledRef = useRef(false)
  const fallbackTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const routeToLoginError = (code: string) => {
      if (handledRef.current) return
      handledRef.current = true
      router.replace(`/login?error=${code}`)
    }

    const callbackError = searchParams.get('error')
    if (callbackError) {
      routeToLoginError('auth_callback_failed')
      return
    }

    const handleSession = async () => {
      // 중복 실행 방지 (getSession + onAuthStateChange 둘 다 트리거될 수 있음)
      if (handledRef.current) return
      handledRef.current = true
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current)
        fallbackTimerRef.current = null
      }

      const next = searchParams.get('next') ?? '/calendar'
      const isAppInvite = next.startsWith('/join-app')
      const inviteCode = parseInviteCodeFromNext(next)

      let allowed = false
      let needsOnboarding = false
      try {
        const body = await postJsonWithAuth<{ allowed: boolean; needsOnboarding?: boolean }>(
          '/api/auth/check-allowed',
          {
            inviteCode: isAppInvite ? undefined : inviteCode,
            appInviteCode: isAppInvite ? inviteCode : undefined,
          }
        )
        allowed = body.allowed === true
        needsOnboarding = body.needsOnboarding === true
      } catch (e) {
        console.error('[auth/callback] check-allowed failed:', e)
      }

      if (!allowed) {
        await supabase.auth.signOut()
        router.replace('/login?error=unauthorized')
      } else if (needsOnboarding) {
        router.replace('/onboarding')
      } else {
        router.replace(next)
      }
    }

    // Supabase가 이미 세션을 처리한 경우 (effect 실행 전 자동 교환 완료)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user?.email) {
        handleSession()
        return
      }

      fallbackTimerRef.current = window.setTimeout(() => {
        routeToLoginError('auth_callback_failed')
      }, 800)
    })

    // Supabase가 effect 실행 후 세션을 처리하는 경우
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session && session.user?.email) {
        handleSession()
      } else if (event === 'SIGNED_OUT') {
        routeToLoginError('auth_callback_failed')
      }
    })

    return () => {
      subscription.unsubscribe()
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current)
      }
    }
  }, [router, searchParams])

  return null
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallbackInner />
    </Suspense>
  )
}
