'use client'

import { Suspense, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { parseInviteCodeFromNext } from '@/lib/auth'
import { postJson } from '@/lib/api-client'
import { AppSplash } from '@/components/AppSplash'

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
      const isAppInvite = next.startsWith('/join-app')
      const inviteCode = parseInviteCodeFromNext(next)

      let allowed = false
      let needsOnboarding = false
      try {
        const body = await postJson<{ allowed: boolean; needsOnboarding?: boolean }>(
          '/api/auth/check-allowed',
          {
            email,
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
    <AppSplash />
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<AppSplash />}>
      <AuthCallbackInner />
    </Suspense>
  )
}
