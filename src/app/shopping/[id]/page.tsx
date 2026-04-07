'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useAuth } from '@/hooks/useAuth'
import {
  getShoppingItems,
  addShoppingItem,
  checkShoppingItem,
  deleteShoppingItem,
  renameShoppingItem,
  reorderShoppingItems,
} from '@/lib/shopping'
import { ShoppingItem } from '@/components/shopping/ShoppingItem'
import { AddItemInput } from '@/components/shopping/AddItemInput'
import { supabase } from '@/lib/supabase'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import type { ShoppingItem as ShoppingItemType, ShoppingList } from '@/lib/shopping'

export default function ShoppingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [user, authLoading, router])

  const [list, setList] = useState<ShoppingList | null>(null)
  const [items, setItems] = useState<ShoppingItemType[]>([])
  const [loading, setLoading] = useState(true)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  const refreshItems = useCallback(() => {
    if (!id) return
    getShoppingItems(id).then(setItems)
  }, [id])

  const broadcast = useRealtimeSync(id ? `list_items_${id}` : null, refreshItems)

  useEffect(() => {
    if (!id) return
    const init = async () => {
      const { data } = await supabase
        .from('shopping_lists')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      setList(data)
      const fetchedItems = await getShoppingItems(id)
      setItems(fetchedItems)
      setLoading(false)
    }
    init()
  }, [id])

  const handleAdd = async (name: string) => {
    if (!user) return

    const optimisticItem: ShoppingItemType = {
      id: crypto.randomUUID(),
      list_id: id,
      created_by: user.id,
      name,
      is_checked: false,
      checked_by: null,
      checked_at: null,
      sort_order: items.length,
      created_at: new Date().toISOString(),
    }
    setItems((prev) => [...prev, optimisticItem])
    const realItem = await addShoppingItem(id, user.id, name)
    setItems((prev) => prev.map((i) => i.id === optimisticItem.id ? realItem : i))
    broadcast()
  }

  const handleCheck = async (itemId: string, checked: boolean) => {
    if (!user) return

    if (list?.type === 'delete' && checked) {
      setItems((prev) => prev.filter((i) => i.id !== itemId))
      await deleteShoppingItem(itemId)
    } else {
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? { ...i, is_checked: checked, checked_by: checked ? user.id : null, checked_at: checked ? new Date().toISOString() : null }
            : i
        )
      )
      await checkShoppingItem(itemId, user.id, checked)
    }
    broadcast()
  }

  const handleDelete = async (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId))
    await deleteShoppingItem(itemId)
    broadcast()
  }

  const handleRename = async (itemId: string, name: string) => {
    setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, name } : i))
    await renameShoppingItem(itemId, name)
    broadcast()
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setItems((prev) => {
      const unchecked = prev.filter((i) => !i.is_checked)
      const checked = prev.filter((i) => i.is_checked)
      const oldIndex = unchecked.findIndex((i) => i.id === active.id)
      const newIndex = unchecked.findIndex((i) => i.id === over.id)
      const reordered = arrayMove(unchecked, oldIndex, newIndex)
      const updates = reordered.map((i, idx) => ({ id: i.id, sort_order: idx }))
      reorderShoppingItems(updates)
      broadcast()
      return [...reordered.map((i, idx) => ({ ...i, sort_order: idx })), ...checked]
    })
  }

  const uncheckedItems = items.filter((i) => !i.is_checked)
  const checkedItems = items.filter((i) => i.is_checked)

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-accent-300 border-t-accent-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto min-h-screen flex flex-col">
      <div className="flex items-center gap-3 px-4 py-5 border-b border-stone-100 dark:border-stone-800">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          aria-label="뒤로가기"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100">
            {list?.name ?? '장바구니'}
          </h1>
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
            {uncheckedItems.length > 0
              ? `${uncheckedItems.length}개 남음`
              : items.length > 0
              ? '모두 완료 🎉'
              : '아이템을 추가해보세요'}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {uncheckedItems.length === 0 && checkedItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-5xl mb-4">📝</div>
            <p className="text-stone-500 dark:text-stone-400 font-medium">아직 아이템이 없어요</p>
            <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">아래 입력창에 추가해보세요</p>
          </div>
        )}

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext
            items={uncheckedItems.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            {uncheckedItems.map((item) => (
              <ShoppingItem
                key={item.id}
                item={item}
                listType={list?.type as 'strikethrough' | 'delete' ?? 'strikethrough'}
                onCheck={handleCheck}
                onDelete={handleDelete}
                onRename={handleRename}
                draggable
              />
            ))}
          </SortableContext>
        </DndContext>

        {list?.type === 'strikethrough' && checkedItems.length > 0 && (
          <>
            <div className="px-4 py-2 mt-2">
              <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide">
                완료 ({checkedItems.length})
              </p>
            </div>
            {checkedItems.map((item) => (
              <ShoppingItem
                key={item.id}
                item={item}
                listType="strikethrough"
                onCheck={handleCheck}
                onDelete={handleDelete}
                onRename={handleRename}
              />
            ))}
          </>
        )}
      </div>

      <div className="border-t border-stone-100 dark:border-stone-800 bg-white dark:bg-stone-950 pb-safe">
        <AddItemInput onAdd={handleAdd} />
      </div>
    </div>
  )
}
