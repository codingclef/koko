'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingCart, Trash2, CheckSquare, GripVertical } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ShoppingList } from '@/lib/shopping'

interface Props {
  list: ShoppingList
  onDelete: (listId: string) => void
  onRename: (listId: string, name: string) => void
}

export function ShoppingListCard({ list, onDelete, onRename }: Props) {
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

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className="group flex items-center gap-2 p-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 shadow-sm hover:shadow-md hover:border-orange-200 dark:hover:border-orange-900 transition-all"
      >
        <button
          {...attributes}
          {...listeners}
          className="flex-shrink-0 p-1 text-stone-300 dark:text-stone-600 touch-none cursor-grab active:cursor-grabbing"
          aria-label="드래그 핸들"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={16} />
        </button>

        <div
          onClick={() => !confirming && !editing && router.push(`/shopping/${list.id}`)}
          className="flex flex-1 items-center justify-between cursor-pointer active:scale-[0.98] transition-all min-w-0"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="p-2 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-400 flex-shrink-0">
              <ShoppingCart size={20} />
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
                  className="w-full font-semibold text-stone-800 dark:text-stone-100 bg-transparent border-b border-orange-400 outline-none"
                  aria-label="목록 이름 수정"
                />
              ) : (
                <p
                  className="font-semibold text-stone-800 dark:text-stone-100 truncate"
                  onClick={handleNameClick}
                >
                  {list.name}
                </p>
              )}
              <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 flex items-center gap-1">
                {list.type === 'strikethrough' ? (
                  <>
                    <CheckSquare size={10} />
                    취소선 방식
                  </>
                ) : (
                  <>
                    <Trash2 size={10} />
                    삭제 방식
                  </>
                )}
              </p>
            </div>
          </div>

          {!editing && (
            <button
              onClick={handleDeleteClick}
              className="opacity-0 group-hover:opacity-100 p-2 rounded-xl text-stone-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all flex-shrink-0"
              aria-label="삭제"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
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
