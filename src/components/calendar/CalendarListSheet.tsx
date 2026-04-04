'use client'

import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { getCalendarMembersForCalendars, type Calendar, type CalendarMember, type FamilyMember } from '@/lib/calendar'

interface Props {
  calendars: Calendar[]
  familyMembers: FamilyMember[]
  onClose: () => void
  onAdd: () => void
  onEdit: (calendar: Calendar) => void
}

type MemberMap = Record<string, CalendarMember[]>

export function CalendarListSheet({ calendars, familyMembers, onClose, onAdd, onEdit }: Props) {
  const [memberMap, setMemberMap] = useState<MemberMap>({})

  useEffect(() => {
    if (calendars.length === 0) return
    getCalendarMembersForCalendars(calendars.map((c) => c.id))
      .then((members) => {
        const map: MemberMap = {}
        for (const m of members) {
          if (!map[m.calendar_id]) map[m.calendar_id] = []
          map[m.calendar_id].push(m)
        }
        setMemberMap(map)
      })
      .catch((e) => console.error('[CalendarListSheet] load members failed:', e))
  }, [calendars])

  const getMemberName = (userId: string) =>
    familyMembers.find((m) => m.user_id === userId)?.display_name ?? '?'

  const getInitial = (userId: string) => getMemberName(userId).charAt(0).toUpperCase()

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-white dark:bg-stone-950">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 pt-12 pb-4 shrink-0">
        <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100">캘린더 리스트</h1>
        <button onClick={onClose} className="p-2 text-stone-400 hover:text-stone-600">
          <X size={22} />
        </button>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto px-4 pb-safe space-y-2">
        <p className="text-xs text-stone-400 dark:text-stone-500 mb-3">
          캘린더 ({calendars.length})
        </p>

        {calendars.map((cal) => {
          const members = memberMap[cal.id] ?? []
          const visibleMembers = members.slice(0, 3)
          const overflow = members.length - visibleMembers.length

          return (
            <button
              key={cal.id}
              onClick={() => onEdit(cal)}
              className="w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-stone-50 dark:hover:bg-stone-900 transition-colors text-left"
            >
              {/* 캘린더 색상 썸네일 */}
              <div
                className="w-16 h-16 rounded-2xl shrink-0"
                style={{ backgroundColor: cal.color }}
              />

              {/* 이름 + 멤버 아바타 */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-stone-800 dark:text-stone-100 truncate">
                  {cal.name}
                </p>
                {members.length > 0 && (
                  <div className="flex items-center gap-1 mt-1.5">
                    <div className="flex -space-x-1.5">
                      {visibleMembers.map((m) => (
                        <div
                          key={m.user_id}
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-white dark:ring-stone-950"
                          style={{ backgroundColor: cal.color }}
                          title={getMemberName(m.user_id)}
                        >
                          {getInitial(m.user_id)}
                        </div>
                      ))}
                      {overflow > 0 && (
                        <div className="w-6 h-6 rounded-full bg-stone-300 dark:bg-stone-600 flex items-center justify-center text-[10px] font-bold text-stone-600 dark:text-stone-300 ring-2 ring-white dark:ring-stone-950">
                          +{overflow}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <span className="text-stone-300 dark:text-stone-600 text-lg">›</span>
            </button>
          )
        })}

        {/* 새 캘린더 만들기 */}
        <button
          onClick={onAdd}
          className="w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-stone-50 dark:hover:bg-stone-900 transition-colors text-left"
        >
          <div className="w-16 h-16 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center shrink-0">
            <Plus size={28} className="text-stone-400 dark:text-stone-500" />
          </div>
          <p className="text-stone-400 dark:text-stone-500 font-medium">새로운 캘린더 만들기</p>
        </button>
      </div>
    </div>
  )
}
