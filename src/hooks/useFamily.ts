'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getAuthHeaders } from '@/lib/api-client'

export function useFamily(user: User | null) {
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    const initFamily = async () => {
      try {
        const authHeaders = await getAuthHeaders()
        const res = await fetch('/api/family', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
        })

        if (!res.ok) {
          console.error('[useFamily] API error:', await res.text())
          return
        }

        const { familyId } = await res.json()
        setFamilyId(familyId)
      } catch (e) {
        console.error('[useFamily] unexpected error:', e)
      } finally {
        setLoading(false)
      }
    }

    initFamily()
  }, [user])

  return { familyId, loading }
}
