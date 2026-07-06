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
type AddSession =
  | null
  | { mode: 'bottom' }
  | { mode: 'inline'; anchorItemId: string }

const withInsertedReminderItem = (
  currentItems: ReminderItemType[],
  itemToInsert: ReminderItemType,
  afterItemId?: string
): ReminderItemType[] => {
  const orderedItems = [...currentItems].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return a.created_at.localeCompare(b.created_at)
  })
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

interface Props {
  listId: string
  user: User
  groups?: ReminderGroup[]
  onClose: () => void
  onListGroupChange?: (listId: string, reminderGroupId: string | null) => void
  onPreviewItemsChange: (listId: string, items: ReminderItemType[]) => void
}

export function ReminderDetailView({
  listId,
  user,
  groups = [],
  onClose,
  onListGroupChange,
  onPreviewItemsChange,
}: Props) {
  const [list, setList] = useState<ReminderList | null>(null)
  const [items, setItems] = useState<ReminderItemType[]>([])
  const [status, setStatus] = useState<DetailStatus>('loading')
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [groupSaving, setGroupSaving] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [addSession, setAddSession] = useState<AddSession>(null)
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<ReminderItemType | null>(null)
  const addInputRef = useRef<HTMLInputElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  const syncPreview = useCallback(
    (nextItems: ReminderItemType[]) => {
      onPreviewItemsChange(listId, nextItems)
    },
    [listId, onPreviewItemsChange]
  )

  const refreshItems = useCallback(() => {
    getReminderItems(listId)
      .then((nextItems) => {
        setItems(nextItems)
        syncPreview(nextItems)
      })
      .catch((e) => console.error('[ReminderDetailView] getReminderItems failed:', e))
  }, [listId, syncPreview])

  const refreshList = useCallback(() => {
    getReminderList(listId)
      .then((nextList) => {
        if (nextList) {
          setList(nextList)
          onListGroupChange?.(listId, nextList.reminder_group_id)
        } else {
          setList(null)
          setItems([])
          setStatus('not-found')
          syncPreview([])
        }
      })
      .catch((e) => console.error('[ReminderDetailView] getReminderList failed:', e))
  }, [listId, onListGroupChange, syncPreview])

  const broadcast = useRealtimeSync(`list_items_${listId}`, refreshItems)
  const broadcastListChange = useRealtimeSync(
    list ? `family_lists_${list.family_id}` : null,
    refreshList
  )

  const fetchDetailData = useCallback(async () => {
    const reminderList = await getReminderList(listId)
    if (!reminderList) {
      return { type: 'not-found' as const }
    }

    const fetchedItems = await getReminderItems(listId)
    return {
      type: 'ready' as const,
      reminderList,
      fetchedItems,
    }
  }, [listId])

  const applyLoadResult = useCallback(
    (
      result:
        | { type: 'not-found' }
        | { type: 'ready'; reminderList: ReminderList; fetchedItems: ReminderItemType[] }
    ) => {
      if (result.type === 'not-found') {
        setList(null)
        setItems([])
        setStatus('not-found')
        syncPreview([])
        return
      }

      setList(result.reminderList)
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
        console.error('[ReminderDetailView] initial load failed:', e)
        setList(null)
        setItems([])
        setStatus('fetch-error')
      })

    return () => {
      cancelled = true
    }
  }, [applyLoadResult, fetchDetailData])

  useEffect(() => {
    if (!addSession) return

    const handlePointerDown = (event: PointerEvent) => {
      const input = addInputRef.current
      const shell = shellRef.current
      const target = event.target
      if (!(target instanceof Node) || !input || !shell || !shell.contains(target)) return

      if (input === target || input.contains(target)) return
      if (target instanceof Element && target.closest('form')?.contains(input)) return

      setAddSession(null)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [addSession])

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

  const setItemsWithPreview = useCallback(
    (updater: ReminderItemType[] | ((prev: ReminderItemType[]) => ReminderItemType[])) => {
      setItems((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        syncPreview(next)
        return next
      })
    },
    [syncPreview]
  )

  const handleAddItem = useCallback(async (
    name: string,
    afterItemId?: string
  ): Promise<ReminderItemType | null> => {
    setMutationError(null)
    const optimisticItem: ReminderItemType = {
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
    const optimisticItems = withInsertedReminderItem(items, optimisticItem, afterItemId)
    setItemsWithPreview(optimisticItems)

    try {
      const realItem = await addReminderItem(listId, user.id, name, afterItemId ?? null)
      const nextItems = optimisticItems.map((item) =>
        item.id === optimisticItem.id
          ? { ...realItem, sort_order: item.sort_order }
          : item
      )
      setItemsWithPreview(nextItems)
      broadcast()
      return nextItems.find((item) => item.id === realItem.id) ?? realItem
    } catch (e) {
      console.error('[ReminderDetailView] addReminderItem failed:', e)
      setItemsWithPreview(previousItems)
      setMutationError('아이템을 저장하지 못했어요')
      return null
    }
  }, [broadcast, items, listId, setItemsWithPreview, user.id])

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
    (afterItemId: string) =>
      async (name: string): Promise<boolean> => {
        const createdItem = await handleAddItem(name, afterItemId)
        if (!createdItem) return false

        setAddSession({ mode: 'inline', anchorItemId: createdItem.id })
        requestAnimationFrame(() => {
          addInputRef.current?.focus()
        })
        return true
      },
    [handleAddItem]
  )

  const handleCheck = async (itemId: string, checked: boolean) => {
    setMutationError(null)
    const previousItems = items
    setAddSession((currentSession) =>
      currentSession?.mode === 'inline' && currentSession.anchorItemId === itemId
        ? null
        : currentSession
    )

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
        await deleteReminderItem(itemId)
      } else {
        await checkReminderItem(itemId, user.id, checked)
      }
      broadcast()
    } catch (e) {
      console.error('[ReminderDetailView] checkReminderItem failed:', e)
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
    setDeleteConfirmItem(null)
    const previousItems = items
    setAddSession((currentSession) =>
      currentSession?.mode === 'inline' && currentSession.anchorItemId === itemId
        ? null
        : currentSession
    )
    setItemsWithPreview((prev) => prev.filter((item) => item.id !== itemId))

    try {
      await deleteReminderItem(itemId)
      broadcast()
    } catch (e) {
      console.error('[ReminderDetailView] deleteReminderItem failed:', e)
      setItemsWithPreview(previousItems)
      setMutationError('아이템을 삭제하지 못했어요')
    }
  }

  const handleRename = async (itemId: string, name: string): Promise<boolean> => {
    setMutationError(null)
    const previousItems = items
    setItemsWithPreview((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, name } : item))
    )

    try {
      await renameReminderItem(itemId, name)
      broadcast()
      return true
    } catch (e) {
      console.error('[ReminderDetailView] renameReminderItem failed:', e)
      setItemsWithPreview(previousItems)
      setMutationError('아이템 이름을 저장하지 못했어요')
      return false
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
      await reorderReminderItems(
        reorderedUnchecked.map(({ id, sort_order }) => ({ id, sort_order }))
      )
      broadcast()
    } catch (e) {
      console.error('[ReminderDetailView] reorderReminderItems failed:', e)
      setItemsWithPreview(previousItems)
      setMutationError('아이템 순서를 저장하지 못했어요')
    }
  }

  const handleGroupChange = async (nextValue: string) => {
    if (!list || groupSaving) return

    const nextGroupId = nextValue === '' ? null : nextValue
    if (nextGroupId === list.reminder_group_id) return

    setMutationError(null)
    setGroupSaving(true)
    const previousList = list
    setList({ ...list, reminder_group_id: nextGroupId })
    onListGroupChange?.(list.id, nextGroupId)

    try {
      const updatedList = await updateReminderListGroup(list.id, user.id, nextGroupId)
      setList(updatedList)
      onListGroupChange?.(updatedList.id, updatedList.reminder_group_id)
      broadcastListChange()
    } catch (e) {
      console.error('[ReminderDetailView] updateReminderListGroup failed:', e)
      setList(previousList)
      onListGroupChange?.(previousList.id, previousList.reminder_group_id)
      setMutationError('그룹을 변경하지 못했어요')
    } finally {
      setGroupSaving(false)
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

  return (
    <div
      data-testid="reminder-detail-overlay"
      className="fixed inset-0 z-[55] overflow-hidden bg-white dark:bg-stone-950"
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
              className="p-2 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              aria-label="목록으로 돌아가기"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
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
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6rem)' }}
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
                {uncheckedItems.map((item) => (
                  <div key={item.id}>
                    <ReminderItem
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
                    />
                    {addSession?.mode === 'inline' && addSession.anchorItemId === item.id && (
                      <AddItemInput
                        ref={addInputRef}
                        onAdd={handleInlineAdd(item.id)}
                        onCancelEmpty={() => setAddSession(null)}
                        inline
                        testId="inline-add-item-input"
                      />
                    )}
                  </div>
                ))}
              </SortableContext>
            </DndContext>

            {addSession?.mode === 'bottom' && (
              <AddItemInput
                ref={addInputRef}
                onAdd={handleBottomAdd}
                onCancelEmpty={() => setAddSession(null)}
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
                        onCancelEmpty={() => setAddSession(null)}
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
