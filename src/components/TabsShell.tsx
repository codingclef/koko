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

type Tab = 'calendar' | 'shopping' | 'settings'

export function TabsShell() {
  const [activeTab, setActiveTab] = useState<Tab>('calendar')
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { familyId, loading: familyLoading } = useFamily(user)
  const { preferences, updatePreferences } = useUserPreferences(user)
  const isInitializing = authLoading || familyLoading

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [user, authLoading, router])

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
