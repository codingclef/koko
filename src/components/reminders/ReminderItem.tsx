'use client'

import { useEffect, useRef, useState } from 'react'
import { GripVertical, Trash2 } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReminderItem as ReminderItemType } from '@/lib/reminder-lists'

interface Props {
  item: ReminderItemType
  listType: 'strikethrough' | 'delete'
  onCheck: (itemId: string, checked: boolean) => void
  onDelete: (itemId: string) => void
  onRename: (itemId: string, name: string) => Promise<boolean | void> | boolean | void
  isEditing?: boolean
  onEditStart?: (itemId: string) => void
  onEditEnd?: (itemId: string) => void
  onAdvanceEdit?: (itemId: string) => void
  draggable?: boolean
}

export function ReminderItem({
  item,
  listType,
  onCheck,
  onDelete,
  onRename,
  isEditing,
  onEditStart,
  onEditEnd,
  onAdvanceEdit,
  draggable = false,
}: Props) {
  const [internalEditing, setInternalEditing] = useState(false)
  const [editValue, setEditValue] = useState(item.name)
  const committingRef = useRef(false)
  const wasEditingRef = useRef(false)
  const editing = isEditing ?? internalEditing

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
    if (onEditStart) {
      onEditStart(item.id)
    } else {
      setInternalEditing(true)
    }
  }

  useEffect(() => {
    if (editing && !wasEditingRef.current) {
      setEditValue(item.name)
    }
    wasEditingRef.current = editing
  }, [editing, item.name])

  const endEditing = () => {
    if (onEditEnd) {
      onEditEnd(item.id)
    } else {
      setInternalEditing(false)
    }
  }

  const commitEdit = async (advanceAfterSave = false) => {
    const trimmed = editValue.trim()
    if (!trimmed) {
      setEditValue(item.name)
      endEditing()
      return
    }

    if (trimmed === item.name) {
      if (advanceAfterSave && onAdvanceEdit) {
        onAdvanceEdit(item.id)
      } else {
        endEditing()
      }
      return
    }

    committingRef.current = true
    try {
      const renamed = await onRename(item.id, trimmed)
      if (renamed === false) return

      if (advanceAfterSave && onAdvanceEdit) {
        onAdvanceEdit(item.id)
      } else {
        endEditing()
      }
    } finally {
      committingRef.current = false
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void commitEdit(true)
    }
    if (e.key === 'Escape') {
      setEditValue(item.name)
      endEditing()
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
              ? 'bg-accent-400 border-accent-400'
              : 'border-stone-300 dark:border-stone-600 hover:border-accent-300'
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
          onBlur={() => {
            if (!committingRef.current) void commitEdit(false)
          }}
          onKeyDown={handleKeyDown}
          className="flex-1 text-stone-800 dark:text-stone-100 bg-transparent border-b border-accent-400 outline-none"
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
        onClick={() => onDelete(item.id)}
        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 rounded-lg text-stone-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all"
        aria-label="삭제"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}
