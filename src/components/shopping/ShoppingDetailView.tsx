'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
import type { User } from '@supabase/supabase-js'

type DetailStatus = 'loading' | 'ready' | 'not-found' | 'fetch-error'

interface Props {
  listId: string
  user: User
  onClose: () => void
  onPreviewItemsChange: (listId: string, items: ShoppingItemType[]) => void
}

export function ShoppingDetailView({
  listId,
  user,
  onClose,
  onPreviewItemsChange,
}: Props) {
  const [list, setList] = useState<ShoppingList | null>(null)
  const [items, setItems] = useState<ShoppingItemType[]>([])
  const [status, setStatus] = useState<DetailStatus>('loading')
  const [mutationError, setMutationError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  const syncPreview = useCallback(
    (nextItems: ShoppingItemType[]) => {
      onPreviewItemsChange(listId, nextItems)
    },
    [listId, onPreviewItemsChange]
  )

  const refreshItems = useCallback(() => {
    getShoppingItems(listId)
      .then((nextItems) => {
        setItems(nextItems)
        syncPreview(nextItems)
      })
      .catch((e) => console.error('[ShoppingDetailView] getShoppingItems failed:', e))
  }, [listId, syncPreview])

  const broadcast = useRealtimeSync(`list_items_${listId}`, refreshItems)

  const fetchDetailData = useCallback(async () => {
    const shoppingList = await getShoppingList(listId)
    if (!shoppingList) {
      return { type: 'not-found' as const }
    }

    const fetchedItems = await getShoppingItems(listId)
    return {
      type: 'ready' as const,
      shoppingList,
      fetchedItems,
    }
  }, [listId])

  const applyLoadResult = useCallback(
    (
      result:
        | { type: 'not-found' }
        | { type: 'ready'; shoppingList: ShoppingList; fetchedItems: ShoppingItemType[] }
    ) => {
      if (result.type === 'not-found') {
        setList(null)
        setItems([])
        setStatus('not-found')
        syncPreview([])
        return
      }

      setList(result.shoppingList)
      setItems(result.fetchedItems)
      syncPreview(result.fetchedItems)
      setStatus('ready')
    },
    [syncPreview]
  )

  useEffect(() => {
    let cancelled = false

    void fetchDetailData()
      .then((result) => {
        if (cancelled) return
        applyLoadResult(result)
      })
      .catch((e) => {
        if (cancelled) return
        console.error('[ShoppingDetailView] initial load failed:', e)
        setList(null)
        setItems([])
        setStatus('fetch-error')
      })

    return () => {
      cancelled = true
    }
  }, [applyLoadResult, fetchDetailData])

  const handleRetry = () => {
    setStatus('loading')
    setMutationError(null)
    void fetchDetailData()
      .then((result) => {
        applyLoadResult(result)
      })
      .catch((e) => {
        console.error('[ShoppingDetailView] initial load failed:', e)
        setList(null)
        setItems([])
        setStatus('fetch-error')
      })
  }

  const setItemsWithPreview = useCallback(
    (updater: ShoppingItemType[] | ((prev: ShoppingItemType[]) => ShoppingItemType[])) => {
      setItems((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        syncPreview(next)
        return next
      })
    },
    [syncPreview]
  )

  const handleAdd = async (name: string): Promise<boolean> => {
    setMutationError(null)
    const optimisticItem: ShoppingItemType = {
      id: crypto.randomUUID(),
      list_id: listId,
      created_by: user.id,
      name,
      is_checked: false,
      checked_by: null,
      checked_at: null,
      sort_order: items.length,
      created_at: new Date().toISOString(),
    }
    const previousItems = items
    setItemsWithPreview((prev) => [...prev, optimisticItem])

    try {
      const realItem = await addShoppingItem(listId, user.id, name)
      setItemsWithPreview((prev) =>
        prev.map((item) => (item.id === optimisticItem.id ? realItem : item))
      )
      broadcast()
      return true
    } catch (e) {
      console.error('[ShoppingDetailView] addShoppingItem failed:', e)
      setItemsWithPreview(previousItems)
      setMutationError('아이템을 저장하지 못했어요')
      return false
    }
  }

  const handleCheck = async (itemId: string, checked: boolean) => {
    setMutationError(null)
    const previousItems = items

    if (list?.type === 'delete' && checked) {
      setItemsWithPreview((prev) => prev.filter((item) => item.id !== itemId))
    } else {
      setItemsWithPreview((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? {
                ...item,
                is_checked: checked,
                checked_by: checked ? user.id : null,
                checked_at: checked ? new Date().toISOString() : null,
              }
            : item
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
      console.error('[ShoppingDetailView] checkShoppingItem failed:', e)
      setItemsWithPreview(previousItems)
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
    setItemsWithPreview((prev) => prev.filter((item) => item.id !== itemId))

    try {
      await deleteShoppingItem(itemId)
      broadcast()
    } catch (e) {
      console.error('[ShoppingDetailView] deleteShoppingItem failed:', e)
      setItemsWithPreview(previousItems)
      setMutationError('아이템을 삭제하지 못했어요')
    }
  }

  const handleRename = async (itemId: string, name: string) => {
    setMutationError(null)
    const previousItems = items
    setItemsWithPreview((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, name } : item))
    )

    try {
      await renameShoppingItem(itemId, name)
      broadcast()
    } catch (e) {
      console.error('[ShoppingDetailView] renameShoppingItem failed:', e)
      setItemsWithPreview(previousItems)
      setMutationError('아이템 이름을 저장하지 못했어요')
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setMutationError(null)
    const previousItems = items
    const uncheckedItems = items.filter((item) => !item.is_checked)
    const checkedItems = items.filter((item) => item.is_checked)
    const oldIndex = uncheckedItems.findIndex((item) => item.id === active.id)
    const newIndex = uncheckedItems.findIndex((item) => item.id === over.id)
    const reorderedUnchecked = arrayMove(uncheckedItems, oldIndex, newIndex).map((item, idx) => ({
      ...item,
      sort_order: idx,
    }))
    const nextItems = [...reorderedUnchecked, ...checkedItems]
    setItemsWithPreview(nextItems)

    try {
      await reorderShoppingItems(
        reorderedUnchecked.map(({ id, sort_order }) => ({ id, sort_order }))
      )
      broadcast()
    } catch (e) {
      console.error('[ShoppingDetailView] reorderShoppingItems failed:', e)
      setItemsWithPreview(previousItems)
      setMutationError('아이템 순서를 저장하지 못했어요')
    }
  }

  const uncheckedItems = useMemo(
    () => items.filter((item) => !item.is_checked),
    [items]
  )
  const checkedItems = useMemo(
    () => items.filter((item) => item.is_checked),
    [items]
  )

  return (
    <div className="fixed inset-0 z-[55] bg-white dark:bg-stone-950">
      {status === 'loading' ? (
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-8 h-8 rounded-full border-2 border-accent-300 border-t-accent-500 animate-spin" />
        </div>
      ) : status === 'not-found' ? (
        <DetailStateShell
          title="목록을 찾을 수 없어요"
          description="삭제되었거나 접근할 수 없는 장바구니예요."
          actionLabel="목록으로 돌아가기"
          onAction={onClose}
        />
      ) : status === 'fetch-error' ? (
        <DetailStateShell
          title="장바구니를 불러오지 못했어요"
          description="잠시 후 다시 시도해주세요."
          actionLabel="다시 시도"
          onAction={handleRetry}
          secondaryLabel="목록으로 돌아가기"
          onSecondaryAction={onClose}
        />
      ) : (
        <div className="max-w-lg mx-auto min-h-screen flex flex-col bg-white dark:bg-stone-950">
          <div className="flex items-center gap-3 px-4 py-5 border-b border-stone-100 dark:border-stone-800">
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              aria-label="목록으로 돌아가기"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-xl font-bold text-stone-800 dark:text-stone-100">
                {list?.name ?? '장바구니'}
              </h2>
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
                items={uncheckedItems.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {uncheckedItems.map((item) => (
                  <ShoppingItem
                    key={item.id}
                    item={item}
                    listType={list?.type === 'delete' ? 'delete' : 'strikethrough'}
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
      )}
    </div>
  )
}

interface DetailStateShellProps {
  title: string
  description: string
  actionLabel: string
  onAction: () => void
  secondaryLabel?: string
  onSecondaryAction?: () => void
}

function DetailStateShell({
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondaryAction,
}: DetailStateShellProps) {
  return (
    <div className="max-w-lg mx-auto min-h-screen flex flex-col bg-white dark:bg-stone-950">
      <div className="flex items-center gap-3 px-4 py-5 border-b border-stone-100 dark:border-stone-800">
        <button
          onClick={onSecondaryAction ?? onAction}
          className="p-2 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          aria-label="목록으로 돌아가기"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-stone-800 dark:text-stone-100">장바구니</h2>
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{title}</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl mb-4">🧺</div>
        <p className="text-stone-600 dark:text-stone-300 font-medium">{title}</p>
        <p className="text-sm text-stone-400 dark:text-stone-500 mt-2">{description}</p>
        <div className="mt-6 flex gap-2">
          <button
            onClick={onAction}
            className="px-4 py-2.5 rounded-xl bg-accent-400 hover:bg-accent-500 text-white font-semibold text-sm transition-colors"
          >
            {actionLabel}
          </button>
          {secondaryLabel && onSecondaryAction && (
            <button
              onClick={onSecondaryAction}
              className="px-4 py-2.5 rounded-xl border border-stone-200 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
