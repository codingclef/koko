'use client'

import type { User } from '@supabase/supabase-js'
import { postJsonWithAuth } from '@/lib/api-client'
import { useAsyncData } from '@/hooks/useAsyncData'

export function useFamily(user: User | null) {
  const { value: familyId, loading } = useAsyncData<string | null>({
    enabled: Boolean(user),
    initialValue: null,
    load: async () => {
      const { familyId } = await postJsonWithAuth<{ familyId: string }>('/api/family')
      return familyId
    },
    onError: (e) => {
      console.error('[useFamily] unexpected error:', e)
    },
  })

  return { familyId, loading }
}
