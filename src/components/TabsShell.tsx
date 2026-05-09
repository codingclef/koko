'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarTab } from '@/components/tabs/CalendarTab'
import { ReminderTab } from '@/components/tabs/ReminderTab'
import { SettingsTab } from '@/components/tabs/SettingsTab'
import { BottomNav } from '@/components/BottomNav'
import { useAuth } from '@/hooks/useAuth'
import { useFamily } from '@/hooks/useFamily'
import { useCalendars } from '@/hooks/useCalendars'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import { type Tab, TABS } from '@/types/tabs'
import { AppSplash } from '@/components/AppSplash'

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

  const tabParam = searchParams.get('tab') === 'shopping' ? 'reminders' : searchParams.get('tab')
  const activeTab: Tab = tabParam && TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'calendar'

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
        <div className={`absolute inset-0 overflow-y-auto${activeTab !== 'reminders' ? ' hidden' : ''}`}>
          <ReminderTab
            key={familyId ?? 'no-family'}
            user={user}
            familyId={familyId}
            isInitializing={isInitializing}
          />
        </div>
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
      </div>
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  )
}
