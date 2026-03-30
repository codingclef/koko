'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { CALENDAR_COLORS, type Calendar } from '@/lib/calendar'

interface Props {
  initial?: Calendar
  onClose: () => void
  onSave: (name: string, color: string) => Promise<void>
  onDelete?: () => Promise<void>
}

export function CalendarFormModal({ initial, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color ?? CALENDAR_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave(name.trim(), color)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    setSaving(true)
    try {
      await onDelete()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white dark:bg-stone-900 rounded-t-2xl flex flex-col max-h-[85dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">
            {initial ? '캘린더 편집' : '새 캘린더'}
          </h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-600">
            <X size={20} />
          </button>
        </div>

        {/* 스크롤 가능 콘텐츠 */}
        <div className="overflow-y-auto flex-1 px-6 pb-2 space-y-5">
          <div>
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1.5">
              이름
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="캘린더 이름"
              className="w-full px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-400 text-base"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-2">
              색상
            </label>
            <div className="flex gap-2 flex-wrap">
              {CALENDAR_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-8 h-8 rounded-full transition-transform"
                  style={{ backgroundColor: c, transform: color === c ? 'scale(1.25)' : 'scale(1)', outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 저장 버튼 — 항상 하단 고정 */}
        <div className="px-6 py-4 pb-safe shrink-0 border-t border-stone-100 dark:border-stone-800">
          <div className="flex gap-2">
            {initial && onDelete && (
              confirmDelete ? (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold text-sm"
                >
                  정말 삭제
                </button>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="px-4 py-2.5 rounded-xl border border-red-300 text-red-500 font-semibold text-sm"
                >
                  삭제
                </button>
              )
            )}
            <button
              onClick={handleSave}
              disabled={!name.trim() || saving}
              className="flex-1 py-2.5 rounded-xl bg-orange-400 hover:bg-orange-500 disabled:opacity-40 text-white font-semibold text-sm transition-colors"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
