'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { CALENDAR_COLORS, type Calendar, type FamilyMember } from '@/lib/calendar'

interface Props {
  initial?: Calendar
  /** 현재 캘린더의 멤버 user_id 목록 (수정 시) */
  initialMemberIds?: string[]
  /** 패밀리 전체 구성원 */
  familyMembers: FamilyMember[]
  /** 현재 로그인 유저 id (owner — 항상 포함, UI에서 제외) */
  currentUserId: string
  onClose: () => void
  onSave: (name: string, color: string, memberUserIds: string[]) => Promise<void>
  onDelete?: () => Promise<void>
}

export function CalendarFormModal({
  initial,
  initialMemberIds,
  familyMembers,
  currentUserId,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color ?? CALENDAR_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // owner(currentUserId) 제외한 나머지 구성원만 선택 대상
  const selectableMembers = familyMembers.filter((m) => m.user_id !== currentUserId)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    if (initialMemberIds) {
      return new Set(initialMemberIds.filter((id) => id !== currentUserId))
    }
    // 신규 생성: 기본값으로 전원 선택
    return new Set(selectableMembers.map((m) => m.user_id))
  })

  const toggleMember = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(name.trim(), color, Array.from(selectedIds))
      onClose()
    } catch (e) {
      console.error('[CalendarFormModal] save failed:', e)
      setSaveError('저장에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    setSaving(true)
    setSaveError(null)
    try {
      await onDelete()
      onClose()
    } catch (e) {
      console.error('[CalendarFormModal] delete failed:', e)
      setSaveError('삭제에 실패했습니다. 다시 시도해주세요.')
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
          {/* 이름 */}
          <div>
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1.5">
              이름
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="캘린더 이름"
              className="w-full px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-accent-400 text-base"
              autoFocus
            />
          </div>

          {/* 색상 */}
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
                  style={{
                    backgroundColor: c,
                    transform: color === c ? 'scale(1.25)' : 'scale(1)',
                    outline: color === c ? `2px solid ${c}` : 'none',
                    outlineOffset: '2px',
                  }}
                />
              ))}
            </div>
          </div>

          {/* 멤버 선택 — 패밀리 구성원이 본인 외에 있을 때만 표시 */}
          {selectableMembers.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-2">
                공유 멤버
              </label>
              <div className="space-y-2">
                {selectableMembers.map((member) => {
                  const selected = selectedIds.has(member.user_id)
                  return (
                    <button
                      key={member.user_id}
                      onClick={() => toggleMember(member.user_id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                        selected
                          ? 'border-accent-300 bg-accent-50 dark:bg-accent-950/30 dark:border-accent-700'
                          : 'border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          selected
                            ? 'border-accent-400 bg-accent-400'
                            : 'border-stone-300 dark:border-stone-600'
                        }`}
                      >
                        {selected && <Check size={12} className="text-white" />}
                      </div>
                      <span className="text-sm text-stone-800 dark:text-stone-100 font-medium">
                        {member.display_name}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* 저장/삭제 버튼 — 항상 하단 고정 */}
        <div className="px-6 py-4 pb-safe shrink-0 border-t border-stone-100 dark:border-stone-800">
          {saveError && (
            <p className="text-xs text-red-500 mb-3 text-center">{saveError}</p>
          )}
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
              className="flex-1 py-2.5 rounded-xl bg-accent-400 hover:bg-accent-500 disabled:opacity-40 text-white font-semibold text-sm transition-colors"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
