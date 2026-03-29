'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Users } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useFamily } from '@/hooks/useFamily'

export default function JoinPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { loading: familyLoading } = useFamily(user)

  const codeFromUrl = searchParams.get('code')?.toUpperCase() ?? ''
  const [joinCode, setJoinCode] = useState(codeFromUrl)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) {
      const code = searchParams.get('code')?.toUpperCase() ?? ''
      router.replace(`/login?next=/join${code ? `?code=${code}` : ''}`)
    }
  }, [user, authLoading, router, searchParams])

  const handleJoin = async () => {
    if (!joinCode.trim() || !user) return
    setJoining(true)
    setError(null)

    const res = await fetch('/api/family/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, inviteCode: joinCode.trim() }),
    })

    if (!res.ok) {
      const { error: errMsg } = await res.json()
      setError(errMsg === 'Invalid invite code' ? '올바르지 않은 초대 코드예요' : '오류가 발생했어요')
      setJoining(false)
    } else {
      router.replace('/shopping')
    }
  }

  if (authLoading || familyLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-orange-300 border-t-orange-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 min-h-screen flex flex-col items-center justify-center">
      <div className="w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-50 dark:bg-orange-950/40 mb-4">
            <Users size={32} className="text-orange-400" />
          </div>
          <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">가족에 합류하기</h1>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-2">초대 코드를 확인하고 합류하세요</p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 p-6">
          <label className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-3 block">
            초대 코드
          </label>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={6}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 font-mono tracking-widest text-xl text-center focus:outline-none focus:ring-2 focus:ring-orange-300 mb-4"
          />
          {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
          <button
            onClick={handleJoin}
            disabled={joining || joinCode.length < 6}
            className="w-full py-3 rounded-xl bg-orange-400 hover:bg-orange-500 disabled:opacity-50 text-white font-bold text-base transition-colors shadow-sm"
          >
            {joining ? '합류 중...' : '가족에 합류하기'}
          </button>
          <p className="text-xs text-stone-400 dark:text-stone-500 text-center mt-3">
            합류하면 기존 내 가족 데이터는 초기화됩니다
          </p>
        </div>
      </div>
    </div>
  )
}
