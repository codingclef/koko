'use client'

import { useState } from 'react'
import { CalendarTab } from '@/components/tabs/CalendarTab'
import { ShoppingTab } from '@/components/tabs/ShoppingTab'
import { SettingsTab } from '@/components/tabs/SettingsTab'
import { BottomNav } from '@/components/BottomNav'
import { useAuth } from '@/hooks/useAuth'
import { useUserPreferences } from '@/hooks/useUserPreferences'

type Tab = 'calendar' | 'shopping' | 'settings'

export function TabsShell() {
  const [activeTab, setActiveTab] = useState<Tab>('calendar')
  const { user } = useAuth()
  const { preferences, updatePreferences } = useUserPreferences(user)

  return (
    <>
      <div style={{ display: activeTab === 'calendar' ? 'contents' : 'none' }}>
        <CalendarTab preferences={preferences} />
      </div>
      <div style={{ display: activeTab === 'shopping' ? 'contents' : 'none' }}>
        <ShoppingTab />
      </div>
      <div style={{ display: activeTab === 'settings' ? 'contents' : 'none' }}>
        <SettingsTab
          onNavigateToTab={setActiveTab}
          preferences={preferences}
          updatePreferences={updatePreferences}
        />
      </div>
      <BottomNav activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab as Tab)} />
    </>
  )
}
