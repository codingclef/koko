'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ListChecks, Plus } from 'lucide-react'
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
  getReminderList,
  getReminderItems,
  addReminderItem,
  checkReminderItem,
  deleteReminderItem,
  clearReminderItems,
  renameReminderItem,
  reorderReminderItems,
  updateReminderListGroup,
} from '@/lib/reminder-lists'
import { ReminderItem } from '@/components/reminders/ReminderItem'
import { AddItemInput } from '@/components/reminders/AddItemInput'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { toDisplayColor } from '@/lib/label-colors'
import type { ReminderItem as ReminderItemType, ReminderList, ReminderGroup } from '@/lib/reminder-lists'
import type { User } from '@supabase/supabase-js'

type DetailStatus = 'loading' | 'ready' | 'not-found' | 'fetch-error'
type DetailItem = ReminderItemType & { pending?: true }
export type ReminderPreviewRead = { items: Promise<ReminderItemType[]>; order: number }
type AddSession =
  | null
  | { mode: 'bottom' }
  | { mode: 'inline'; anchorItemId: string }

const compareItems = (a: ReminderItemType, b: ReminderItemType) =>
  a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)

const withInsertedReminderItem = (
  currentItems: DetailItem[],
  itemToInsert: DetailItem,
  afterItemId?: string
): DetailItem[] => {
  const orderedItems = [...currentItems].sort(compareItems)
  const anchorIndex = afterItemId
    ? orderedItems.findIndex((item) => item.id === afterItemId)
    : -1
  const insertIndex = anchorIndex >= 0 ? anchorIndex + 1 : orderedItems.length
  const nextItems = [
    ...orderedItems.slice(0, insertIndex),
    itemToInsert,
    ...orderedItems.slice(insertIndex),
  ]

  return nextItems.map((item, index) => ({ ...item, sort_order: index }))
}

function restoreRemovedItems(current: DetailItem[], removed: DetailItem[]): DetailItem[] {
  const currentIds = new Set(current.map((item) => item.id))
  return [...current, ...removed.filter((item) => !currentIds.has(item.id))].sort(compareItems)
}

interface Props {
  listId: string
  user: User
  groups?: ReminderGroup[]
  onClose: () => void
  listRefreshVersion?: number
  itemRefreshVersion?: number
  onListSaved?: () => void
  nextPreviewReadOrder?: () => number
  onItemsSettledAfterClose?: (listId: string, pendingRead?: ReminderPreviewRead) => void
  onListGroupChange?: (listId: string, reminderGroupId: string | null) => void
  onPreviewItemsChange: (listId: string, items: ReminderItemType[], order?: number) => void
}

export function ReminderDetailView({
  listId,
  user,
  groups = [],
  onClose,
  listRefreshVersion = 0,
  itemRefreshVersion = 0,
  onListSaved,
  nextPreviewReadOrder,
  onItemsSettledAfterClose,
  onListGroupChange,
  onPreviewItemsChange,
}: Props) {
  const [list, setList] = useState<ReminderList | null>(null)
  const [{ items, order: itemsReadOrder }, setItemSnapshot] = useState<{ items: DetailItem[]; order?: number }>({ items: [] })
  const [status, setStatus] = useState<DetailStatus>('loading')
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [groupSaving, setGroupSaving] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [addSession, setAddSession] = useState<AddSession>(null)
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<ReminderItemType | null>(null)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [clearingItems, setClearingItems] = useState(false)
  const [itemWritePending, setItemWritePending] = useState(false)
  const addInputRef = useRef<HTMLInputElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(false)
  const itemSyncRef = useRef({
    latest: 0,
    applied: 0,
    firstValid: 1,
    pending: new Map<number, ReminderPreviewRead>(),
    writes: 0,
    refreshQueued: false,
  })
  const groupSavingRef = useRef(false)
  const listRequestsRef = useRef({ latest: 0, applied: 0, firstValid: 1 })
  const lastListRefreshVersionRef = useRef(listRefreshVersion)
  const lastItemRefreshVersionRef = useRef(itemRefreshVersion)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  useEffect(() => {
    if (status !== 'ready' && status !== 'not-found') return
    if (status === 'ready' && itemWritePending) return
    const previewItems = status === 'ready' ? items : []
    if (itemsReadOrder === undefined) onPreviewItemsChange(listId, previewItems)
    else onPreviewItemsChange(listId, previewItems, itemsReadOrder)
  }, [itemWritePending, items, itemsReadOrder, listId, onPreviewItemsChange, status])

  const setItems = useCallback((update: React.SetStateAction<DetailItem[]>) => {
    setItemSnapshot((previous) => ({
      items: typeof update === 'function' ? update(previous.items) : update,
    }))
  }, [])

  const closeAddSessionIfDraftEmpty = useCallback(() => {
    const input = addInputRef.current
    if (input?.getAttribute('aria-busy') === 'true') return
    if (input?.value.trim()) return
    setAddSession(null)
  }, [])

  const refreshItems = useCallback(() => {
    if (!mountedRef.current) return
    const sync = itemSyncRef.current
    // 정합성 조회는 로컬 저장과 겹치지 않게 합친다.
    if (sync.writes > 0) {
      sync.refreshQueued = true
      return
    }

    const requestId = ++sync.latest
    const order = nextPreviewReadOrder?.() ?? requestId
    const read = { items: getReminderItems(listId), order }
    sync.pending.set(requestId, read)
    read.items
      .then((nextItems) => {
        if (requestId < sync.firstValid || requestId <= sync.applied) return
        sync.applied = requestId
        setItemSnapshot({ items: nextItems, order: nextPreviewReadOrder ? order : undefined })
      })
      .catch((e) => console.error('[ReminderDetailView] getReminderItems failed:', e))
      .finally(() => {
        sync.pending.delete(requestId)
      })
  }, [listId, nextPreviewReadOrder])

  const beginItemWrite = useCallback(() => {
    const sync = itemSyncRef.current
    if (sync.pending.size > 0 || sync.writes > 0) sync.refreshQueued = true
    sync.firstValid = sync.latest + 1
    sync.pending.clear()
    sync.writes += 1
    setItemWritePending(true)
  }, [])

  const finishItemWrite = useCallback(() => {
    const sync = itemSyncRef.current
    sync.writes -= 1
    if (sync.writes > 0) return
    if (!mountedRef.current) {
      onItemsSettledAfterClose?.(listId)
      return
    }
    setItemWritePending(false)
    if (sync.refreshQueued) {
      sync.refreshQueued = false
      refreshItems()
    }
  }, [listId, onItemsSettledAfterClose, refreshItems])

  const refreshList = useCallback(() => {
    if (!mountedRef.current || groupSavingRef.current) return
    const requests = listRequestsRef.current
    const requestId = ++requests.latest
    const order = nextPreviewReadOrder?.()
    getReminderList(listId)
      .then((nextList) => {
        if (requestId < requests.firstValid || requestId <= requests.applied) return
        requests.applied = requestId
        if (nextList) {
          setList(nextList)
          onListGroupChange?.(listId, nextList.reminder_group_id)
        } else {
          setList(null)
          const sync = itemSyncRef.current
          sync.firstValid = sync.latest + 1
          sync.pending.clear()
          setItemSnapshot({ items: [], order })
          setStatus('not-found')
        }
      })
      .catch((e) => console.error('[ReminderDetailView] getReminderList failed:', e))
  }, [listId, nextPreviewReadOrder, onListGroupChange])

  const broadcast = useRealtimeSync(status === 'ready' ? `list_items_${listId}` : null, refreshItems)

  useEffect(() => {
    if (status !== 'ready' || lastListRefreshVersionRef.current === listRefreshVersion) return
    lastListRefreshVersionRef.current = listRefreshVersion
    refreshList()
  }, [listRefreshVersion, refreshList, status])

  useEffect(() => {
    if (status !== 'ready' || lastItemRefreshVersionRef.current === itemRefreshVersion) return
    lastItemRefreshVersionRef.current = itemRefreshVersion
    refreshItems()
  }, [itemRefreshVersion, refreshItems, status])

  useEffect(() => {
    mountedRef.current = true
    const sync = itemSyncRef.current
    const listRequests = listRequestsRef.current
    return () => {
      mountedRef.current = false
      for (const [requestId, read] of sync.pending) {
        if (requestId > sync.applied) onItemsSettledAfterClose?.(listId, read)
      }
      sync.firstValid = sync.latest + 1
      sync.pending.clear()
      listRequests.firstValid = listRequests.latest + 1
    }
  }, [listId, onItemsSettledAfterClose])

  const fetchDetailData = useCallback(async () => {
    const reminderList = await getReminderList(listId)
    if (!reminderList) {
      return { type: 'not-found' as const }
    }

    const order = nextPreviewReadOrder?.()
    const fetchedItems = await getReminderItems(listId)
    return {
      type: 'ready' as const,
      reminderList,
      fetchedItems,
      order,
    }
  }, [listId, nextPreviewReadOrder])

  const applyLoadResult = useCallback(
    (
      result:
        | { type: 'not-found' }
        | { type: 'ready'; reminderList: ReminderList; fetchedItems: ReminderItemType[]; order?: number }
    ) => {
      if (result.type === 'not-found') {
        setList(null)
        setItemSnapshot({ items: [] })
        setStatus('not-found')
        return
      }

      setList(result.reminderList)
      setItemSnapshot({ items: result.fetchedItems, order: result.order })
      setStatus('ready')
    },
    []
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
        console.error('[ReminderDetailView] initial load failed:', e)
        setList(null)
        setItems([])
        setStatus('fetch-error')
      })

    return () => {
      cancelled = true
    }
  }, [applyLoadResult, fetchDetailData, setItems])

  useEffect(() => {
    if (!addSession) return

    const handlePointerDown = (event: PointerEvent) => {
      const input = addInputRef.current
      const shell = shellRef.current
      const target = event.target
      if (!(target instanceof Node) || !input || !shell || !shell.contains(target)) return

      if (input === target || input.contains(target)) return
      if (target instanceof Element && target.closest('form')?.contains(input)) return

      closeAddSessionIfDraftEmpty()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [addSession, closeAddSessionIfDraftEmpty])

  const handleRetry = () => {
    setStatus('loading')
    setMutationError(null)
    void fetchDetailData()
      .then((result) => {
        applyLoadResult(result)
      })
      .catch((e) => {
        console.error('[ReminderDetailView] initial load failed:', e)
        setList(null)
        setItems([])
        setStatus('fetch-error')
      })
  }

  const handleAddItem = useCallback(async (
    name: string,
    afterItemId?: string,
    optimisticId = crypto.randomUUID()
  ): Promise<ReminderItemType | null> => {
    setMutationError(null)
    const optimisticItem: DetailItem = {
      id: optimisticId,
      list_id: listId,
      created_by: user.id,
      name,
      is_checked: false,
      checked_by: null,
      checked_at: null,
      sort_order: 0,
      created_at: new Date().toISOString(),
      pending: true,
    }
    beginItemWrite()
    setItems((currentItems) => (
      withInsertedReminderItem(currentItems, optimisticItem, afterItemId)
    ))

    try {
      const realItem = await addReminderItem(listId, user.id, name, afterItemId ?? null)
      setItems((currentItems) => {
        const itemsWithoutExistingReal = currentItems.filter((item) => item.id !== realItem.id)
        const optimisticIndex = itemsWithoutExistingReal.findIndex(
          (item) => item.id === optimisticItem.id
        )
        if (optimisticIndex < 0) {
          return withInsertedReminderItem(itemsWithoutExistingReal, realItem, afterItemId)
        }

        return itemsWithoutExistingReal.map((item) =>
          item.id === optimisticItem.id
            ? { ...realItem, sort_order: item.sort_order }
            : item
        )
      })
      broadcast()
      return realItem
    } catch (e) {
      console.error('[ReminderDetailView] addReminderItem failed:', e)
      setItems((currentItems) => (
        currentItems.filter((item) => item.id !== optimisticItem.id)
      ))
      setMutationError('아이템을 저장하지 못했어요')
      return null
    } finally {
      finishItemWrite()
    }
  }, [beginItemWrite, broadcast, finishItemWrite, listId, setItems, user.id])

  const handleBottomAdd = useCallback(
    async (name: string): Promise<boolean> => {
      const createdItem = await handleAddItem(name)
      if (createdItem) {
        requestAnimationFrame(() => {
          addInputRef.current?.focus()
        })
      }
      return createdItem !== null
    },
    [handleAddItem]
  )

  const handleInlineAdd = useCallback(
    (afterItemId: string, pendingAnchor = false) =>
      async (name: string): Promise<boolean> => {
        if (pendingAnchor) return false
        const optimisticId = crypto.randomUUID()
        setAddSession({ mode: 'inline', anchorItemId: optimisticId })
        const createdItem = await handleAddItem(name, afterItemId, optimisticId)
        setAddSession((session) => session?.mode === 'inline' && session.anchorItemId === optimisticId
          ? { mode: 'inline', anchorItemId: createdItem?.id ?? afterItemId }
          : session)
        return createdItem !== null
      },
    [handleAddItem]
  )

  const handleCheck = async (itemId: string, checked: boolean) => {
    const previousItem = items.find((item) => item.id === itemId)
    if (!previousItem || previousItem.pending) return
    setMutationError(null)
    setAddSession(null)

    const deleteOnCheck = list?.type === 'delete' && checked
    const checkedBy = checked ? user.id : null
    const checkedAt = checked ? new Date().toISOString() : null
    beginItemWrite()
    if (deleteOnCheck) {
      setItems((prev) => prev.filter((item) => item.id !== itemId))
    } else {
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, is_checked: checked, checked_by: checkedBy, checked_at: checkedAt }
            : item
        )
      )
    }

    try {
      if (deleteOnCheck) {
        await deleteReminderItem(itemId)
      } else {
        await checkReminderItem(itemId, user.id, checked)
      }
      broadcast()
    } catch (e) {
      console.error('[ReminderDetailView] checkReminderItem failed:', e)
      if (deleteOnCheck) {
        setItems((prev) => restoreRemovedItems(prev, [previousItem]))
      } else {
        setItems((prev) => prev.map((item) =>
          item.id === itemId && item.is_checked === checked && item.checked_at === checkedAt
            ? { ...item, is_checked: previousItem.is_checked, checked_by: previousItem.checked_by, checked_at: previousItem.checked_at }
            : item
        ))
      }
      setMutationError(deleteOnCheck ? '아이템을 삭제하지 못했어요' : '체크 상태를 저장하지 못했어요')
    } finally {
      finishItemWrite()
    }
  }

  const handleDelete = async (itemId: string) => {
    setDeleteConfirmItem(null)
    const previousItem = items.find((item) => item.id === itemId)
    if (!previousItem || previousItem.pending) return
    setMutationError(null)
    setAddSession((currentSession) =>
      currentSession?.mode === 'inline' && currentSession.anchorItemId === itemId
        ? null
        : currentSession
    )
    beginItemWrite()
    setItems((prev) => prev.filter((item) => item.id !== itemId))

    try {
      await deleteReminderItem(itemId)
      broadcast()
    } catch (e) {
      console.error('[ReminderDetailView] deleteReminderItem failed:', e)
      setItems((prev) => restoreRemovedItems(prev, [previousItem]))
      setMutationError('아이템을 삭제하지 못했어요')
    } finally {
      finishItemWrite()
    }
  }

  const handleClearItems = async () => {
    if (items.length === 0 || itemSyncRef.current.writes > 0) {
      setClearConfirmOpen(false)
      return
    }

    setMutationError(null)
    setClearConfirmOpen(false)
    setDeleteConfirmItem(null)
    setEditingItemId(null)
    setAddSession(null)
    setClearingItems(true)
    const previousItems = items
    beginItemWrite()
    setItems([])

    try {
      await clearReminderItems(listId)
      broadcast()
    } catch (e) {
      console.error('[ReminderDetailView] clearReminderItems failed:', e)
      setItems((prev) => restoreRemovedItems(prev, previousItems))
      setMutationError('아이템을 비우지 못했어요')
    } finally {
      setClearingItems(false)
      finishItemWrite()
    }
  }

  const handleRename = async (itemId: string, name: string): Promise<boolean> => {
    const previousItem = items.find((item) => item.id === itemId)
    if (!previousItem || previousItem.pending) return false
    setMutationError(null)
    beginItemWrite()
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, name } : item))
    )

    try {
      await renameReminderItem(itemId, name)
      broadcast()
      return true
    } catch (e) {
      console.error('[ReminderDetailView] renameReminderItem failed:', e)
      setItems((prev) => prev.map((item) =>
        item.id === itemId && item.name === name ? { ...item, name: previousItem.name } : item
      ))
      setMutationError('아이템 이름을 저장하지 못했어요')
      return false
    } finally {
      finishItemWrite()
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || hasPendingItems) return

    setMutationError(null)
    const uncheckedItems = items.filter((item) => !item.is_checked)
    const checkedItems = items.filter((item) => item.is_checked)
    const oldIndex = uncheckedItems.findIndex((item) => item.id === active.id)
    const newIndex = uncheckedItems.findIndex((item) => item.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reorderedUnchecked = arrayMove(uncheckedItems, oldIndex, newIndex).map((item, idx) => ({
      ...item,
      sort_order: idx,
    }))
    const nextItems = [...reorderedUnchecked, ...checkedItems]
    beginItemWrite()
    setItems(nextItems)

    try {
      await reorderReminderItems(
        reorderedUnchecked.map(({ id, sort_order }) => ({ id, sort_order }))
      )
      broadcast()
    } catch (e) {
      console.error('[ReminderDetailView] reorderReminderItems failed:', e)
      const previousOrder = new Map(uncheckedItems.map((item) => [item.id, item.sort_order]))
      const attemptedOrder = new Map(reorderedUnchecked.map((item) => [item.id, item.sort_order]))
      setItems((prev) => prev.map((item) =>
        item.sort_order === attemptedOrder.get(item.id)
          ? { ...item, sort_order: previousOrder.get(item.id) ?? item.sort_order }
          : item
      ).sort(compareItems))
      itemSyncRef.current.refreshQueued = true
      setMutationError('아이템 순서를 저장하지 못했어요')
    } finally {
      finishItemWrite()
    }
  }

  const handleGroupChange = async (nextValue: string) => {
    if (!list || groupSavingRef.current) return

    const nextGroupId = nextValue === '' ? null : nextValue
    if (nextGroupId === list.reminder_group_id) return

    setMutationError(null)
    groupSavingRef.current = true
    setGroupSaving(true)
    const requests = listRequestsRef.current
    requests.firstValid = requests.latest + 1
    const previousList = list
    setList({ ...list, reminder_group_id: nextGroupId })
    onListGroupChange?.(list.id, nextGroupId)

    try {
      const updatedList = await updateReminderListGroup(list.id, user.id, nextGroupId)
      setList(updatedList)
      onListGroupChange?.(updatedList.id, updatedList.reminder_group_id)
      onListSaved?.()
    } catch (e) {
      console.error('[ReminderDetailView] updateReminderListGroup failed:', e)
      setList(previousList)
      onListGroupChange?.(previousList.id, previousList.reminder_group_id)
      setMutationError('그룹을 변경하지 못했어요')
    } finally {
      groupSavingRef.current = false
      setGroupSaving(false)
      refreshList()
    }
  }

  const hasPendingItems = items.some((item) => item.pending)
  const uncheckedItems = useMemo(
    () => items.filter((item) => !item.is_checked),
    [items]
  )
  const checkedItems = useMemo(
    () => items.filter((item) => item.is_checked),
    [items]
  )
  const currentGroup = list?.reminder_group_id
    ? groups.find((group) => group.id === list.reminder_group_id) ?? null
    : null
  const handleAdvanceEdit = useCallback((itemId: string) => {
    setEditingItemId((currentItemId) => {
      if (currentItemId !== itemId) return currentItemId

      setAddSession({ mode: 'inline', anchorItemId: itemId })
      requestAnimationFrame(() => {
        addInputRef.current?.focus()
      })
      return null
    })
  }, [])
  const handleEditStart = useCallback((itemId: string) => {
    setAddSession(null)
    setDeleteConfirmItem(null)
    setEditingItemId(itemId)
  }, [])
  const handleEditEnd = useCallback((itemId: string) => {
    setEditingItemId((currentItemId) => (currentItemId === itemId ? null : currentItemId))
  }, [])
  const handleOpenBottomAdd = useCallback(() => {
    setDeleteConfirmItem(null)
    setEditingItemId(null)
    setAddSession({ mode: 'bottom' })
    requestAnimationFrame(() => {
      addInputRef.current?.focus()
    })
  }, [])

  const showFloatingAddButton =
    editingItemId === null && addSession === null
  const handleCancelDelete = () => setDeleteConfirmItem(null)
  const handleConfirmDelete = () => {
    if (!deleteConfirmItem) return
    void handleDelete(deleteConfirmItem.id)
  }
  const handleOpenClearConfirm = () => {
    setAddSession(null)
    setEditingItemId(null)
    setDeleteConfirmItem(null)
    setClearConfirmOpen(true)
  }
  const handleCancelClear = () => setClearConfirmOpen(false)
  const handleConfirmClear = () => {
    void handleClearItems()
  }

  return (
    <div
      data-testid="reminder-detail-overlay"
      className="fixed inset-0 z-[55] overflow-hidden bg-white dark:bg-stone-950"
      style={{
        boxSizing: 'border-box',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {status === 'loading' ? (
        <div className="flex h-full items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-accent-300 border-t-accent-500 animate-spin" />
        </div>
      ) : status === 'not-found' ? (
        <DetailStateShell
          title="목록을 찾을 수 없어요"
          description="삭제되었거나 접근할 수 없는 리마인더예요."
          actionLabel="목록으로 돌아가기"
          onAction={onClose}
        />
      ) : status === 'fetch-error' ? (
        <DetailStateShell
          title="리마인더를 불러오지 못했어요"
          description="잠시 후 다시 시도해주세요."
          actionLabel="다시 시도"
          onAction={handleRetry}
          secondaryLabel="목록으로 돌아가기"
          onSecondaryAction={onClose}
        />
      ) : (
        <div
          ref={shellRef}
          data-testid="reminder-detail-shell"
          className="relative max-w-lg mx-auto h-full min-h-0 flex flex-col bg-white dark:bg-stone-950"
        >
          <div className="flex items-center gap-3 px-4 py-5 border-b border-stone-100 dark:border-stone-800">
            <button
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
              aria-label="목록으로 돌아가기"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold text-stone-800 dark:text-stone-100">
                {list?.name ?? '리마인더'}
              </h2>
              <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
                {uncheckedItems.length > 0
                  ? `${uncheckedItems.length}개 남음`
                  : items.length > 0
                  ? '모두 완료 🎉'
                  : '아이템을 추가해보세요'}
              </p>
            </div>
            {items.length > 0 && (
              <button
                type="button"
                onClick={handleOpenClearConfirm}
                disabled={itemWritePending}
                className="h-10 shrink-0 rounded-xl border border-red-200 px-3 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:hover:bg-red-950/30"
                aria-label="아이템 비우기"
              >
                비우기
              </button>
            )}
          </div>

          {list && groups.length > 0 && (
            <div className="flex items-center gap-3 border-b border-stone-100 px-4 py-3 dark:border-stone-800">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-stone-300 dark:bg-stone-600"
                style={currentGroup ? { backgroundColor: toDisplayColor(currentGroup.color) } : undefined}
              />
              <label
                htmlFor="reminder-list-group"
                className="shrink-0 text-xs font-semibold text-stone-400 dark:text-stone-500"
              >
                그룹
              </label>
              <select
                id="reminder-list-group"
                value={list.reminder_group_id ?? ''}
                disabled={groupSaving}
                onChange={(event) => void handleGroupChange(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 text-sm font-medium text-stone-700 outline-none transition-colors focus:ring-2 focus:ring-accent-300 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
              >
                <option value="">가족 전체</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div
            data-testid="reminder-detail-scroll"
            className="flex-1 min-h-0 overflow-y-auto pt-2"
            style={{ paddingBottom: '6rem' }}
          >
            {mutationError && (
              <div className="px-4 pt-2">
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-500 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
                  {mutationError}
                </div>
              </div>
            )}

            {uncheckedItems.length === 0 && checkedItems.length === 0 && addSession?.mode !== 'bottom' && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="text-5xl mb-4">📝</div>
                <p className="text-stone-500 dark:text-stone-400 font-medium">아직 아이템이 없어요</p>
                <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">오른쪽 아래에서 추가해보세요</p>
              </div>
            )}

            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <SortableContext
                items={uncheckedItems.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {uncheckedItems.flatMap((item) => [
                  <ReminderItem
                    key={item.id}
                    item={item}
                    listType={list?.type === 'delete' ? 'delete' : 'strikethrough'}
                    onCheck={handleCheck}
                    onDelete={() => {
                      setAddSession(null)
                      setDeleteConfirmItem(item)
                    }}
                    onRename={handleRename}
                    isEditing={editingItemId === item.id}
                    onEditStart={handleEditStart}
                    onEditEnd={handleEditEnd}
                    onAdvanceEdit={handleAdvanceEdit}
                    draggable
                    dragDisabled={hasPendingItems}
                    pending={item.pending}
                  />,
                  ...(addSession?.mode === 'inline' && addSession.anchorItemId === item.id ? [
                    <AddItemInput
                      key="inline-add"
                      ref={addInputRef}
                      onAdd={handleInlineAdd(item.id, item.pending)}
                      onCancelEmpty={closeAddSessionIfDraftEmpty}
                      inline
                      testId="inline-add-item-input"
                    />
                  ] : []),
                ])}
              </SortableContext>
            </DndContext>

            {addSession?.mode === 'bottom' && (
              <AddItemInput
                ref={addInputRef}
                onAdd={handleBottomAdd}
                onCancelEmpty={closeAddSessionIfDraftEmpty}
                inline
                testId="bottom-add-item-input"
              />
            )}

            {list?.type === 'strikethrough' && checkedItems.length > 0 && (
              <>
                <div className="px-4 py-2 mt-2">
                  <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide">
                    완료 ({checkedItems.length})
                  </p>
                </div>
                {checkedItems.map((item) => (
                  <div key={item.id}>
                    <ReminderItem
                      item={item}
                      listType="strikethrough"
                      onCheck={handleCheck}
                      onDelete={() => {
                        setAddSession(null)
                        setDeleteConfirmItem(item)
                      }}
                      onRename={handleRename}
                      isEditing={editingItemId === item.id}
                      onEditStart={handleEditStart}
                      onEditEnd={handleEditEnd}
                      onAdvanceEdit={handleAdvanceEdit}
                    />
                    {addSession?.mode === 'inline' && addSession.anchorItemId === item.id && (
                      <AddItemInput
                        ref={addInputRef}
                        onAdd={handleInlineAdd(item.id)}
                        onCancelEmpty={closeAddSessionIfDraftEmpty}
                        inline
                        testId="inline-add-item-input"
                      />
                    )}
                  </div>
                ))}
              </>
            )}
          </div>

          {showFloatingAddButton && (
            <button
              type="button"
              onClick={handleOpenBottomAdd}
              disabled={clearingItems}
              className="absolute right-4 bottom-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-accent-400 text-white shadow-lg transition-colors hover:bg-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-300"
              aria-label="아이템 추가"
              data-testid="floating-add-item-button"
            >
              <Plus size={18} />
            </button>
          )}

          {deleteConfirmItem && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="reminder-item-delete-title"
              className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center"
            >
              <div className="absolute inset-0 bg-black/40" onClick={handleCancelDelete} />
              <div className="relative w-full rounded-2xl bg-stone-50 p-6 shadow-xl dark:bg-stone-900 sm:max-w-xs">
                <p id="reminder-item-delete-title" className="mb-1 font-semibold text-stone-800 dark:text-stone-100">
                  아이템 삭제
                </p>
                <p className="mb-6 text-sm text-stone-500 dark:text-stone-400">
                  &ldquo;{deleteConfirmItem.name}&rdquo;을(를) 삭제할까요?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleCancelDelete}
                    className="flex-1 rounded-xl bg-stone-100 py-2.5 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                    aria-label="취소"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600"
                    aria-label="삭제 확인"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          )}

          {clearConfirmOpen && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="reminder-items-clear-title"
              className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center"
            >
              <div className="absolute inset-0 bg-black/40" onClick={handleCancelClear} />
              <div className="relative w-full rounded-2xl bg-stone-50 p-6 shadow-xl dark:bg-stone-900 sm:max-w-xs">
                <p id="reminder-items-clear-title" className="mb-1 font-semibold text-stone-800 dark:text-stone-100">
                  아이템 비우기
                </p>
                <p className="mb-6 text-sm text-stone-500 dark:text-stone-400">
                  이 리마인더의 아이템 {items.length}개를 모두 삭제할까요?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleCancelClear}
                    className="flex-1 rounded-xl bg-stone-100 py-2.5 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                    aria-label="취소"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleConfirmClear}
                    disabled={itemWritePending}
                    className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                    aria-label="아이템 비우기 확인"
                  >
                    비우기
                  </button>
                </div>
              </div>
            </div>
          )}
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
    <div className="max-w-lg mx-auto h-full min-h-0 flex flex-col bg-white dark:bg-stone-950">
      <div className="flex items-center gap-3 px-4 py-5 border-b border-stone-100 dark:border-stone-800">
        <button
          onClick={onSecondaryAction ?? onAction}
          className="p-2 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          aria-label="목록으로 돌아가기"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-stone-800 dark:text-stone-100">리마인더</h2>
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{title}</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6 text-center">
        <ListChecks size={48} className="mb-4 text-stone-300 dark:text-stone-600" />
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
