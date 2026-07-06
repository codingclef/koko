'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarTab } from '@/components/tabs/CalendarTab'
import { BottomNav } from '@/components/BottomNav'
import { useAuth } from '@/hooks/useAuth'
import { useFamily } from '@/hooks/useFamily'
import { useCalendars } from '@/hooks/useCalendars'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import { type Tab, TABS } from '@/types/tabs'
import { AppSplash } from '@/components/AppSplash'

const IDLE_PRELOAD_TABS: Tab[] = ['reminders', 'settings']

type RequestIdleCallback = (callback: () => void, options?: { timeout?: number }) => number
type CancelIdleCallback = (handle: number) => void

const ReminderTab = dynamic(
  () => import('@/components/tabs/ReminderTab').then((mod) => mod.ReminderTab),
  { loading: () => <TabChunkFallback /> }
)

const SettingsTab = dynamic(
  () => import('@/components/tabs/SettingsTab').then((mod) => mod.SettingsTab),
  { loading: () => <TabChunkFallback /> }
)

function TabChunkFallback() {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-5rem)]">
      <div className="w-8 h-8 rounded-full border-2 border-accent-300 border-t-accent-500 animate-spin" />
    </div>
  )
}

function scheduleIdlePreload(callback: () => void) {
  if (typeof window === 'undefined') return () => {}

  const idleWindow = window as Window & {
    requestIdleCallback?: RequestIdleCallback
    cancelIdleCallback?: CancelIdleCallback
  }

  if (idleWindow.requestIdleCallback && idleWindow.cancelIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback, { timeout: 2000 })
    return () => idleWindow.cancelIdleCallback?.(handle)
  }

  const handle = window.setTimeout(callback, 1200)
  return () => window.clearTimeout(handle)
}

export function TabsShell() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { familyId, appRole, loading: familyLoading, error: familyError, reload: reloadFamily } = useFamily(user)
  const {
    calendars,
    loading: calendarsLoading,
    error: calendarsError,
    reload: reloadCalendars,
  } = useCalendars(familyId)
  const { preferences, updatePreferences } = useUserPreferences(user)
  const shouldLoadCalendars = Boolean(familyId) && !familyError
  const isInitializing = authLoading || familyLoading || (shouldLoadCalendars && calendarsLoading)
  const startupError = !isInitializing ? (familyError || calendarsError) : null

  // 인증됨 + 앱 접근권 있음 + 아직 가족 없음 → 온보딩 필요
  // familyError가 있으면 DB 장애로 판단, 온보딩으로 잘못 보내지 않는다
  const needsFamilyOnboarding =
    !authLoading && !familyLoading && !familyError && Boolean(user) && familyId === null

  const tabParam = searchParams.get('tab')
  const activeTab: Tab = tabParam && TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'calendar'
  const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(() => new Set(['calendar', activeTab]))

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [user, authLoading, router])

  useEffect(() => {
    if (needsFamilyOnboarding) router.replace('/onboarding')
  }, [needsFamilyOnboarding, router])

  useEffect(() => {
    if (!preferences?.app_theme) return
    const current = document.documentElement.getAttribute('data-theme')
    if (current !== preferences.app_theme) {
      document.documentElement.setAttribute('data-theme', preferences.app_theme)
    }
  }, [preferences?.app_theme])

  useEffect(() => {
    let cancelled = false

    // Mount URL-selected tabs on the next tick to avoid cascading effect updates.
    queueMicrotask(() => {
      if (cancelled) return
      setMountedTabs((prev) => {
        if (prev.has(activeTab)) return prev
        const next = new Set(prev)
        next.add(activeTab)
        return next
      })
    })

    return () => {
      cancelled = true
    }
  }, [activeTab])

  useEffect(() => {
    if (isInitializing || startupError || !user || needsFamilyOnboarding) return

    // Let the calendar paint first, then hidden-mount secondary tabs to warm their data.
    return scheduleIdlePreload(() => {
      setMountedTabs((prev) => {
        if (IDLE_PRELOAD_TABS.every((tab) => prev.has(tab))) return prev
        const next = new Set(prev)
        IDLE_PRELOAD_TABS.forEach((tab) => next.add(tab))
        return next
      })
    })
  }, [isInitializing, needsFamilyOnboarding, startupError, user])

  const handleStartupRetry = async () => {
    await Promise.allSettled([reloadFamily(), reloadCalendars()])
  }

  if (isInitializing || startupError) {
    return (
      <>
        <AppSplash animateLogo />
        {startupError && (
          <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 px-6">
            <div
              role="alertdialog"
              aria-labelledby="startup-error-title"
              aria-describedby="startup-error-description"
              className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-stone-900"
            >
              <h2 id="startup-error-title" className="text-lg font-bold text-stone-900 dark:text-stone-100">
                앱을 시작하지 못했어요
              </h2>
              <p
                id="startup-error-description"
                className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-300"
              >
                네트워크 또는 서버 상태를 확인한 뒤 다시 시도해주세요.
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => void handleStartupRetry()}
                  className="flex-1 rounded-2xl bg-accent-400 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-500"
                >
                  다시 시도
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="flex-1 rounded-2xl border border-stone-200 px-4 py-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  새로고침
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }
  if (!user) return null
  if (needsFamilyOnboarding) return null

  const handleTabChange = (tab: Tab) => {
    router.replace(tab === 'calendar' ? '/calendar' : `/calendar?tab=${tab}`)
  }

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: '100dvh', boxSizing: 'border-box', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="flex-1 min-h-0 relative">
        <div className={`absolute inset-0 flex flex-col min-h-0 overflow-hidden${activeTab !== 'calendar' ? ' hidden' : ''}`}>
          <CalendarTab
            preferences={preferences}
            updatePreferences={updatePreferences}
            user={user}
            familyId={familyId}
            isInitializing={isInitializing}
            calendars={calendars}
            calendarsError={calendarsError}
            reloadCalendars={reloadCalendars}
          />
        </div>
        {mountedTabs.has('reminders') && (
          <div className={`absolute inset-0 overflow-y-auto${activeTab !== 'reminders' ? ' hidden' : ''}`}>
            <ReminderTab
              key={familyId ?? 'no-family'}
              user={user}
              familyId={familyId}
              isInitializing={isInitializing}
            />
          </div>
        )}
        {mountedTabs.has('settings') && (
          <div className={`absolute inset-0 overflow-y-auto${activeTab !== 'settings' ? ' hidden' : ''}`}>
            <SettingsTab
              onNavigateToTab={handleTabChange}
              preferences={preferences}
              updatePreferences={updatePreferences}
              user={user}
              familyId={familyId}
              appRole={appRole}
              isInitializing={isInitializing}
            />
          </div>
        )}
      </div>
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  )
}
