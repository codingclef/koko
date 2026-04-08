'use client'

import type { User } from '@supabase/supabase-js'
import { postJsonWithAuth } from '@/lib/api-client'
import { useAsyncData } from '@/hooks/useAsyncData'

interface FamilyData {
  familyId: string | null
  appRole: 'admin' | 'member'
}

export function useFamily(user: User | null) {
  const { value, loading, error } = useAsyncData<FamilyData>({
    enabled: Boolean(user),
    initialValue: { familyId: null, appRole: 'member' },
    reloadKey: user?.id,
    load: async () => {
      return await postJsonWithAuth<FamilyData>('/api/family/me')
    },
    onError: (e) => {
      console.error('[useFamily] unexpected error:', e)
    },
  })

  return {
    familyId: value?.familyId ?? null,
    appRole: value?.appRole ?? 'member',
    loading,
    error,
  }
}
