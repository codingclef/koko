'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function ReminderDetailBridgePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  useEffect(() => {
    const trimmedId = id?.trim()
    if (trimmedId) {
      router.replace(`/calendar?tab=reminders&list=${encodeURIComponent(trimmedId)}`, {
        scroll: false,
      })
      return
    }

    router.replace('/calendar?tab=reminders', { scroll: false })
  }, [id, router])

  return null
}
