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
  getShoppingList,
  getShoppingItems,
  addShoppingItem,
  checkShoppingItem,
  deleteShoppingItem,
  renameShoppingItem,
  reorderShoppingItems,
} from '@/lib/shopping'
import { ShoppingItem } from '@/components/shopping/ShoppingItem'
import { AddItemInput } from '@/components/shopping/AddItemInput'
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
  const [fetchError, setFetchError] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  const refreshItems = useCallback(() => {
    if (!id) return
    getShoppingItems(id)
      .then(setItems)
      .catch((e) => console.error('[ShoppingDetailPage] getShoppingItems failed:', e))
  }, [id])

  const broadcast = useRealtimeSync(id ? `list_items_${id}` : null, refreshItems, {
    refreshOnSubscribed: false,
  })

  const loadPage = useCallback(async () => {
    if (!id) return
    setFetchError(false)
    setLoading(true)

    try {
      const shoppingList = await getShoppingList(id)
      setList(shoppingList)
      const fetchedItems = await getShoppingItems(id)
      setItems(fetchedItems)
    } catch (e) {
      console.error('[ShoppingDetailPage] initial load failed:', e)
      setList(null)
      setItems([])
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadPage()
  }, [loadPage])

  const handleAdd = async (name: string): Promise<boolean> => {
    if (!user) return false

    setMutationError(null)
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

    try {
      const realItem = await addShoppingItem(id, user.id, name)
      setItems((prev) => prev.map((i) => i.id === optimisticItem.id ? realItem : i))
      broadcast()
      return true
    } catch (e) {
      console.error('[ShoppingDetailPage] addShoppingItem failed:', e)
      setItems((prev) => prev.filter((i) => i.id !== optimisticItem.id))
      setMutationError('아이템을 저장하지 못했어요')
      return false
    }
  }

  const handleCheck = async (itemId: string, checked: boolean) => {
    if (!user) return

    setMutationError(null)
    const previousItems = items

    if (list?.type === 'delete' && checked) {
      setItems((prev) => prev.filter((i) => i.id !== itemId))
    } else {
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? { ...i, is_checked: checked, checked_by: checked ? user.id : null, checked_at: checked ? new Date().toISOString() : null }
            : i
        )
      )
    }

    try {
      if (list?.type === 'delete' && checked) {
        await deleteShoppingItem(itemId)
      } else {
        await checkShoppingItem(itemId, user.id, checked)
      }
      broadcast()
    } catch (e) {
      console.error('[ShoppingDetailPage] checkShoppingItem failed:', e)
      setItems(previousItems)
      setMutationError(
        list?.type === 'delete' && checked
          ? '아이템을 삭제하지 못했어요'
          : '체크 상태를 저장하지 못했어요'
      )
    }
  }

  const handleDelete = async (itemId: string) => {
    setMutationError(null)
    const previousItems = items
    setItems((prev) => prev.filter((i) => i.id !== itemId))

    try {
      await deleteShoppingItem(itemId)
      broadcast()
    } catch (e) {
      console.error('[ShoppingDetailPage] deleteShoppingItem failed:', e)
      setItems(previousItems)
      setMutationError('아이템을 삭제하지 못했어요')
    }
  }

  const handleRename = async (itemId: string, name: string) => {
    setMutationError(null)
    const previousItems = items
    setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, name } : i))

    try {
      await renameShoppingItem(itemId, name)
      broadcast()
    } catch (e) {
      console.error('[ShoppingDetailPage] renameShoppingItem failed:', e)
      setItems(previousItems)
      setMutationError('아이템 이름을 저장하지 못했어요')
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setMutationError(null)
    const unchecked = items.filter((i) => !i.is_checked)
    const checkedItems = items.filter((i) => i.is_checked)
    const oldIndex = unchecked.findIndex((i) => i.id === active.id)
    const newIndex = unchecked.findIndex((i) => i.id === over.id)
    const reorderedUnchecked = arrayMove(unchecked, oldIndex, newIndex).map((i, idx) => ({
      ...i,
      sort_order: idx,
    }))
    const nextItems = [...reorderedUnchecked, ...checkedItems]
    setItems(nextItems)

    try {
      await reorderShoppingItems(reorderedUnchecked.map(({ id, sort_order }) => ({ id, sort_order })))
      broadcast()
    } catch (e) {
      console.error('[ShoppingDetailPage] reorderShoppingItems failed:', e)
      setItems(items)
      setMutationError('아이템 순서를 저장하지 못했어요')
    }
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

  if (fetchError) {
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
            <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100">장바구니</h1>
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">목록을 불러오지 못했어요</p>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="text-5xl mb-4">📡</div>
          <p className="text-stone-600 dark:text-stone-300 font-medium">장바구니를 불러오지 못했어요</p>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-2">잠시 후 다시 시도해주세요</p>
          <button
            onClick={loadPage}
            className="mt-6 px-4 py-2.5 rounded-xl bg-accent-400 hover:bg-accent-500 text-white font-semibold text-sm transition-colors"
          >
            다시 시도
          </button>
        </div>
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
        {mutationError && (
          <div className="px-4 pt-2">
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-500 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
              {mutationError}
            </div>
          </div>
        )}

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
