import { Suspense } from 'react'
import { TabsShell } from '@/components/TabsShell'

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <TabsShell />
    </Suspense>
  )
}
