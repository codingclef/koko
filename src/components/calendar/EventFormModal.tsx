'use client'

import { useState } from 'react'
import { X, Bell } from 'lucide-react'
import { REMINDER_OPTIONS, type Calendar, type CalendarEvent } from '@/lib/calendar'

function toLocalInputValue(isoString: string, isAllDay: boolean): string {
  const d = new Date(isoString)
  if (isAllDay) {
    return d.toLocaleDateString('sv-SE') // YYYY-MM-DD
  }
  // datetime-local format: YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toISOFromInput(value: string, isAllDay: boolean): string {
  if (isAllDay) {
    return new Date(value + 'T00:00:00').toISOString()
  }
  return new Date(value).toISOString()
}

interface Props {
  initial?: CalendarEvent
  initialDate?: Date
  initialReminderMinutes?: number[]
  calendars: Calendar[]
  onClose: () => void
  onSave: (params: {
    calendarId: string | null
    title: string
    description: string | null
    startAt: string
    endAt: string | null
    isAllDay: boolean
    reminderMinutes: number[]
  }) => Promise<void>
}

export function EventFormModal({ initial, initialDate, initialReminderMinutes = [], calendars, onClose, onSave }: Props) {
  const defaultDate = initialDate ?? new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const defaultDateStr = `${defaultDate.getFullYear()}-${pad(defaultDate.getMonth() + 1)}-${pad(defaultDate.getDate())}`

  const [calendarId, setCalendarId] = useState<string | null>(
    initial?.calendar_id ?? (calendars[0]?.id ?? null)
  )
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [isAllDay, setIsAllDay] = useState(initial?.is_all_day ?? true)
  const [startValue, setStartValue] = useState(
    initial ? toLocalInputValue(initial.start_at, initial.is_all_day) : (isAllDay ? defaultDateStr : `${defaultDateStr}T09:00`)
  )
  const [endValue, setEndValue] = useState(
    initial?.end_at ? toLocalInputValue(initial.end_at, initial.is_all_day) : ''
  )
  const [reminderMinutes, setReminderMinutes] = useState<Set<number>>(
    new Set(initialReminderMinutes)
  )
  const [saving, setSaving] = useState(false)

  const toggleAllDay = (val: boolean) => {
    setIsAllDay(val)
    if (val) {
      setStartValue(defaultDateStr)
      setEndValue('')
    } else {
      setStartValue(`${defaultDateStr}T09:00`)
      setEndValue(`${defaultDateStr}T10:00`)
    }
  }

  const toggleReminder = (minutes: number) => {
    setReminderMinutes((prev) => {
      const next = new Set(prev)
      if (next.has(minutes)) next.delete(minutes)
      else next.add(minutes)
      return next
    })
  }

  const handleSave = async () => {
    if (!title.trim() || !startValue) return
    setSaving(true)
    try {
      await onSave({
        calendarId,
        title: title.trim(),
        description: description.trim() || null,
        startAt: toISOFromInput(startValue, isAllDay),
        endAt: endValue ? toISOFromInput(endValue, isAllDay) : null,
        isAllDay,
        reminderMinutes: Array.from(reminderMinutes),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white dark:bg-stone-900 rounded-t-2xl pb-safe max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 dark:border-stone-800 shrink-0">
          <h2 className="text-base font-bold text-stone-800 dark:text-stone-100">
            {initial ? '일정 편집' : '새 일정'}
          </h2>
          <button onClick={onClose} className="p-1 text-stone-400">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* 캘린더 선택 */}
          {calendars.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {calendars.map((cal) => (
                <button
                  key={cal.id}
                  onClick={() => setCalendarId(cal.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
                  style={
                    calendarId === cal.id
                      ? { backgroundColor: cal.color, borderColor: cal.color, color: '#fff' }
                      : { borderColor: cal.color, color: cal.color }
                  }
                >
                  {cal.name}
                </button>
              ))}
            </div>
          )}

          {/* 제목 */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목"
            className="w-full px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-400 text-base"
            autoFocus
          />

          {/* 종일 토글 */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-stone-600 dark:text-stone-300">종일</span>
            <button
              onClick={() => toggleAllDay(!isAllDay)}
              className={`relative w-11 h-6 rounded-full overflow-hidden transition-colors ${isAllDay ? 'bg-orange-400' : 'bg-stone-200 dark:bg-stone-700'}`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isAllDay ? 'translate-x-6' : 'translate-x-0.5'}`}
              />
            </button>
          </div>

          {/* 날짜/시간 */}
          <div className="space-y-2">
            <label className="text-xs text-stone-500">시작</label>
            <input
              type={isAllDay ? 'date' : 'datetime-local'}
              value={startValue}
              onChange={(e) => setStartValue(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-orange-400 text-base"
            />
            <label className="text-xs text-stone-500">종료 (선택)</label>
            <input
              type={isAllDay ? 'date' : 'datetime-local'}
              value={endValue}
              onChange={(e) => setEndValue(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-orange-400 text-base"
            />
          </div>

          {/* 메모 */}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="메모 (선택)"
            rows={2}
            className="w-full px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-400 text-base resize-none"
          />

          {/* 알림 */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Bell size={14} className="text-stone-400" />
              <span className="text-xs text-stone-500">알림</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {REMINDER_OPTIONS.map((opt) => {
                const active = reminderMinutes.has(opt.minutes)
                return (
                  <button
                    key={opt.minutes}
                    onClick={() => toggleReminder(opt.minutes)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-orange-400 border-orange-400 text-white'
                        : 'border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* 저장 버튼 */}
        <div className="px-5 py-3 border-t border-stone-100 dark:border-stone-800 shrink-0">
          <button
            onClick={handleSave}
            disabled={!title.trim() || !startValue || saving}
            className="w-full py-3 rounded-xl bg-orange-400 hover:bg-orange-500 disabled:opacity-40 text-white font-semibold text-sm transition-colors"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  )
}
