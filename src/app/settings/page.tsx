'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Share2, Copy, Check, Users } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useFamily } from '@/hooks/useFamily'
import { supabase } from '@/lib/supabase'

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth()
  const { familyId, loading: familyLoading } = useFamily(user)
  const router = useRouter()
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (!familyId) return
    supabase
      .from('families')
      .select('invite_code')
      .eq('id', familyId)
      .single()
      .then(({ data }) => setInviteCode(data?.invite_code ?? null))
  }, [familyId])

  const handleShare = async () => {
    if (!inviteCode) return
    const url = `${window.location.origin}/join?code=${inviteCode}`
    const shareData = {
      title: 'Koko 가족 초대',
      text: `Koko 앱에서 우리 가족에 합류하세요! 초대 코드: ${inviteCode}`,
      url,
    }
    if (navigator.share) {
      await navigator.share(shareData)
    } else {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleJoin = async () => {
    if (!joinCode.trim() || !user) return
    setJoining(true)
    setJoinError(null)

    const res = await fetch('/api/family/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, inviteCode: joinCode.trim() }),
    })

    if (!res.ok) {
      const { error } = await res.json()
      setJoinError(error === 'Invalid invite code' ? '올바르지 않은 초대 코드예요' : '오류가 발생했어요')
    } else {
      router.replace('/shopping')
    }
    setJoining(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (authLoading || familyLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-orange-300 border-t-orange-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 min-h-screen">
      <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100 mb-6">설정</h1>

      {/* 계정 정보 */}
      <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 p-4 mb-4">
        <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-2">계정</p>
        <p className="text-sm text-stone-700 dark:text-stone-300">{user?.email}</p>
      </div>

      {/* 초대 코드 */}
      <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 p-4 mb-4">
        <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-3">우리 가족 초대 코드</p>
        <div className="flex items-center gap-3">
          <span className="flex-1 text-2xl font-bold tracking-widest text-stone-800 dark:text-stone-100 font-mono">
            {inviteCode ?? '------'}
          </span>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-400 hover:bg-orange-500 text-white text-sm font-semibold transition-colors shadow-sm"
          >
            {copied ? <Check size={14} /> : <Share2 size={14} />}
            {copied ? '복사됨' : '초대하기'}
          </button>
        </div>
        <p className="text-xs text-stone-400 dark:text-stone-500 mt-2">버튼을 눌러 카카오톡, 문자 등으로 공유하세요</p>
      </div>

      {/* 가족 합류 */}
      <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 p-4 mb-4">
        <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-3">
          <Users size={12} className="inline mr-1" />
          가족 합류
        </p>
        <div className="flex gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="초대 코드 입력"
            maxLength={6}
            className="flex-1 px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 font-mono tracking-widest text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
          <button
            onClick={handleJoin}
            disabled={joining || joinCode.length < 6}
            className="px-4 py-2 rounded-xl bg-orange-400 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
          >
            {joining ? '합류 중...' : '합류'}
          </button>
        </div>
        {joinError && <p className="text-xs text-red-400 mt-2">{joinError}</p>}
        <p className="text-xs text-stone-400 dark:text-stone-500 mt-2">합류하면 기존 내 가족 데이터는 초기화됩니다</p>
      </div>

      {/* 로그아웃 */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-red-100 dark:border-red-900/40 text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 font-semibold text-sm transition-colors"
      >
        <LogOut size={16} />
        로그아웃
      </button>
    </div>
  )
}
