import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

// The reminder list domain still uses legacy shopping_* table names in Supabase.
export type ReminderList = Database['public']['Tables']['shopping_lists']['Row']
export type ReminderItem = Database['public']['Tables']['shopping_items']['Row']
export type ReminderGroup = Database['public']['Tables']['reminder_groups']['Row']
export type ReminderGroupMember = Database['public']['Tables']['reminder_group_members']['Row']
export type ListType = 'strikethrough' | 'delete'

export type ItemPreview = Pick<ReminderItem, 'id' | 'name' | 'is_checked' | 'sort_order'>
export type ReminderListWithPreview = ReminderList & { previewItems: ItemPreview[] }

type RawReminderListWithItems = ReminderList & { shopping_items: ItemPreview[] }

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
  const { data, error } = await supabase.rpc('create_reminder_group_with_members_authorized', {
    p_actor_user_id: userId,
    p_family_id: familyId,
    p_name: name,
    p_color: color,
    p_member_user_ids: memberUserIds,
  })
  if (error) throw error
  if (!data) throw new Error('Reminder group creation returned no data')
  return data
}

export async function updateReminderGroup(
  reminderGroupId: string,
  userId: string,
  updates: { name: string; color: string },
  memberUserIds: string[] | null
): Promise<void> {
  const { error } = await supabase.rpc('update_reminder_group_with_members_authorized', {
    p_actor_user_id: userId,
    p_reminder_group_id: reminderGroupId,
    p_name: updates.name,
    p_color: updates.color,
    p_member_user_ids: memberUserIds,
  })
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

export async function getReminderListsWithPreviews(familyId: string): Promise<ReminderListWithPreview[]> {
  const { data, error } = await supabase
    .from('shopping_lists')
    .select('*, shopping_items(id, name, is_checked, sort_order)')
    .eq('family_id', familyId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as unknown as RawReminderListWithItems[]).map(({ shopping_items, ...list }) => ({
    ...list,
    previewItems: (shopping_items ?? []).sort((a, b) => a.sort_order - b.sort_order),
  }))
}

export async function createReminderList(
  familyId: string,
  userId: string,
  name: string,
  type: ListType,
  reminderGroupId: string | null = null
): Promise<ReminderList> {
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

export async function deleteReminderList(listId: string): Promise<void> {
  const { error } = await supabase.from('shopping_lists').delete().eq('id', listId)
  if (error) throw error
}

export async function getReminderList(listId: string): Promise<ReminderList | null> {
  const { data, error } = await supabase
    .from('shopping_lists')
    .select('*')
    .eq('id', listId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getReminderItems(listId: string): Promise<ReminderItem[]> {
  const { data, error } = await supabase
    .from('shopping_items')
    .select('*')
    .eq('list_id', listId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function addReminderItem(
  listId: string,
  userId: string,
  name: string,
  afterItemId: string | null = null
): Promise<ReminderItem> {
  const { data, error } = await supabase.rpc('add_shopping_item_authorized', {
    p_actor_user_id: userId,
    p_list_id: listId,
    p_name: name,
    p_after_item_id: afterItemId,
  })

  if (error) throw error
  return data
}

export async function checkReminderItem(
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

export async function deleteReminderItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('shopping_items').delete().eq('id', itemId)
  if (error) throw error
}

export async function clearReminderItems(listId: string): Promise<void> {
  const { error } = await supabase.from('shopping_items').delete().eq('list_id', listId)
  if (error) throw error
}

export async function renameReminderList(listId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('shopping_lists')
    .update({ name })
    .eq('id', listId)
  if (error) throw error
}

export async function updateReminderListGroup(
  listId: string,
  userId: string,
  reminderGroupId: string | null
): Promise<ReminderList> {
  const { data, error } = await supabase.rpc('update_shopping_list_group_authorized', {
    p_actor_user_id: userId,
    p_list_id: listId,
    p_reminder_group_id: reminderGroupId,
  })

  if (error) throw error
  return data
}

export async function renameReminderItem(itemId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('shopping_items')
    .update({ name })
    .eq('id', itemId)
  if (error) throw error
}

export async function reorderReminderLists(
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

export async function reorderReminderItems(
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
