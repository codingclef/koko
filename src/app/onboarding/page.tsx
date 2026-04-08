'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Home } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useFamily } from '@/hooks/useFamily'
import { ApiClientError, postJsonWithAuth } from '@/lib/api-client'

export default function OnboardingPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { familyId, loading: familyLoading } = useFamily(user)

  const [familyName, setFamilyName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 인증 안 됨 → 로그인
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login')
    }
  }, [user, authLoading, router])

  // 이미 가족이 있음 → 앱으로
  useEffect(() => {
    if (!authLoading && !familyLoading && user && familyId) {
      router.replace('/calendar')
    }
  }, [authLoading, familyLoading, user, familyId, router])

  const handleCreate = async () => {
    if (!familyName.trim()) return
    setSaving(true)
    setError(null)
    try {
      await postJsonWithAuth('/api/family/create', { name: familyName.trim() })
      router.replace('/calendar')
    } catch (e) {
      setError(
        e instanceof ApiClientError ? e.message : '오류가 발생했어요. 다시 시도해주세요.'
      )
    } finally {
      setSaving(false)
    }
  }

  const isLoading = authLoading || familyLoading

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-accent-300 border-t-accent-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-white dark:bg-stone-950">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-50 dark:bg-accent-950/40 mb-4">
            <Home size={32} className="text-accent-400" />
          </div>
          <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">가족 이름을 정해주세요</h1>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-2">
            Koko에서 사용할 가족 이름을 입력해주세요
          </p>
        </div>

        <div className="w-full rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 p-6">
          <label className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-3 block">
            가족 이름
          </label>
          <input
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            placeholder="예: 김씨 가족, 우리집"
            maxLength={30}
            autoFocus
            className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-base focus:outline-none focus:ring-2 focus:ring-accent-300 mb-4"
          />
          {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={saving || !familyName.trim()}
            className="w-full py-3 rounded-xl bg-accent-400 hover:bg-accent-500 disabled:opacity-50 text-white font-bold text-base transition-colors shadow-sm"
          >
            {saving ? '만드는 중...' : '시작하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
