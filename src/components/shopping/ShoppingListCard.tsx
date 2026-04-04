'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingCart, Trash2, CheckSquare, GripVertical, X } from 'lucide-react'
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
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const modalTitleId = `modal-title-${list.id}`

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

  // 모달 열릴 때 취소 버튼으로 포커스 이동
  useEffect(() => {
    if (confirming) {
      cancelButtonRef.current?.focus()
    }
  }, [confirming])

  // Escape 키로 모달 닫기
  useEffect(() => {
    if (!confirming) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirming(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [confirming])

  const handleNameClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditValue(list.name)
    setEditing(true)
  }

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      setEditValue(list.name)
      setEditing(true)
    }
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

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && !confirming && !editing) {
      e.preventDefault()
      router.push(`/shopping/${list.id}`)
    }
  }

  const visibleItems = previewItems.slice(0, 3)
  const hiddenCount = previewItems.length - visibleItems.length

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className="group flex flex-col p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-900 border border-stone-100 dark:border-stone-800 shadow-sm hover:border-orange-200 dark:hover:border-orange-900 transition-all min-h-[160px]"
      >
        {/* Top row: grip + delete */}
        <div className="flex items-center justify-between mb-2.5">
          <button
            {...attributes}
            {...listeners}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-300 dark:text-stone-600 touch-none cursor-grab active:cursor-grabbing"
            aria-label="드래그 핸들"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={14} />
          </button>
          {!editing && (
            <button
              onClick={handleDeleteClick}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-stone-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all"
              aria-label="삭제"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {/* Card body — clickable for navigation */}
        <div
          tabIndex={confirming || editing ? -1 : 0}
          aria-label={`${list.name} 장바구니 열기`}
          onClick={() => !confirming && !editing && router.push(`/shopping/${list.id}`)}
          onKeyDown={handleCardKeyDown}
          className="flex flex-col flex-1 cursor-pointer active:scale-[0.98] transition-transform outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-1 rounded-xl"
        >
          {/* Icon + name */}
          <div className="flex items-center gap-2 mb-1.5">
            <div className="p-1.5 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-400 flex-shrink-0">
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
                  onKeyDown={handleInputKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full font-semibold text-sm text-stone-800 dark:text-stone-100 bg-transparent border-b border-orange-400 outline-none"
                  aria-label="목록 이름 수정"
                />
              ) : (
                <p
                  role="button"
                  tabIndex={0}
                  className="font-semibold text-sm text-stone-800 dark:text-stone-100 truncate leading-snug outline-none focus-visible:underline"
                  onClick={handleNameClick}
                  onKeyDown={handleNameKeyDown}
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
              <><X size={9} />삭제 방식</>
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
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={modalTitleId}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={handleCancel}
          />
          <div className="relative bg-stone-50 dark:bg-stone-900 rounded-2xl w-full sm:max-w-xs p-6 shadow-xl">
            <p id={modalTitleId} className="font-semibold text-stone-800 dark:text-stone-100 mb-1">장바구니 삭제</p>
            <p className="text-sm text-stone-500 dark:text-stone-400 mb-6">
              &ldquo;{list.name}&rdquo;을(를) 삭제할까요?
            </p>
            <div className="flex gap-3">
              <button
                ref={cancelButtonRef}
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
