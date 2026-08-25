'use client'

import { useEffect, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  LogOut, Share2, Check, Users, Pencil, X,
  Bell, BellOff, ChevronLeft, ChevronRight, UserPlus,
  UserRound, CalendarDays, Smartphone, RefreshCw,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  getFamilyInfo,
  getFamilyMembers,
  getMyFamilyMember,
  updateMyDisplayName,
  updateFamilyName,
  type FamilyMember,
} from '@/lib/family'
import {
  registerPushSubscription,
  repairPushSubscription,
  syncPushSubscriptionIfGranted,
  type PushConnectionStatus,
} from '@/lib/push'
import { ApiClientError, postJsonWithAuth } from '@/lib/api-client'
import { APP_THEMES, DEFAULT_THEME } from '@/lib/preferences'
import type { UserPreferences } from '@/lib/preferences'
import type { AuthState, Tab } from '@/types/tabs'

type SettingsView = 'main' | 'account' | 'family' | 'calendar' | 'app'
type FamilyMembersStatus = 'idle' | 'loading' | 'ready' | 'error'
type NotificationConnectionState = PushConnectionStatus | 'checking' | 'error'

interface FamilyMembersState {
  familyId: string | null
  members: FamilyMember[]
  status: FamilyMembersStatus
}

const SUPPORTED_HOLIDAY_COUNTRIES = [
  { code: 'KR', label: '🇰🇷 한국' },
  { code: 'JP', label: '🇯🇵 일본' },
  { code: 'US', label: '🇺🇸 미국' },
]

interface Props extends AuthState {
  onNavigateToTab: (tab: Tab) => void
  preferences: UserPreferences | null
  updatePreferences: (updates: Partial<Omit<UserPreferences, 'user_id' | 'created_at' | 'updated_at'>>) => Promise<void>
  appRole: 'admin' | 'member'
}

interface SettingsMenuItem {
  view: SettingsView
  label: string
  subtitle: string
  icon: LucideIcon
}


function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-1 mb-6">
      <button
        onClick={onBack}
        className="flex items-center justify-center min-h-[44px] min-w-[44px] -ml-2.5 rounded-xl text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
        aria-label="뒤로"
      >
        <ChevronLeft size={22} />
      </button>
      <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">{title}</h1>
    </div>
  )
}

export function SettingsTab({ onNavigateToTab, preferences, updatePreferences, user, familyId, appRole, isInitializing }: Props) {
  const router = useRouter()
  const logoutTitleId = useId()

  const [view, setView] = useState<SettingsView>('main')

  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [familyName, setFamilyName] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [familyMembersReloadKey, setFamilyMembersReloadKey] = useState(0)
  const [familyMembersState, setFamilyMembersState] = useState<FamilyMembersState>({
    familyId: null,
    members: [],
    status: 'idle',
  })

  // 가족 이름 편집
  const [editingFamilyName, setEditingFamilyName] = useState(false)
  const [familyNameInput, setFamilyNameInput] = useState('')
  const [savingFamilyName, setSavingFamilyName] = useState(false)

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

  // 앱 초대 (admin only)
  const [appInviteCode, setAppInviteCode] = useState<string | null>(null)
  const [appInviteExpiry, setAppInviteExpiry] = useState<string | null>(null)
  const [appInviteCopied, setAppInviteCopied] = useState(false)
  const [creatingAppInvite, setCreatingAppInvite] = useState(false)

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  useEffect(() => {
    if (!showLogoutConfirm) return
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowLogoutConfirm(false) }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [showLogoutConfirm])

  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(
    () => (typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported')
  )
  const [enablingNotif, setEnablingNotif] = useState(false)
  const [repairingNotif, setRepairingNotif] = useState(false)
  const [notifConnection, setNotifConnection] = useState<NotificationConnectionState>(
    notifPermission === 'unsupported' ? 'unsupported' : 'checking'
  )

  useEffect(() => {
    if (view !== 'app' || notifPermission !== 'granted') return

    let cancelled = false
    setNotifConnection('checking')
    syncPushSubscriptionIfGranted()
      .then((status) => {
        if (!cancelled) setNotifConnection(status)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('[SettingsTab] push subscription sync failed:', error)
        setNotifConnection('error')
      })

    return () => {
      cancelled = true
    }
  }, [notifPermission, view])

  useEffect(() => {
    if (!familyId) return
    getFamilyInfo(familyId)
      .then((info) => {
        setInviteCode(info?.invite_code ?? null)
        setFamilyName(info?.name ?? null)
      })
      .catch((e) => console.error('[SettingsTab] getFamilyInfo failed:', e))
  }, [familyId])

  useEffect(() => {
    if (!familyId) return

    const requestFamilyId = familyId
    let cancelled = false
    setFamilyMembersState({ familyId: requestFamilyId, members: [], status: 'loading' })

    getFamilyMembers(requestFamilyId)
      .then((members) => {
        if (cancelled) return
        setFamilyMembersState({ familyId: requestFamilyId, members, status: 'ready' })
      })
      .catch((error) => {
        if (cancelled) return
        console.error('[SettingsTab] getFamilyMembers failed:', error)
        setFamilyMembersState({ familyId: requestFamilyId, members: [], status: 'error' })
      })

    return () => {
      cancelled = true
    }
  }, [familyId, familyMembersReloadKey])

  useEffect(() => {
    if (!user) return
    getMyFamilyMember(user.id)
      .then((m) => setMyDisplayName(m?.display_name ?? null))
      .catch((e) => console.error('[SettingsTab] getMyFamilyMember failed:', e))
  }, [user])

  const handleEnableNotifications = async () => {
    if (!user) return
    setEnablingNotif(true)
    try {
      const status = await registerPushSubscription()
      setNotifPermission(Notification.permission)
      setNotifConnection(status)
    } catch (error) {
      console.error('[SettingsTab] registerPushSubscription failed:', error)
      setNotifConnection('error')
    } finally {
      setEnablingNotif(false)
    }
  }

  const handleRepairNotifications = async () => {
    setRepairingNotif(true)
    setNotifConnection('checking')
    try {
      const status = await repairPushSubscription()
      setNotifConnection(status)
    } catch (error) {
      console.error('[SettingsTab] repairPushSubscription failed:', error)
      setNotifConnection('error')
    } finally {
      setRepairingNotif(false)
    }
  }

  const handleStartEditFamilyName = () => {
    setFamilyNameInput(familyName ?? '')
    setEditingFamilyName(true)
  }

  const handleSaveFamilyName = async () => {
    if (!familyId || !familyNameInput.trim()) return
    setSavingFamilyName(true)
    try {
      await updateFamilyName(familyId, familyNameInput.trim())
      setFamilyName(familyNameInput.trim())
      setEditingFamilyName(false)
    } catch (e) {
      console.error('[SettingsTab] updateFamilyName failed:', e)
    } finally {
      setSavingFamilyName(false)
    }
  }

  const handleCreateAppInvite = async () => {
    setCreatingAppInvite(true)
    try {
      const { invite } = await postJsonWithAuth<{ invite: { code: string; expires_at: string } }>(
        '/api/app-invite'
      )
      setAppInviteCode(invite.code)
      setAppInviteExpiry(invite.expires_at)
    } catch (e) {
      console.error('[SettingsTab] createAppInvite failed:', e)
    } finally {
      setCreatingAppInvite(false)
    }
  }

  const handleShareAppInvite = async () => {
    if (!appInviteCode) return
    const url = `${window.location.origin}/join-app?code=${appInviteCode}`
    const shareData = {
      title: 'Koko 앱 초대',
      text: 'Koko 앱에 초대합니다. 링크를 눌러 시작하세요!',
      url,
    }
    if (navigator.share) {
      await navigator.share(shareData)
    } else {
      await navigator.clipboard.writeText(url)
      setAppInviteCopied(true)
      setTimeout(() => setAppInviteCopied(false), 2000)
    }
  }

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
    try {
      await postJsonWithAuth('/api/family/join', {
        inviteCode: joinCode.trim(),
        displayName: joinDisplayName.trim() || undefined,
      })
      onNavigateToTab('reminders')
    } catch (e) {
      setJoinError(
        e instanceof ApiClientError && e.message === 'Invalid invite code'
          ? '올바르지 않은 초대 코드예요'
          : '오류가 발생했어요'
      )
    } finally {
      setJoining(false)
    }
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
    setShowLogoutConfirm(false)
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (isInitializing) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-accent-300 border-t-accent-500 animate-spin" />
      </div>
    )
  }

  // ── 계정 ────────────────────────────────────────────────────
  if (view === 'account') {
    return (
      <div data-testid="settings-subview-container" className="min-h-full px-4 pt-2 pb-24 sm:px-6">
        <SubHeader title="계정" onBack={() => setView('main')} />

        <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 p-4 mb-4">
          <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-2">이메일</p>
          <p className="text-sm text-stone-700 dark:text-stone-300">{user?.email}</p>
        </div>

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
                  className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-stone-800 dark:text-stone-100">{myDisplayName}</p>
                <button
                  onClick={handleStartEditName}
                  className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                >
                  <Pencil size={15} />
                </button>
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl border border-red-100 dark:border-red-900/40 text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 font-semibold text-sm transition-colors"
        >
          <LogOut size={16} />
          로그아웃
        </button>

        {showLogoutConfirm && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={logoutTitleId}
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 pb-16 sm:pb-4"
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowLogoutConfirm(false)} />
            <div className="relative bg-stone-50 dark:bg-stone-900 rounded-2xl w-full sm:max-w-xs p-6 shadow-xl">
              <p id={logoutTitleId} className="font-semibold text-stone-800 dark:text-stone-100 mb-1">로그아웃</p>
              <p className="text-sm text-stone-500 dark:text-stone-400 mb-6">정말 로그아웃 하시겠어요?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-semibold text-sm transition-colors hover:bg-stone-200 dark:hover:bg-stone-700"
                >
                  취소
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors"
                >
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── 가족 ────────────────────────────────────────────────────
  if (view === 'family') {
    const currentFamilyMembersState = familyMembersState.familyId === familyId
      ? familyMembersState
      : { familyId, members: [], status: 'loading' as const }

    return (
      <div data-testid="settings-subview-container" className="min-h-full px-4 pt-2 pb-24 sm:px-6">
        <SubHeader title="가족" onBack={() => setView('main')} />

        {/* 가족 이름 */}
        <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 p-4 mb-4">
          <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-3">가족 이름</p>
          {editingFamilyName ? (
            <div className="flex gap-2">
              <input
                value={familyNameInput}
                onChange={(e) => setFamilyNameInput(e.target.value)}
                placeholder="가족 이름 입력"
                maxLength={30}
                autoFocus
                className="flex-1 px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent-300"
              />
              <button
                onClick={handleSaveFamilyName}
                disabled={savingFamilyName || !familyNameInput.trim()}
                className="px-4 py-2 rounded-xl bg-accent-400 hover:bg-accent-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
              >
                저장
              </button>
              <button
                onClick={() => setEditingFamilyName(false)}
                className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-stone-800 dark:text-stone-100">{familyName ?? '—'}</p>
              <button
                onClick={handleStartEditFamilyName}
                className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              >
                <Pencil size={15} />
              </button>
            </div>
          )}
        </div>

        {/* 가족 구성원 */}
        <section
          aria-labelledby="family-members-title"
          data-testid="family-members-section"
          className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 mb-4 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-accent-500 dark:text-accent-300" aria-hidden="true" />
              <h2 id="family-members-title" className="text-sm font-semibold text-stone-800 dark:text-stone-100">
                가족 구성원
              </h2>
            </div>
            {currentFamilyMembersState.status === 'ready' && (
              <span className="text-xs font-medium text-stone-400 dark:text-stone-500">
                {currentFamilyMembersState.members.length}명
              </span>
            )}
          </div>

          {currentFamilyMembersState.status === 'loading' && (
            <div role="status" aria-label="가족 구성원을 불러오는 중" className="border-t border-stone-100 px-4 py-4 dark:border-stone-800">
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-stone-100 dark:bg-stone-800" />
                <span className="h-4 w-24 animate-pulse rounded bg-stone-100 dark:bg-stone-800" />
              </div>
            </div>
          )}

          {currentFamilyMembersState.status === 'error' && (
            <div className="flex items-center justify-between gap-3 border-t border-stone-100 px-4 py-3.5 dark:border-stone-800">
              <p className="text-sm text-stone-500 dark:text-stone-400">구성원을 불러오지 못했어요</p>
              <button
                type="button"
                onClick={() => setFamilyMembersReloadKey((key) => key + 1)}
                className="shrink-0 text-sm font-semibold text-accent-500 hover:text-accent-600 dark:text-accent-300 dark:hover:text-accent-200"
              >
                다시 시도
              </button>
            </div>
          )}

          {currentFamilyMembersState.status === 'ready' && currentFamilyMembersState.members.length === 0 && (
            <p className="border-t border-stone-100 px-4 py-4 text-sm text-stone-500 dark:border-stone-800 dark:text-stone-400">
              표시할 구성원이 없어요
            </p>
          )}

          {currentFamilyMembersState.status === 'ready' && currentFamilyMembersState.members.length > 0 && (
            <ul className="border-t border-stone-100 dark:border-stone-800">
              {currentFamilyMembersState.members.map((member, index) => {
                const displayName = member.display_name.trim() || '이름 없음'
                const isCurrentUser = member.user_id === user?.id
                const initial = Array.from(displayName)[0]?.toUpperCase() ?? '?'

                return (
                  <li
                    key={member.id}
                    className={`flex min-h-[64px] items-center gap-3 px-4 py-2.5 ${
                      index < currentFamilyMembersState.members.length - 1
                        ? 'border-b border-stone-100 dark:border-stone-800'
                        : ''
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        isCurrentUser
                          ? 'bg-accent-100 text-accent-600 dark:bg-accent-950/50 dark:text-accent-300'
                          : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400'
                      }`}
                    >
                      {initial}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                      {displayName}
                    </span>
                    {isCurrentUser && (
                      <span className="shrink-0 text-xs font-semibold text-accent-500 dark:text-accent-300">나</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* 가족 초대 코드 */}
        <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 p-4 mb-4">
          <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-3">내 가족에 초대</p>
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
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-2">
            이 코드로 초대받은 사람은 현재 가족에 합류합니다
          </p>
        </div>

        {/* 앱 초대 (admin only) */}
        {appRole === 'admin' && (
          <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 p-4 mb-4">
            <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-1">
              <UserPlus size={12} className="inline mr-1" />
              앱 초대
            </p>
            <p className="text-xs text-stone-400 dark:text-stone-500 mb-3">
              새 가족을 만들어 앱을 시작하도록 초대합니다. 초대 링크는 1회용이며 7일간 유효합니다.
            </p>
            {appInviteCode ? (
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="flex-1 text-sm font-bold tracking-widest text-stone-800 dark:text-stone-100 font-mono break-all">
                    {appInviteCode}
                  </span>
                  <button
                    onClick={handleShareAppInvite}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent-400 hover:bg-accent-500 text-white text-sm font-semibold transition-colors shadow-sm shrink-0"
                  >
                    {appInviteCopied ? <Check size={14} /> : <Share2 size={14} />}
                    {appInviteCopied ? '복사됨' : '공유'}
                  </button>
                </div>
                {appInviteExpiry && (
                  <p className="text-xs text-stone-400 dark:text-stone-500">
                    만료: {new Date(appInviteExpiry).toLocaleDateString('ko-KR')}
                  </p>
                )}
                <button
                  onClick={() => { setAppInviteCode(null); setAppInviteExpiry(null) }}
                  className="mt-2 text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 underline"
                >
                  새 초대 코드 만들기
                </button>
              </div>
            ) : (
              <button
                onClick={handleCreateAppInvite}
                disabled={creatingAppInvite}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent-400 hover:bg-accent-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
              >
                <UserPlus size={15} />
                {creatingAppInvite ? '생성 중...' : '초대 코드 만들기'}
              </button>
            )}
          </div>
        )}

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
      </div>
    )
  }

  // ── 캘린더 ──────────────────────────────────────────────────
  if (view === 'calendar') {
    return (
      <div data-testid="settings-subview-container" className="min-h-full px-4 pt-2 pb-24 sm:px-6">
        <SubHeader title="캘린더" onBack={() => setView('main')} />

        <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 p-4 mb-4">
          <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-3">캘린더 표시</p>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-stone-700 dark:text-stone-300">음력</span>
            <button
              role="switch"
              aria-checked={preferences?.show_lunar ?? false}
              onClick={() => updatePreferences({ show_lunar: !(preferences?.show_lunar ?? false) })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                (preferences?.show_lunar ?? false) ? 'bg-accent-400' : 'bg-stone-200 dark:bg-stone-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  (preferences?.show_lunar ?? false) ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 p-4 mb-4">
          <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-3">휴일 표시</p>
          <p className="text-xs text-stone-400 dark:text-stone-500 mb-3">캘린더에 표시할 나라의 공휴일을 선택하세요</p>
          <div className="space-y-2">
            {SUPPORTED_HOLIDAY_COUNTRIES.map(({ code, label }) => {
              const selected = preferences?.holiday_countries?.includes(code) ?? false
              return (
                <button
                  key={code}
                  onClick={() => {
                    const current = preferences?.holiday_countries ?? []
                    const next = selected ? current.filter((c) => c !== code) : [...current, code]
                    updatePreferences({ holiday_countries: next })
                  }}
                  className={`w-full flex items-center justify-between px-3 py-3 rounded-xl border transition-colors ${
                    selected
                      ? 'border-accent-300 bg-accent-50 dark:bg-accent-950/30 dark:border-accent-700'
                      : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800'
                  }`}
                >
                  <span className="text-sm text-stone-700 dark:text-stone-300">{label}</span>
                  <span
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      selected ? 'border-accent-400 bg-accent-400' : 'border-stone-300 dark:border-stone-600'
                    }`}
                  >
                    {selected && <Check size={11} strokeWidth={3} className="text-white" />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── 앱 ──────────────────────────────────────────────────────
  if (view === 'app') {
    return (
      <div data-testid="settings-subview-container" className="min-h-full px-4 pt-2 pb-24 sm:px-6">
        <SubHeader title="앱" onBack={() => setView('main')} />

        {notifPermission !== 'unsupported' && (
          <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 p-4 mb-4">
            <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-3">알림</p>
            {notifPermission === 'granted' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
                  {notifConnection === 'connected' ? (
                    <Bell size={15} className="text-accent-400" />
                  ) : (
                    <BellOff size={15} />
                  )}
                  {notifConnection === 'checking' && '알림 연결을 확인하고 있습니다'}
                  {notifConnection === 'connected' && '알림이 연결되어 있습니다'}
                  {notifConnection === 'error' && '알림 연결을 확인하지 못했습니다'}
                  {['permission-required', 'blocked', 'unsupported'].includes(notifConnection) &&
                    '알림 연결이 필요합니다'}
                </div>
                <button
                  onClick={() => void handleRepairNotifications()}
                  disabled={repairingNotif || notifConnection === 'checking'}
                  className="flex min-h-[44px] items-center gap-2 rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  <RefreshCw size={15} className={repairingNotif ? 'animate-spin' : undefined} />
                  {repairingNotif ? '다시 연결 중...' : '알림 다시 연결'}
                </button>
              </div>
            )}
            {notifPermission === 'denied' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                  <BellOff size={15} />
                  알림이 차단되어 있습니다
                </div>
                <p className="text-xs text-stone-400 dark:text-stone-500">
                  브라우저 설정에서 이 사이트의 알림 권한을 허용으로 변경해주세요
                </p>
              </div>
            )}
            {notifPermission === 'default' && (
              <button
                onClick={handleEnableNotifications}
                disabled={enablingNotif}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent-400 hover:bg-accent-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
              >
                <Bell size={15} />
                {enablingNotif ? '설정 중...' : '알림 허용하기'}
              </button>
            )}
          </div>
        )}

        <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 p-4 mb-4">
          <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-3">테마 색상</p>
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
      </div>
    )
  }

  // ── 메인 ────────────────────────────────────────────────────
  const profileName = myDisplayName?.trim() || user?.email?.split('@')[0] || 'Koko 사용자'
  const profileInitial = Array.from(profileName)[0]?.toUpperCase() ?? 'K'
  const holidayCountryCount = preferences?.holiday_countries?.length ?? 0
  const currentThemeLabel = APP_THEMES.find(
    ({ key }) => key === (preferences?.app_theme ?? DEFAULT_THEME)
  )?.label ?? '기본'

  const menuSections: { id: string; label: string; items: SettingsMenuItem[] }[] = [
    {
      id: 'people',
      label: '나와 가족',
      items: [
        { view: 'account', label: '계정', subtitle: '이름 및 로그인 정보', icon: UserRound },
        { view: 'family', label: '가족', subtitle: familyName ?? '가족 정보와 초대', icon: Users },
      ],
    },
    {
      id: 'preferences',
      label: '화면 및 알림',
      items: [
        {
          view: 'calendar',
          label: '캘린더',
          subtitle: `휴일 ${holidayCountryCount ? `${holidayCountryCount}개 국가` : '표시 안 함'} · 음력 ${(preferences?.show_lunar ?? false) ? '표시' : '숨김'}`,
          icon: CalendarDays,
        },
        { view: 'app', label: '앱', subtitle: `알림 및 테마 · ${currentThemeLabel}`, icon: Smartphone },
      ],
    },
  ]

  return (
    <div data-testid="settings-main-container" className="min-h-full px-4 pt-2 pb-24 sm:px-6">
      <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">설정</h1>

      <div className="mt-5 flex items-center gap-3 border-b border-stone-200 pb-5 dark:border-stone-800">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-100 text-lg font-bold text-accent-600 dark:bg-accent-950/50 dark:text-accent-300"
        >
          {profileInitial}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-stone-800 dark:text-stone-100">{profileName}</p>
          {user?.email && (
            <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">{user.email}</p>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {menuSections.map((section) => (
          <section key={section.id} aria-labelledby={`settings-${section.id}`}>
            <h2
              id={`settings-${section.id}`}
              className="mb-2 px-1 text-xs font-semibold text-stone-500 dark:text-stone-400"
            >
              {section.label}
            </h2>
            <div className="overflow-hidden rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
              {section.items.map(({ view: target, label, subtitle, icon: Icon }, index) => (
                <button
                  key={target}
                  onClick={() => setView(target)}
                  className={`flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-stone-50 active:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-300 dark:hover:bg-stone-800/70 dark:active:bg-stone-800 ${
                    index < section.items.length - 1 ? 'border-b border-stone-100 dark:border-stone-800' : ''
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-500 dark:bg-accent-950/40 dark:text-accent-300">
                    <Icon size={19} strokeWidth={1.9} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-stone-800 dark:text-stone-100">{label}</span>
                    <span className="mt-0.5 block truncate text-xs leading-5 text-stone-500 dark:text-stone-400">{subtitle}</span>
                  </span>
                  <ChevronRight size={18} strokeWidth={1.8} className="shrink-0 text-stone-400 dark:text-stone-500" aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
