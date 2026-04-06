'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarTab } from '@/components/tabs/CalendarTab'
import { ShoppingTab } from '@/components/tabs/ShoppingTab'
import { SettingsTab } from '@/components/tabs/SettingsTab'
import { BottomNav } from '@/components/BottomNav'
import { useAuth } from '@/hooks/useAuth'
import { useFamily } from '@/hooks/useFamily'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import { DEFAULT_THEME } from '@/lib/preferences'
import { registerPushSubscription } from '@/lib/push'

type Tab = 'calendar' | 'shopping' | 'settings'

const TABS: Tab[] = ['calendar', 'shopping', 'settings']

export function TabsShell() {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'calendar'
    const tabParam = new URLSearchParams(window.location.search).get('tab')
    return tabParam && TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'calendar'
  })
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { familyId, loading: familyLoading } = useFamily(user)
  const { preferences, updatePreferences } = useUserPreferences(user)
  const isInitializing = authLoading || familyLoading

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [user, authLoading, router])

  useEffect(() => {
    if (user) registerPushSubscription(user.id).catch(() => {})
  }, [user?.id])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', preferences?.app_theme ?? DEFAULT_THEME)
  }, [preferences?.app_theme])

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
          onNavigateToTab={setActiveTab}
          preferences={preferences}
          updatePreferences={updatePreferences}
          user={user}
          familyId={familyId}
          isInitializing={isInitializing}
        />
      </div>
      <BottomNav activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab as Tab)} />
    </>
  )
}
