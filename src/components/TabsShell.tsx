'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarTab } from '@/components/tabs/CalendarTab'
import { ShoppingTab } from '@/components/tabs/ShoppingTab'
import { SettingsTab } from '@/components/tabs/SettingsTab'
import { BottomNav } from '@/components/BottomNav'
import { useAuth } from '@/hooks/useAuth'
import { useFamily } from '@/hooks/useFamily'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import { registerPushSubscription } from '@/lib/push'
import { type Tab, TABS } from '@/types/tabs'
import { AppSplash } from '@/components/AppSplash'

export function TabsShell() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { familyId, loading: familyLoading } = useFamily(user)
  const { preferences, updatePreferences } = useUserPreferences(user)
  const isInitializing = authLoading || familyLoading

  const tabParam = searchParams.get('tab')
  const activeTab: Tab = tabParam && TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'calendar'

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [user, authLoading, router])

  useEffect(() => {
    if (user) registerPushSubscription(user.id).catch(() => {})
  }, [user?.id])

  useEffect(() => {
    if (!preferences?.app_theme) return
    const current = document.documentElement.getAttribute('data-theme')
    if (current !== preferences.app_theme) {
      document.documentElement.setAttribute('data-theme', preferences.app_theme)
    }
  }, [preferences?.app_theme])

  if (authLoading) return <AppSplash />
  if (!user) return null

  const handleTabChange = (tab: Tab) => {
    router.replace(tab === 'calendar' ? '/calendar' : `/calendar?tab=${tab}`)
  }

  return (
    <>
      <div style={{ display: activeTab === 'calendar' ? 'contents' : 'none' }}>
        <CalendarTab
          preferences={preferences}
          user={user}
          familyId={familyId}
          isInitializing={isInitializing}
        />
      </div>
      <div style={{ display: activeTab === 'shopping' ? 'contents' : 'none' }}>
        <ShoppingTab
          user={user}
          familyId={familyId}
          isInitializing={isInitializing}
        />
      </div>
      <div style={{ display: activeTab === 'settings' ? 'contents' : 'none' }}>
        <SettingsTab
          onNavigateToTab={handleTabChange}
          preferences={preferences}
          updatePreferences={updatePreferences}
          user={user}
          familyId={familyId}
          isInitializing={isInitializing}
        />
      </div>
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </>
  )
}
