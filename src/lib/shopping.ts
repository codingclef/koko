import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type ShoppingList = Database['public']['Tables']['shopping_lists']['Row']
export type ShoppingItem = Database['public']['Tables']['shopping_items']['Row']
export type ReminderGroup = Database['public']['Tables']['reminder_groups']['Row']
export type ReminderGroupMember = Database['public']['Tables']['reminder_group_members']['Row']
export type ListType = 'strikethrough' | 'delete'

export type ItemPreview = Pick<ShoppingItem, 'id' | 'name' | 'is_checked' | 'sort_order'>
export type ShoppingListWithPreview = ShoppingList & { previewItems: ItemPreview[] }

type RawListWithItems = ShoppingList & { shopping_items: ItemPreview[] }

export const REMINDER_GROUP_COLORS = [
  '#f97316',
  '#3b82f6',
  '#22c55e',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#ef4444',
  '#eab308',
]

export const REMINDER_GROUP_COLOR_NAMES: Record<string, string> = {
  '#f97316': '주황색',
  '#3b82f6': '파란색',
  '#22c55e': '초록색',
  '#a855f7': '보라색',
  '#ec4899': '분홍색',
  '#14b8a6': '청록색',
  '#ef4444': '빨간색',
  '#eab308': '노란색',
}

// ── Reminder Groups ─────────────────────────────────────────

export async function getReminderGroups(familyId: string): Promise<ReminderGroup[]> {
  const { data, error } = await supabase
    .from('reminder_groups')
    .select('*')
    .eq('family_id', familyId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function createReminderGroup(
  familyId: string,
  userId: string,
  name: string,
  color: string,
  memberUserIds: string[] = []
): Promise<ReminderGroup> {
  const { data, error } = await supabase
    .from('reminder_groups')
    .insert({ family_id: familyId, created_by: userId, name, color })
    .select()
    .single()

  if (error) throw error

  const { error: ownerError } = await supabase
    .from('reminder_group_members')
    .insert({ reminder_group_id: data.id, user_id: userId, role: 'owner' })
  if (ownerError) throw ownerError

  const newMembers = memberUserIds
    .filter((id) => id !== userId)
    .map((id) => ({ reminder_group_id: data.id, user_id: id, role: 'member' as const }))

  if (newMembers.length > 0) {
    const { error: memberError } = await supabase.from('reminder_group_members').insert(newMembers)
    if (memberError) throw memberError
  }

  return data
}

export async function updateReminderGroup(
  reminderGroupId: string,
  updates: { name?: string; color?: string }
): Promise<void> {
  const { error } = await supabase
    .from('reminder_groups')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', reminderGroupId)
  if (error) throw error
}

export async function deleteReminderGroup(reminderGroupId: string): Promise<void> {
  const { error } = await supabase.from('reminder_groups').delete().eq('id', reminderGroupId)
  if (error) throw error
}

export async function getReminderGroupMembers(
  reminderGroupId: string
): Promise<ReminderGroupMember[]> {
  const { data, error } = await supabase
    .from('reminder_group_members')
    .select('*')
    .eq('reminder_group_id', reminderGroupId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function getReminderGroupMembersForGroups(
  reminderGroupIds: string[]
): Promise<ReminderGroupMember[]> {
  if (reminderGroupIds.length === 0) return []

  const { data, error } = await supabase
    .from('reminder_group_members')
    .select('*')
    .in('reminder_group_id', reminderGroupIds)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function setReminderGroupMembers(
  reminderGroupId: string,
  ownerUserId: string,
  memberUserIds: string[]
): Promise<void> {
  const { error: delError } = await supabase
    .from('reminder_group_members')
    .delete()
    .eq('reminder_group_id', reminderGroupId)
    .neq('user_id', ownerUserId)
  if (delError) throw delError

  const newMembers = memberUserIds
    .filter((id) => id !== ownerUserId)
    .map((id) => ({ reminder_group_id: reminderGroupId, user_id: id, role: 'member' as const }))

  if (newMembers.length === 0) return

  const { error } = await supabase.from('reminder_group_members').insert(newMembers)
  if (error) throw error
}

export async function getShoppingLists(familyId: string): Promise<ShoppingList[]> {
  const { data, error } = await supabase
    .from('shopping_lists')
    .select('*')
    .eq('family_id', familyId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getShoppingListsWithPreviews(familyId: string): Promise<ShoppingListWithPreview[]> {
  const { data, error } = await supabase
    .from('shopping_lists')
    .select('*, shopping_items(id, name, is_checked, sort_order)')
    .eq('family_id', familyId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as unknown as RawListWithItems[]).map(({ shopping_items, ...list }) => ({
    ...list,
    previewItems: (shopping_items ?? []).sort((a, b) => a.sort_order - b.sort_order),
  }))
}

export async function createShoppingList(
  familyId: string,
  userId: string,
  name: string,
  type: ListType,
  reminderGroupId: string | null = null
): Promise<ShoppingList> {
  const { data, error } = await supabase.rpc('create_shopping_list_authorized', {
    p_actor_user_id: userId,
    p_family_id: familyId,
    p_name: name,
    p_type: type,
    p_reminder_group_id: reminderGroupId,
  })

  if (error) throw error
  return data
}

export async function deleteShoppingList(listId: string): Promise<void> {
  const { error } = await supabase.from('shopping_lists').delete().eq('id', listId)
  if (error) throw error
}

export async function getShoppingList(listId: string): Promise<ShoppingList | null> {
  const { data, error } = await supabase
    .from('shopping_lists')
    .select('*')
    .eq('id', listId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getShoppingItems(listId: string): Promise<ShoppingItem[]> {
  const { data, error } = await supabase
    .from('shopping_items')
    .select('*')
    .eq('list_id', listId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function addShoppingItem(
  listId: string,
  userId: string,
  name: string
): Promise<ShoppingItem> {
  const { data, error } = await supabase
    .from('shopping_items')
    .insert({ list_id: listId, created_by: userId, name })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function checkShoppingItem(
  itemId: string,
  userId: string,
  checked: boolean
): Promise<void> {
  const { error } = await supabase
    .from('shopping_items')
    .update({
      is_checked: checked,
      checked_by: checked ? userId : null,
      checked_at: checked ? new Date().toISOString() : null,
    })
    .eq('id', itemId)

  if (error) throw error
}

export async function deleteShoppingItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('shopping_items').delete().eq('id', itemId)
  if (error) throw error
}

export async function renameShoppingList(listId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('shopping_lists')
    .update({ name })
    .eq('id', listId)
  if (error) throw error
}

export async function updateShoppingListGroup(
  listId: string,
  userId: string,
  reminderGroupId: string | null
): Promise<ShoppingList> {
  const { data, error } = await supabase.rpc('update_shopping_list_group_authorized', {
    p_actor_user_id: userId,
    p_list_id: listId,
    p_reminder_group_id: reminderGroupId,
  })

  if (error) throw error
  return data
}

export async function renameShoppingItem(itemId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('shopping_items')
    .update({ name })
    .eq('id', itemId)
  if (error) throw error
}

export async function reorderShoppingLists(
  updates: { id: string; sort_order: number }[]
): Promise<void> {
  const results = await Promise.all(
    updates.map(({ id, sort_order }) =>
      supabase.from('shopping_lists').update({ sort_order }).eq('id', id)
    )
  )

  const failed = results.find(({ error }) => error)
  if (failed?.error) throw failed.error
}

export async function reorderShoppingItems(
  updates: { id: string; sort_order: number }[]
): Promise<void> {
  const results = await Promise.all(
    updates.map(({ id, sort_order }) =>
      supabase.from('shopping_items').update({ sort_order }).eq('id', id)
    )
  )

  const failed = results.find(({ error }) => error)
  if (failed?.error) throw failed.error
}
