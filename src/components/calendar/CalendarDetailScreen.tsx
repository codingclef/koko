'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, Check } from 'lucide-react'
import { CALENDAR_COLORS, CALENDAR_COLOR_NAMES, type Calendar, type FamilyMember, type SaveResult } from '@/lib/calendar'

interface Props {
  calendar: Calendar
  /**
   * null = 멤버 로딩 중 (저장 비활성화)
   * string[] = 로드 완료
   * memberLoadError=true 일 때도 null 유지 (빈 배열로 위장하지 않음)
   */
  memberIds: string[] | null
  /** true 면 멤버 섹션에 에러 문구 표시, 저장 시 setCalendarMembers skip */
  memberLoadError: boolean
  familyMembers: FamilyMember[]
  currentUserId: string
  onBack: () => void
  /**
   * memberIds가 null(에러 포함) 이면 멤버 변경 저장 skip.
   * 이름/색상 실패 → throw → 이 컴포넌트 catch → 화면 유지 + 에러 표시
   * 이름/색상 성공 + 멤버 실패 → { status: 'partial' } 반환 → onBack() 호출
   */
  onSave: (calendarId: string, name: string, color: string, memberIds: string[] | null) => Promise<SaveResult>
  /** 성공 시 onBack() 호출. 실패 시 detail 화면 유지 + 에러 표시 */
  onDelete: (calendarId: string) => Promise<void>
}

export function CalendarDetailScreen({
  calendar,
  memberIds,
  memberLoadError,
  familyMembers,
  currentUserId,
  onBack,
  onSave,
  onDelete,
}: Props) {
  const [name, setName] = useState(calendar.name)
  const [color, setColor] = useState(calendar.color)

  // owner(currentUserId) 제외한 나머지 구성원만 선택 대상
  const selectableMembers = familyMembers.filter((m) => m.user_id !== currentUserId)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (memberIds !== null) {
      setSelectedIds(new Set(memberIds.filter((id) => id !== currentUserId)))
    }
  }, [memberIds, currentUserId])

  const [saving, setSaving] = useState(false)
  // 공통 에러 배너 (저장 버튼 바로 위) — 상황별 메시지 구분
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const membersStillLoading = memberIds === null && !memberLoadError
  const isSaveDisabled = membersStillLoading || saving

  const toggleMember = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const handleSave = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      // memberLoadError 또는 아직 null 이면 null 전달 → 핸들러가 멤버 저장 skip
      const memberIdsToSave = memberLoadError || memberIds === null
        ? null
        : Array.from(selectedIds)
      await onSave(calendar.id, name.trim(), color, memberIdsToSave)
      onBack()
    } catch (e) {
      console.error('[CalendarDetailScreen] save failed:', e)
      setSaveError('저장에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete(calendar.id)
      onBack() // 삭제 성공 시에만 리스트로 복귀
    } catch (e) {
      console.error('[CalendarDetailScreen] delete failed:', e)
      setDeleteError('삭제에 실패했습니다. 다시 시도해주세요.')
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-stone-50 dark:bg-stone-950 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center gap-1 px-4 pt-12 pb-4 shrink-0 bg-stone-50 dark:bg-stone-950">
        <button
          onClick={onBack}
          className="flex items-center justify-center min-h-[44px] min-w-[44px] -ml-2.5 rounded-xl text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          aria-label="뒤로"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100 truncate">
          {calendar.name}
        </h1>
      </div>

      {/* 스크롤 영역 */}
      <div className="flex-1 overflow-y-auto px-4 pb-safe space-y-4">

        {/* 기본 정보 */}
        <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 p-4">
          <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-3">
            기본 정보
          </p>

          {/* 이름 */}
          <div className="mb-4">
            <label className="block text-xs text-stone-500 dark:text-stone-400 mb-1.5">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="캘린더 이름"
              maxLength={30}
              className="w-full px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-accent-400 text-sm"
            />
          </div>

          {/* 색상 */}
          <div>
            <label className="block text-xs text-stone-500 dark:text-stone-400 mb-2">색상</label>
            <div className="flex gap-1 flex-wrap">
              {CALENDAR_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  aria-pressed={color === c}
                  aria-label={CALENDAR_COLOR_NAMES[c] ?? c}
                  className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-full transition-transform"
                >
                  <span
                    className="w-8 h-8 rounded-full block"
                    style={{
                      backgroundColor: c,
                      transform: color === c ? 'scale(1.25)' : 'scale(1)',
                      outline: color === c ? `2px solid ${c}` : 'none',
                      outlineOffset: '2px',
                      transition: 'transform 150ms ease-out',
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 멤버 — 가족 구성원이 본인 외에 있을 때만 표시 */}
        {selectableMembers.length > 0 && (
          <div className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 p-4">
            <p className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-3">
              멤버
            </p>

            {/* 현재 상태 설명 — 섹션 안에 표시 */}
            {memberIds === null && !memberLoadError && (
              <div className="flex items-center gap-2 py-2">
                <div className="w-4 h-4 rounded-full border-2 border-accent-300 border-t-accent-500 animate-spin shrink-0" />
                <p className="text-sm text-stone-400 dark:text-stone-500">멤버 정보를 불러오는 중...</p>
              </div>
            )}

            {memberLoadError && (
              <p className="text-sm text-stone-400 dark:text-stone-500">
                멤버 정보를 불러오지 못했어요. 이번 저장에는 멤버 변경이 반영되지 않습니다.
              </p>
            )}

            {/* 멤버 선택 UI — 로드 완료 시에만 표시 */}
            {memberIds !== null && !memberLoadError && (
              <div className="space-y-2">
                {selectableMembers.map((member) => {
                  const selected = selectedIds.has(member.user_id)
                  return (
                    <button
                      key={member.user_id}
                      onClick={() => toggleMember(member.user_id)}
                      role="checkbox"
                      aria-checked={selected}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                        selected
                          ? 'border-accent-300 bg-accent-50 dark:bg-accent-950/30 dark:border-accent-700'
                          : 'border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700'
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
            )}
          </div>
        )}

        {/* 저장 버튼 — 에러 배너는 버튼 바로 위 (저장 액션 결과 설명) */}
        <div>
          {saveError && (
            <p className="text-xs text-red-400 mb-2 text-center">{saveError}</p>
          )}
          <button
            onClick={handleSave}
            disabled={isSaveDisabled || !name.trim()}
            className="w-full py-3 rounded-2xl bg-accent-400 hover:bg-accent-500 disabled:opacity-40 text-white font-semibold text-sm transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>

        {/* 위험 구역 — 일반 설정 카드와 시각적으로 분리 */}
        <div className="rounded-2xl border border-red-100 dark:border-red-900/40 p-4">
          <p className="text-xs font-semibold text-red-400 dark:text-red-500 uppercase tracking-wide mb-3">
            위험 구역
          </p>
          {deleteError && (
            <p className="text-xs text-red-400 mb-2">{deleteError}</p>
          )}
          {confirmDelete ? (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-semibold text-sm transition-colors hover:bg-stone-200 dark:hover:bg-stone-700"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
              >
                {deleting ? '삭제 중...' : '정말 삭제'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleDelete}
              className="w-full py-2.5 rounded-xl border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 font-semibold text-sm transition-colors"
            >
              캘린더 삭제
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
