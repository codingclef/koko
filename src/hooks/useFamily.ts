'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export function useFamily(user: User | null) {
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    const initFamily = async () => {
      // 이미 가족에 속해 있는지 확인
      const { data: membership } = await supabase
        .from('family_members')
        .select('family_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (membership) {
        setFamilyId(membership.family_id)
        setLoading(false)
        return
      }

      // 없으면 새 가족 생성
      const { data: family, error: familyError } = await supabase
        .from('families')
        .insert({ name: 'Our Family' })
        .select('id')
        .single()

      if (familyError || !family) {
        setLoading(false)
        return
      }

      await supabase.from('family_members').insert({
        family_id: family.id,
        user_id: user.id,
        display_name: 'Me',
        role: 'admin',
      })

      setFamilyId(family.id)
      setLoading(false)
    }

    initFamily()
  }, [user])

  return { familyId, loading }
}
