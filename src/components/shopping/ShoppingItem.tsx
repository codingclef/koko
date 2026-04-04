'use client'

import { useState } from 'react'
import { GripVertical, Trash2 } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ShoppingItem as ShoppingItemType } from '@/lib/shopping'

interface Props {
  item: ShoppingItemType
  listType: 'strikethrough' | 'delete'
  onCheck: (itemId: string, checked: boolean) => void
  onDelete: (itemId: string) => void
  onRename: (itemId: string, name: string) => void
  draggable?: boolean
}

export function ShoppingItem({ item, listType, onCheck, onDelete, onRename, draggable = false }: Props) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(item.name)
  const [confirming, setConfirming] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !draggable })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }

  const handleNameClick = () => {
    setEditValue(item.name)
    setEditing(true)
  }

  const commitEdit = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== item.name) {
      onRename(item.id, trimmed)
    } else {
      setEditValue(item.name)
    }
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') {
      setEditValue(item.name)
      setEditing(false)
    }
  }

  const handleCheck = () => {
    if (!editing) onCheck(item.id, !item.is_checked)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
        item.is_checked && listType === 'strikethrough'
          ? 'opacity-60'
          : 'opacity-100'
      }`}
    >
      {draggable && (
        <button
          {...attributes}
          {...listeners}
          className="flex-shrink-0 p-0.5 text-stone-300 dark:text-stone-600 touch-none cursor-grab active:cursor-grabbing"
          aria-label="드래그 핸들"
        >
          <GripVertical size={14} />
        </button>
      )}

      <button
        onClick={handleCheck}
        aria-label={item.is_checked ? '체크 해제' : '체크'}
        className="flex-shrink-0 p-2 -m-2 rounded-full"
      >
        <span
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
            item.is_checked
              ? 'bg-orange-400 border-orange-400'
              : 'border-stone-300 dark:border-stone-600 hover:border-orange-300'
          }`}
        >
          {item.is_checked && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      </button>

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
          className="flex-1 text-stone-800 dark:text-stone-100 bg-transparent border-b border-orange-400 outline-none"
          aria-label="아이템 이름 수정"
        />
      ) : (
        <span
          onClick={handleNameClick}
          className={`flex-1 text-stone-800 dark:text-stone-100 transition-all cursor-text ${
            item.is_checked && listType === 'strikethrough'
              ? 'line-through text-stone-400 dark:text-stone-500'
              : ''
          }`}
        >
          {item.name}
        </span>
      )}

      <button
        onClick={() => setConfirming(true)}
        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 rounded-lg text-stone-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all"
        aria-label="삭제"
      >
        <Trash2 size={14} />
      </button>

      {confirming && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirming(false)} />
          <div className="relative bg-stone-50 dark:bg-stone-900 rounded-2xl w-full sm:max-w-xs p-6 shadow-xl">
            <p className="font-semibold text-stone-800 dark:text-stone-100 mb-1">아이템 삭제</p>
            <p className="text-sm text-stone-500 dark:text-stone-400 mb-6">
              &ldquo;{item.name}&rdquo;을(를) 삭제할까요?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 py-2.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-semibold text-sm transition-colors hover:bg-stone-200 dark:hover:bg-stone-700"
                aria-label="취소"
              >
                취소
              </button>
              <button
                onClick={() => { setConfirming(false); onDelete(item.id) }}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors"
                aria-label="삭제 확인"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
