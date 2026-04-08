import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type FamilyMember = Database['public']['Tables']['family_members']['Row']
export type FamilyInfo = Pick<Database['public']['Tables']['families']['Row'], 'name' | 'invite_code'>

export async function getFamilyInfo(familyId: string): Promise<FamilyInfo | null> {
  const { data, error } = await supabase
    .from('families')
    .select('name, invite_code')
    .eq('id', familyId)
    .single<FamilyInfo>()
  if (error) throw error
  return data
}

export async function getMyFamilyMember(userId: string): Promise<FamilyMember | null> {
  const { data, error } = await supabase
    .from('family_members')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function updateMyDisplayName(userId: string, displayName: string): Promise<void> {
  const { error } = await supabase
    .from('family_members')
    .update({ display_name: displayName.trim() })
    .eq('user_id', userId)
  if (error) throw error
}
