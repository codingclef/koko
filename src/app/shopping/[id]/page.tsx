'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function ShoppingDetailBridgePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  useEffect(() => {
    const trimmedId = id?.trim()
    if (trimmedId) {
      router.replace(`/calendar?tab=shopping&list=${encodeURIComponent(trimmedId)}`, {
        scroll: false,
      })
      return
    }

    router.replace('/calendar?tab=shopping', { scroll: false })
  }, [id, router])

  return null
}
