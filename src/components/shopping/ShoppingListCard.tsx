'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingCart, Trash2, CheckSquare, GripVertical } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ShoppingList, ItemPreview } from '@/lib/shopping'

interface Props {
  list: ShoppingList
  previewItems?: ItemPreview[]
  onDelete: (listId: string) => void
  onRename: (listId: string, name: string) => void
}

export function ShoppingListCard({ list, previewItems = [], onDelete, onRename }: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(list.name)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: list.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const handleNameClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditValue(list.name)
    setEditing(true)
  }

  const commitEdit = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== list.name) {
      onRename(list.id, trimmed)
    } else {
      setEditValue(list.name)
    }
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') {
      setEditValue(list.name)
      setEditing(false)
    }
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirming(true)
  }

  const handleConfirm = () => {
    setConfirming(false)
    onDelete(list.id)
  }

  const handleCancel = () => {
    setConfirming(false)
  }

  const visibleItems = previewItems.slice(0, 3)
  const hiddenCount = previewItems.length - visibleItems.length

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className="group flex flex-col p-3.5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 shadow-sm hover:shadow-md hover:border-orange-200 dark:hover:border-orange-900 transition-all min-h-[160px]"
      >
        {/* Top row: grip + delete */}
        <div className="flex items-center justify-between mb-2.5">
          <button
            {...attributes}
            {...listeners}
            className="p-1 text-stone-300 dark:text-stone-600 touch-none cursor-grab active:cursor-grabbing"
            aria-label="드래그 핸들"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={14} />
          </button>
          {!editing && (
            <button
              onClick={handleDeleteClick}
              className="p-1.5 rounded-lg text-stone-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all"
              aria-label="삭제"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {/* Card body — clickable for navigation */}
        <div
          onClick={() => !confirming && !editing && router.push(`/shopping/${list.id}`)}
          className="flex flex-col flex-1 cursor-pointer active:scale-[0.98] transition-transform"
        >
          {/* Icon + name */}
          <div className="flex items-start gap-2 mb-1.5">
            <div className="p-1.5 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-400 flex-shrink-0 mt-0.5">
              <ShoppingCart size={15} />
            </div>
            <div className="flex-1 min-w-0">
              {editing ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onFocus={(e) => {
                    const len = e.target.value.length
                    e.target.setSelectionRange(len, len)
                  }}
                  onBlur={commitEdit}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full font-semibold text-sm text-stone-800 dark:text-stone-100 bg-transparent border-b border-orange-400 outline-none"
                  aria-label="목록 이름 수정"
                />
              ) : (
                <p
                  className="font-semibold text-sm text-stone-800 dark:text-stone-100 truncate leading-snug"
                  onClick={handleNameClick}
                >
                  {list.name}
                </p>
              )}
            </div>
          </div>

          {/* Type indicator */}
          <p className="text-[11px] text-stone-400 dark:text-stone-500 flex items-center gap-1 mb-2.5 pl-0.5">
            {list.type === 'strikethrough' ? (
              <><CheckSquare size={9} />취소선 방식</>
            ) : (
              <><Trash2 size={9} />삭제 방식</>
            )}
          </p>

          {/* Preview items */}
          {visibleItems.length > 0 && (
            <div className="border-t border-stone-100 dark:border-stone-800 pt-2 space-y-1">
              {visibleItems.map((item) => (
                <p
                  key={item.id}
                  className={`text-[11px] truncate ${
                    item.is_checked
                      ? 'line-through text-stone-300 dark:text-stone-600'
                      : 'text-stone-500 dark:text-stone-400'
                  }`}
                >
                  · {item.name}
                </p>
              ))}
              {hiddenCount > 0 && (
                <p className="text-[11px] text-stone-400 dark:text-stone-500">
                  +{hiddenCount}개 더
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={handleCancel}
          />
          <div className="relative bg-white dark:bg-stone-900 rounded-2xl w-full sm:max-w-xs p-6 shadow-xl">
            <p className="font-semibold text-stone-800 dark:text-stone-100 mb-1">장바구니 삭제</p>
            <p className="text-sm text-stone-500 dark:text-stone-400 mb-6">
              &ldquo;{list.name}&rdquo;을(를) 삭제할까요?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                className="flex-1 py-2.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-semibold text-sm transition-colors hover:bg-stone-200 dark:hover:bg-stone-700"
                aria-label="취소"
              >
                취소
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors"
                aria-label="삭제 확인"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
