import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type ShoppingList = Database['public']['Tables']['shopping_lists']['Row']
export type ShoppingItem = Database['public']['Tables']['shopping_items']['Row']
export type ListType = 'strikethrough' | 'delete'

export type ItemPreview = Pick<ShoppingItem, 'id' | 'name' | 'is_checked' | 'sort_order'>
export type ShoppingListWithPreview = ShoppingList & { previewItems: ItemPreview[] }

type RawListWithItems = ShoppingList & { shopping_items: ItemPreview[] }

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
