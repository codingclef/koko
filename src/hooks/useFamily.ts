'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { postJsonWithAuth } from '@/lib/api-client'

export function useFamily(user: User | null) {
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    const initFamily = async () => {
      try {
        const { familyId } = await postJsonWithAuth<{ familyId: string }>('/api/family')
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
