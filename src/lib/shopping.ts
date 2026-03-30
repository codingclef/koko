import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type ShoppingList = Database['public']['Tables']['shopping_lists']['Row']
export type ShoppingItem = Database['public']['Tables']['shopping_items']['Row']
export type ListType = 'strikethrough' | 'delete'

export async function getShoppingLists(familyId: string): Promise<ShoppingList[]> {
  const { data, error } = await supabase
    .from('shopping_lists')
    .select('*')
    .eq('family_id', familyId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function createShoppingList(
  familyId: string,
  userId: string,
  name: string,
  type: ListType
): Promise<ShoppingList> {
  const { data, error } = await supabase
    .from('shopping_lists')
    .insert({ family_id: familyId, created_by: userId, name, type })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteShoppingList(listId: string): Promise<void> {
  const { error } = await supabase.from('shopping_lists').delete().eq('id', listId)
  if (error) throw error
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

export async function renameShoppingItem(itemId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('shopping_items')
    .update({ name })
    .eq('id', itemId)
  if (error) throw error
}
