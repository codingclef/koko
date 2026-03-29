'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { parseInviteCodeFromNext } from '@/lib/auth'

function AuthCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) {
      router.replace('/login')
      return
    }

    supabase.auth.exchangeCodeForSession(code).then(async ({ data, error }) => {
      if (error) {
        console.error('[auth/callback] session error:', error)
        router.replace('/login')
        return
      }

      const email = data.user?.email ?? ''
      const next = searchParams.get('next') ?? '/shopping'
      const inviteCode = parseInviteCodeFromNext(next)

      let allowed = false
      try {
        const res = await fetch('/api/auth/check-allowed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, inviteCode }),
        })
        console.log('[auth/callback] check-allowed status:', res.status)
        if (res.ok) {
          const body = await res.json()
          console.log('[auth/callback] check-allowed body:', body)
          allowed = body.allowed === true
        }
      } catch (e) {
        console.error('[auth/callback] check-allowed failed:', e)
      }

      if (!allowed) {
        await supabase.auth.signOut()
        router.replace('/login?error=unauthorized')
        return
      }

      router.replace(next)
    })
  }, [router, searchParams])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 rounded-full border-2 border-orange-300 border-t-orange-500 animate-spin" />
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-orange-300 border-t-orange-500 animate-spin" />
      </div>
    }>
      <AuthCallbackInner />
    </Suspense>
  )
}
