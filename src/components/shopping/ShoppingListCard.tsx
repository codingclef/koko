'use client'

import { useRef, useState } from 'react'
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
  const inputRef = useRef<HTMLInputElement>(null)

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
    setTimeout(() => inputRef.current?.select(), 0)
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

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(list.id)
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirming(false)
  }

  return (
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
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
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

        {confirming ? (
          <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <span className="text-xs text-stone-500 dark:text-stone-400">삭제할까요?</span>
            <button
              onClick={handleConfirm}
              className="px-3 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-colors"
              aria-label="삭제 확인"
            >
              삭제
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 text-xs font-semibold transition-colors"
              aria-label="취소"
            >
              취소
            </button>
          </div>
        ) : (
          !editing && (
            <button
              onClick={handleDeleteClick}
              className="opacity-0 group-hover:opacity-100 p-2 rounded-xl text-stone-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all flex-shrink-0"
              aria-label="삭제"
            >
              <Trash2 size={16} />
            </button>
          )
        )}
      </div>
    </div>
  )
}
