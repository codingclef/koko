'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, Plus, X } from 'lucide-react'
import {
  getReminderGroupMembers,
  getReminderGroupMembersForGroups,
  REMINDER_GROUP_COLORS,
  REMINDER_GROUP_COLOR_NAMES,
  type ReminderGroup,
  type ReminderGroupMember,
} from '@/lib/shopping'
import type { FamilyMember } from '@/lib/calendar'
import { toDisplayColor } from '@/lib/label-colors'

type SaveResult = { status: 'success' } | { status: 'partial' }
type View = 'list' | 'detail' | 'new'
type MemberMap = Record<string, ReminderGroupMember[]>

interface Props {
  groups: ReminderGroup[]
  familyMembers: FamilyMember[]
  currentUserId: string
  onClose: () => void
  onCreate: (name: string, color: string, memberIds: string[]) => Promise<void>
  onSave: (
    reminderGroupId: string,
    name: string,
    color: string,
    memberIds: string[] | null
  ) => Promise<SaveResult>
  onDelete: (reminderGroupId: string) => Promise<void>
}

export function ReminderGroupListSheet({
  groups,
  familyMembers,
  currentUserId,
  onClose,
  onCreate,
  onSave,
  onDelete,
}: Props) {
  const [memberMap, setMemberMap] = useState<MemberMap>({})
  const [listWarning, setListWarning] = useState<string | null>(null)
  const [view, setView] = useState<View>('list')
  const [selectedGroup, setSelectedGroup] = useState<ReminderGroup | null>(null)
  const [memberIds, setMemberIds] = useState<string[] | null>(null)
  const [memberLoadError, setMemberLoadError] = useState(false)
  const memberLoadSeqRef = useRef(0)

  useEffect(() => {
    if (groups.length === 0) {
      return
    }

    getReminderGroupMembersForGroups(groups.map((group) => group.id))
      .then((members) => {
        const nextMap: MemberMap = {}
        for (const member of members) {
          if (!nextMap[member.reminder_group_id]) nextMap[member.reminder_group_id] = []
          nextMap[member.reminder_group_id].push(member)
        }
        setMemberMap(nextMap)
      })
      .catch((e) => console.error('[ReminderGroupListSheet] load members failed:', e))
  }, [groups])

  const getMemberName = (userId: string) =>
    familyMembers.find((member) => member.user_id === userId)?.display_name ?? '?'

  const getInitial = (userId: string) => getMemberName(userId).charAt(0).toUpperCase()

  const handleSelectGroup = (group: ReminderGroup) => {
    setSelectedGroup(group)
    setMemberIds(null)
    setMemberLoadError(false)
    setListWarning(null)
    setView('detail')

    const seq = ++memberLoadSeqRef.current
    getReminderGroupMembers(group.id)
      .then((members) => {
        if (seq !== memberLoadSeqRef.current) return
        setMemberIds(members.map((member) => member.user_id))
      })
      .catch((e) => {
        if (seq !== memberLoadSeqRef.current) return
        console.error('[ReminderGroupListSheet] getReminderGroupMembers failed:', e)
        setMemberLoadError(true)
      })
  }

  const handleNewGroup = () => {
    setSelectedGroup(null)
    setMemberIds([])
    setMemberLoadError(false)
    setListWarning(null)
    setView('new')
  }

  const handleBack = () => {
    setView('list')
    setSelectedGroup(null)
    setMemberIds(null)
    setMemberLoadError(false)
  }

  const handleSave = async (
    reminderGroupId: string,
    name: string,
    color: string,
    nextMemberIds: string[] | null
  ): Promise<SaveResult> => {
    const result = await onSave(reminderGroupId, name, color, nextMemberIds)
    if (result.status === 'partial') {
      setListWarning('그룹 정보는 저장됐지만 멤버는 저장하지 못했어요')
    }
    return result
  }

  return (
    <div className="fixed inset-0 z-[70] bg-white dark:bg-stone-950 overflow-hidden">
      {view === 'list' && (
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center justify-between px-4 pt-12 pb-4">
            <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100">리마인더 그룹</h1>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
            >
              <X size={22} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-safe space-y-2">
            {listWarning && (
              <div className="mb-1 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-600 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
                {listWarning}
              </div>
            )}

            <p className="text-xs text-stone-400 dark:text-stone-500 mb-3">
              그룹 ({groups.length})
            </p>

            {groups.map((group) => {
              const members = memberMap[group.id] ?? []
              const visibleMembers = members.slice(0, 3)
              const overflow = members.length - visibleMembers.length
              const displayColor = toDisplayColor(group.color)

              return (
                <button
                  key={group.id}
                  onClick={() => handleSelectGroup(group)}
                  className="w-full flex items-center gap-4 rounded-2xl p-3 text-left transition-colors hover:bg-stone-50 dark:hover:bg-stone-900"
                >
                  <div
                    className="h-16 w-16 shrink-0 rounded-2xl"
                    style={{ backgroundColor: displayColor }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-stone-800 dark:text-stone-100">
                      {group.name}
                    </p>
                    {members.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1">
                        <div className="flex -space-x-1.5">
                          {visibleMembers.map((member) => (
                            <div
                              key={member.user_id}
                              className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-white dark:ring-stone-950"
                              style={{ backgroundColor: displayColor }}
                              title={getMemberName(member.user_id)}
                            >
                              {getInitial(member.user_id)}
                            </div>
                          ))}
                          {overflow > 0 && (
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-300 text-[10px] font-bold text-stone-600 ring-2 ring-white dark:bg-stone-600 dark:text-stone-300 dark:ring-stone-950">
                              +{overflow}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <span className="text-lg text-stone-300 dark:text-stone-600">›</span>
                </button>
              )
            })}

            <button
              onClick={handleNewGroup}
              className="w-full flex items-center gap-4 rounded-2xl p-3 text-left transition-colors hover:bg-stone-50 dark:hover:bg-stone-900"
            >
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-stone-100 dark:bg-stone-800">
                <Plus size={28} className="text-stone-400 dark:text-stone-500" />
              </div>
              <p className="font-medium text-stone-400 dark:text-stone-500">새로운 그룹 만들기</p>
            </button>
          </div>
        </div>
      )}

      {view === 'detail' && selectedGroup && (
        <ReminderGroupDetailScreen
          group={selectedGroup}
          memberIds={memberIds}
          memberLoadError={memberLoadError}
          familyMembers={familyMembers}
          currentUserId={currentUserId}
          onBack={handleBack}
          onSave={handleSave}
          onDelete={onDelete}
        />
      )}

      {view === 'new' && (
        <ReminderGroupDetailScreen
          group={null}
          memberIds={[]}
          memberLoadError={false}
          familyMembers={familyMembers}
          currentUserId={currentUserId}
          onBack={handleBack}
          onCreate={onCreate}
        />
      )}
    </div>
  )
}

interface DetailProps {
  group: ReminderGroup | null
  memberIds: string[] | null
  memberLoadError: boolean
  familyMembers: FamilyMember[]
  currentUserId: string
  onBack: () => void
  onCreate?: (name: string, color: string, memberIds: string[]) => Promise<void>
  onSave?: (
    reminderGroupId: string,
    name: string,
    color: string,
    memberIds: string[] | null
  ) => Promise<SaveResult>
  onDelete?: (reminderGroupId: string) => Promise<void>
}

function ReminderGroupDetailScreen({
  group,
  memberIds,
  memberLoadError,
  familyMembers,
  currentUserId,
  onBack,
  onCreate,
  onSave,
  onDelete,
}: DetailProps) {
  const [name, setName] = useState(group?.name ?? '')
  const [color, setColor] = useState(group?.color ?? REMINDER_GROUP_COLORS[1])
  const selectableMembers = useMemo(
    () => familyMembers.filter((member) => member.user_id !== currentUserId),
    [familyMembers, currentUserId]
  )
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    if (group) return new Set()
    return new Set(selectableMembers.map((member) => member.user_id))
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const touchedMemberSelectionRef = useRef(false)

  useEffect(() => {
    if (!group || memberIds === null) return
    setSelectedIds(new Set(memberIds.filter((id) => id !== currentUserId)))
  }, [group, memberIds, currentUserId])

  useEffect(() => {
    if (group || touchedMemberSelectionRef.current) return
    setSelectedIds(new Set(selectableMembers.map((member) => member.user_id)))
  }, [group, selectableMembers])

  const membersStillLoading = memberIds === null && !memberLoadError
  const isSaveDisabled = membersStillLoading || saving || !name.trim()

  const toggleMember = (userId: string) => {
    touchedMemberSelectionRef.current = true
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const handleSave = async () => {
    if (isSaveDisabled) return

    setSaving(true)
    setSaveError(null)
    try {
      if (group) {
        const memberIdsToSave = memberLoadError || memberIds === null
          ? null
          : Array.from(selectedIds)
        await onSave?.(group.id, name.trim(), color, memberIdsToSave)
      } else {
        await onCreate?.(name.trim(), color, Array.from(selectedIds))
      }
      onBack()
    } catch (e) {
      console.error('[ReminderGroupDetailScreen] save failed:', e)
      setSaveError('저장에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!group || !onDelete) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }

    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete(group.id)
      onBack()
    } catch (e) {
      console.error('[ReminderGroupDetailScreen] delete failed:', e)
      setDeleteError('그룹에 포함된 리마인더가 있으면 삭제할 수 없어요.')
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-stone-50 dark:bg-stone-950">
      <div className="flex shrink-0 items-center gap-1 bg-stone-50 px-4 pt-12 pb-4 dark:bg-stone-950">
        <button
          onClick={onBack}
          aria-label="뒤로"
          className="-ml-2.5 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-stone-500 transition-colors hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="truncate text-xl font-bold text-stone-800 dark:text-stone-100">
          {group ? group.name : '새 그룹'}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-safe space-y-4">
        <div className="rounded-2xl border border-stone-100 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500">
            기본 정보
          </p>

          <div className="mb-4">
            <label className="mb-1.5 block text-xs text-stone-500 dark:text-stone-400">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="그룹 이름"
              maxLength={30}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-accent-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs text-stone-500 dark:text-stone-400">색상</label>
            <div className="flex flex-wrap gap-1">
              {REMINDER_GROUP_COLORS.map((nextColor) => (
                <button
                  key={nextColor}
                  onClick={() => setColor(nextColor)}
                  aria-pressed={color === nextColor}
                  aria-label={REMINDER_GROUP_COLOR_NAMES[nextColor] ?? nextColor}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-transform"
                >
                  <span
                    className="block h-8 w-8 rounded-full"
                    style={{
                      backgroundColor: toDisplayColor(nextColor),
                      transform: color === nextColor ? 'scale(1.25)' : 'scale(1)',
                      outline: color === nextColor ? `2px solid ${toDisplayColor(nextColor)}` : 'none',
                      outlineOffset: '2px',
                      transition: 'transform 150ms ease-out',
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>

        {selectableMembers.length > 0 && (
          <div className="rounded-2xl border border-stone-100 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500">
              멤버
            </p>

            {membersStillLoading && (
              <div className="flex items-center gap-2 py-2">
                <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent-300 border-t-accent-500" />
                <p className="text-sm text-stone-400 dark:text-stone-500">멤버 정보를 불러오는 중...</p>
              </div>
            )}

            {memberLoadError && (
              <p className="text-sm text-stone-400 dark:text-stone-500">
                멤버 정보를 불러오지 못했어요. 이번 저장에는 멤버 변경이 반영되지 않습니다.
              </p>
            )}

            {!membersStillLoading && !memberLoadError && (
              <div className="space-y-2">
                {selectableMembers.map((member) => {
                  const selected = selectedIds.has(member.user_id)
                  return (
                    <button
                      key={member.user_id}
                      onClick={() => toggleMember(member.user_id)}
                      role="checkbox"
                      aria-checked={selected}
                      className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                        selected
                          ? 'border-accent-300 bg-accent-50 dark:border-accent-700 dark:bg-accent-950/30'
                          : 'border-stone-200 bg-stone-50 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:hover:bg-stone-700'
                      }`}
                    >
                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                          selected
                            ? 'border-accent-400 bg-accent-400'
                            : 'border-stone-300 dark:border-stone-600'
                        }`}
                      >
                        {selected && <Check size={12} className="text-white" />}
                      </div>
                      <span className="text-sm font-medium text-stone-800 dark:text-stone-100">
                        {member.display_name}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <div>
          {saveError && <p className="mb-2 text-center text-xs text-red-400">{saveError}</p>}
          <button
            onClick={() => void handleSave()}
            disabled={isSaveDisabled}
            className="w-full rounded-2xl bg-accent-400 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-500 disabled:opacity-40"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>

        {group && onDelete && (
          <div className="rounded-2xl border border-red-100 p-4 dark:border-red-900/40">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-red-400 dark:text-red-500">
              위험 구역
            </p>
            {deleteError && <p className="mb-2 text-xs text-red-400">{deleteError}</p>}
            {confirmDelete ? (
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="flex-1 rounded-xl bg-stone-100 py-2.5 text-sm font-semibold text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                >
                  취소
                </button>
                <button
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                >
                  {deleting ? '삭제 중...' : '삭제 확인'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => void handleDelete()}
                className="w-full rounded-xl border border-red-200 py-2.5 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30"
              >
                그룹 삭제
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
