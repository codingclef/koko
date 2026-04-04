'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Share2, Check, Users, Pencil, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getMyFamilyMember, updateMyDisplayName } from '@/lib/family'
import { APP_THEMES, DEFAULT_THEME } from '@/lib/preferences'
import type { UserPreferences } from '@/lib/preferences'
import type { AuthState } from '@/types/tabs'

const SUPPORTED_HOLIDAY_COUNTRIES = [
  { code: 'KR', label: '🇰🇷 한국' },
  { code: 'JP', label: '🇯🇵 일본' },
  { code: 'US', label: '🇺🇸 미국' },
]


interface Props extends AuthState {
  onNavigateToTab: (tab: 'calendar' | 'shopping' | 'settings') => void
  preferences: UserPreferences | null
  updatePreferences: (updates: Partial<Omit<UserPreferences, 'user_id' | 'created_at' | 'updated_at'>>) => Promise<void>
}

export function SettingsTab({ onNavigateToTab, preferences, updatePreferences, user, familyId, isInitializing }: Props) {
  const router = useRouter()

  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // 합류 폼
  const [joinCode, setJoinCode] = useState('')
  const [joinDisplayName, setJoinDisplayName] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  // 내 이름 편집
  const [myDisplayName, setMyDisplayName] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)

  useEffect(() => {
    if (!familyId) return
    supabase
      .from('families')
      .select('invite_code')
      .eq('id', familyId)
      .single()
      .then(({ data }) => setInviteCode(data?.invite_code ?? null))
  }, [familyId])

  useEffect(() => {
    if (!user) return
    getMyFamilyMember(user.id)
      .then((m) => setMyDisplayName(m?.display_name ?? null))
      .catch((e) => console.error('[SettingsTab] getMyFamilyMember failed:', e))
  }, [user])

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
      body: JSON.stringify({
        userId: user.id,
        inviteCode: joinCode.trim(),
        displayName: joinDisplayName.trim() || undefined,
      }),
    })

    if (!res.ok) {
      const { error } = await res.json()
      setJoinError(error === 'Invalid invite code' ? '올바르지 않은 초대 코드예요' : '오류가 발생했어요')
    } else {
      onNavigateToTab('shopping')
    }
    setJoining(false)
  }

  const handleStartEditName = () => {
    setNameInput(myDisplayName ?? '')
    setEditingName(true)
  }

  const handleSaveName = async () => {
    if (!user || !nameInput.trim()) return
    setSavingName(true)
    try {
      await updateMyDisplayName(user.id, nameInput.trim())
      setMyDisplayName(nameInput.trim())
      setEditingName(false)
    } catch (e) {
      console.error('[SettingsTab] updateMyDisplayName failed:', e)
    } finally {
      setSavingName(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-accent-300 border-t-accent-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 pb-24 min-h-screen">
      <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100 mb-6">설정</h1>

      {/* 계정 */}
      <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 p-4 mb-4">
        <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-2">계정</p>
        <p className="text-sm text-stone-700 dark:text-stone-300">{user?.email}</p>
      </div>

      {/* 내 이름 */}
      {myDisplayName !== null && (
        <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 p-4 mb-4">
          <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-3">내 이름</p>
          {editingName ? (
            <div className="flex gap-2">
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="이름 입력"
                maxLength={20}
                autoFocus
                className="flex-1 px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent-300"
              />
              <button
                onClick={handleSaveName}
                disabled={savingName || !nameInput.trim()}
                className="px-4 py-2 rounded-xl bg-accent-400 hover:bg-accent-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
              >
                저장
              </button>
              <button
                onClick={() => setEditingName(false)}
                className="p-2 rounded-xl text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-stone-800 dark:text-stone-100">{myDisplayName}</p>
              <button
                onClick={handleStartEditName}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              >
                <Pencil size={15} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* 우리 가족 초대 코드 */}
      <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 p-4 mb-4">
        <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-3">우리 가족 초대 코드</p>
        <div className="flex items-center gap-3">
          <span className="flex-1 text-2xl font-bold tracking-widest text-stone-800 dark:text-stone-100 font-mono">
            {inviteCode ?? '------'}
          </span>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent-400 hover:bg-accent-500 text-white text-sm font-semibold transition-colors shadow-sm"
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
        <div className="space-y-2">
          <input
            value={joinDisplayName}
            onChange={(e) => setJoinDisplayName(e.target.value)}
            placeholder="내 이름 (예: 엄마, 홍길동)"
            maxLength={20}
            className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent-300"
          />
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="초대 코드 입력"
              maxLength={6}
              className="flex-1 px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 font-mono tracking-widest text-sm focus:outline-none focus:ring-2 focus:ring-accent-300"
            />
            <button
              onClick={handleJoin}
              disabled={joining || joinCode.length < 6}
              className="px-4 py-2 rounded-xl bg-accent-400 hover:bg-accent-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
            >
              {joining ? '합류 중...' : '합류'}
            </button>
          </div>
        </div>
        {joinError && <p className="text-xs text-red-400 mt-2">{joinError}</p>}
        <p className="text-xs text-stone-400 dark:text-stone-500 mt-2">합류하면 현재 내 가족에서 나가고 새 가족으로 이동합니다</p>
      </div>

      {/* 휴일 표시 */}
      <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 p-4 mb-4">
        <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-3">
          휴일 표시
        </p>
        <p className="text-xs text-stone-400 dark:text-stone-500 mb-3">
          캘린더에 표시할 나라의 공휴일을 선택하세요
        </p>
        <div className="space-y-2">
          {SUPPORTED_HOLIDAY_COUNTRIES.map(({ code, label }) => {
            const selected = preferences?.holiday_countries?.includes(code) ?? false
            return (
              <button
                key={code}
                onClick={() => {
                  const current = preferences?.holiday_countries ?? []
                  const next = selected
                    ? current.filter((c) => c !== code)
                    : [...current, code]
                  updatePreferences({ holiday_countries: next })
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${
                  selected
                    ? 'border-accent-300 bg-accent-50 dark:bg-accent-950/30 dark:border-accent-700'
                    : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800'
                }`}
              >
                <span className="text-sm text-stone-700 dark:text-stone-300">{label}</span>
                <span
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    selected
                      ? 'border-accent-400 bg-accent-400'
                      : 'border-stone-300 dark:border-stone-600'
                  }`}
                >
                  {selected && <Check size={11} strokeWidth={3} className="text-white" />}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 p-4 mb-4">
        <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-3">
          테마 색상
        </p>
        <div className="grid grid-cols-3 gap-2">
          {APP_THEMES.map(({ key, label, color }) => {
            const selected = (preferences?.app_theme ?? DEFAULT_THEME) === key
            return (
              <button
                key={key}
                onClick={() => updatePreferences({ app_theme: key })}
                className={`flex flex-col items-center gap-2 py-3 px-2 rounded-xl border transition-all ${
                  selected
                    ? 'border-stone-400 bg-stone-50 dark:bg-stone-800'
                    : 'border-stone-100 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/60'
                }`}
              >
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center shadow-sm"
                  style={{ backgroundColor: color }}
                >
                  {selected && <Check size={14} strokeWidth={3} className="text-white" />}
                </span>
                <span className="text-xs text-stone-600 dark:text-stone-400 font-medium">{label}</span>
              </button>
            )
          })}
        </div>
      </div>

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
