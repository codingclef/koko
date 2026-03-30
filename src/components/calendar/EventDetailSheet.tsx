'use client'

import { useEffect, useState } from 'react'
import { Bell, Pencil, Trash2, X, Calendar as CalendarIcon, Clock } from 'lucide-react'
import { getReminders, REMINDER_OPTIONS, type Calendar, type CalendarEvent, type EventReminder } from '@/lib/calendar'

function formatDatetime(isoString: string, isAllDay: boolean): string {
  const d = new Date(isoString)
  if (isAllDay) {
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
  }
  return d.toLocaleString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

interface Props {
  event: CalendarEvent
  calendars: Calendar[]
  onClose: () => void
  onEdit: () => void
  onDelete: () => Promise<void>
}

export function EventDetailSheet({ event, calendars, onClose, onEdit, onDelete }: Props) {
  const [reminders, setReminders] = useState<EventReminder[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const cal = event.calendar_id ? calendars.find((c) => c.id === event.calendar_id) : null

  useEffect(() => {
    getReminders(event.id).then(setReminders).catch(() => {})
  }, [event.id])

  const reminderLabel = (minutes: number) =>
    REMINDER_OPTIONS.find((o) => o.minutes === minutes)?.label ?? `${minutes}분 전`

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete()
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={onClose}>
      <div
        className="w-full max-w-lg mx-auto bg-white dark:bg-stone-900 rounded-t-2xl max-h-[70vh] flex flex-col pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-stone-200 dark:bg-stone-700" />
        </div>

        {/* 헤더 */}
        <div className="flex items-start justify-between px-5 py-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {cal && (
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: cal.color }}
              />
            )}
            <h3 className="font-bold text-lg text-stone-800 dark:text-stone-100 truncate">
              {event.title}
            </h3>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button onClick={onEdit} className="p-2 text-stone-400 hover:text-stone-600">
              <Pencil size={16} />
            </button>
            <button onClick={onClose} className="p-2 text-stone-400 hover:text-stone-600">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 내용 */}
        <div className="overflow-y-auto flex-1 px-5 pb-2 space-y-3">
          {/* 날짜/시간 */}
          <div className="flex items-start gap-3">
            <Clock size={16} className="text-stone-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-stone-700 dark:text-stone-200">
                {formatDatetime(event.start_at, event.is_all_day)}
              </p>
              {event.end_at && (
                <p className="text-sm text-stone-500">
                  ~ {formatDatetime(event.end_at, event.is_all_day)}
                </p>
              )}
            </div>
          </div>

          {/* 캘린더 */}
          {cal && (
            <div className="flex items-center gap-3">
              <CalendarIcon size={16} className="text-stone-400 shrink-0" />
              <span className="text-sm text-stone-600 dark:text-stone-300">{cal.name}</span>
            </div>
          )}

          {/* 메모 */}
          {event.description && (
            <div className="text-sm text-stone-600 dark:text-stone-300 bg-stone-50 dark:bg-stone-800 rounded-xl px-3 py-2">
              {event.description}
            </div>
          )}

          {/* 알림 */}
          {reminders.length > 0 && (
            <div className="flex items-start gap-3">
              <Bell size={16} className="text-stone-400 mt-0.5 shrink-0" />
              <div className="flex flex-wrap gap-1.5">
                {reminders.map((r) => (
                  <span
                    key={r.id}
                    className="text-xs bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 px-2 py-1 rounded-full"
                  >
                    {reminderLabel(r.remind_minutes_before)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 삭제 버튼 */}
        <div className="px-5 py-3 border-t border-stone-100 dark:border-stone-800">
          {confirmDelete ? (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 text-sm font-medium"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold"
              >
                삭제 확인
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 dark:border-red-900 text-red-500 text-sm font-medium"
            >
              <Trash2 size={15} />
              일정 삭제
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
