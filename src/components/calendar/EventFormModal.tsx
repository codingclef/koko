'use client'

import { useState } from 'react'
import { X, Bell } from 'lucide-react'
import { REMINDER_OPTIONS, type Calendar, type CalendarEvent } from '@/lib/calendar'
import { TimeWheelPicker } from './TimeWheelPicker'

const DOW_KR = ['일', '월', '화', '수', '목', '금', '토']

function formatDateWithDOW(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}(${DOW_KR[d.getDay()]})`
}

function buildTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function parseDate(isoString: string): string {
  const d = new Date(isoString)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parseTime(isoString: string): string {
  const d = new Date(isoString)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function buildISO(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString()
}

function buildAllDayISO(date: string): string {
  return new Date(date + 'T00:00:00').toISOString()
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

  const [startDate, setStartDate] = useState<string>(() => {
    if (initial) return parseDate(initial.start_at)
    return defaultDateStr
  })
  const [startTime, setStartTime] = useState<string>(() => {
    if (initial && !initial.is_all_day) return parseTime(initial.start_at)
    return '09:00'
  })
  const [endDate, setEndDate] = useState<string>(() => {
    if (initial?.end_at) return parseDate(initial.end_at)
    return defaultDateStr
  })
  const [endTime, setEndTime] = useState<string>(() => {
    if (initial?.end_at && !initial.is_all_day) return parseTime(initial.end_at)
    return '10:00'
  })

  const [endShake, setEndShake] = useState(false)
  const [activeTimePicker, setActiveTimePicker] = useState<'start' | 'end' | null>(null)
  const [isClosing, setIsClosing] = useState(false)
  const [reminderMinutes, setReminderMinutes] = useState<Set<number>>(
    new Set(initialReminderMinutes)
  )
  const [saving, setSaving] = useState(false)

  const triggerShake = () => {
    setEndShake(false)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setEndShake(true))
    })
    setTimeout(() => setEndShake(false), 400)
  }

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => onClose(), 280)
  }

  const toggleAllDay = (val: boolean) => {
    setIsAllDay(val)
    if (!val) {
      setStartTime('09:00')
      setEndTime('10:00')
    }
    setActiveTimePicker(null)
  }

  const toggleTimePicker = (which: 'start' | 'end') => {
    setActiveTimePicker((prev) => (prev === which ? null : which))
  }

  const handleEndDateChange = (value: string) => {
    const start = isAllDay
      ? new Date(startDate + 'T00:00:00')
      : new Date(`${startDate}T${startTime}`)
    const newEnd = isAllDay
      ? new Date(value + 'T00:00:00')
      : new Date(`${value}T${endTime}`)

    if (newEnd < start) {
      setEndDate(startDate)
      if (!isAllDay) setEndTime(startTime)
      triggerShake()
    } else {
      setEndDate(value)
    }
  }

  const handleStartTimeChange = (h: number, m: number) => {
    setStartTime(buildTime(h, m))
  }

  const handleEndTimeChange = (h: number, m: number) => {
    const newEndTime = buildTime(h, m)
    const start = new Date(`${startDate}T${startTime}`)
    const end = new Date(`${endDate}T${newEndTime}`)

    if (end < start) {
      setEndDate(startDate)
      setEndTime(startTime)
      triggerShake()
    } else {
      setEndTime(newEndTime)
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
    if (!title.trim() || !startDate) return

    const startAt = isAllDay ? buildAllDayISO(startDate) : buildISO(startDate, startTime)
    const endAt = isAllDay ? buildAllDayISO(endDate) : buildISO(endDate, endTime)

    if (new Date(endAt) < new Date(startAt)) return

    setSaving(true)
    try {
      await onSave({
        calendarId,
        title: title.trim(),
        description: description.trim() || null,
        startAt,
        endAt,
        isAllDay,
        reminderMinutes: Array.from(reminderMinutes),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const timeBtnCls = (active: boolean) =>
    `w-24 px-3 py-2.5 rounded-xl text-sm font-semibold text-center transition-colors shrink-0 ${
      active
        ? 'bg-orange-400 text-white'
        : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200'
    }`

  const dateBtnCls = 'relative overflow-hidden px-3 py-2.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-sm font-medium text-stone-700 dark:text-stone-200 text-left'

  return (
    <div className={`fixed inset-0 z-[70] bg-white dark:bg-stone-900 flex flex-col ${isClosing ? 'modal-slide-down' : 'modal-slide-up'}`}>
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 dark:border-stone-800 shrink-0 pt-safe">
        <h2 className="text-base font-bold text-stone-800 dark:text-stone-100">
          {initial ? '일정 편집' : '새 일정'}
        </h2>
        <button onClick={handleClose} className="p-1 text-stone-400">
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
            className={`relative w-11 h-6 rounded-full transition-colors ${isAllDay ? 'bg-orange-400' : 'bg-stone-200 dark:bg-stone-700'}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isAllDay ? 'translate-x-5' : 'translate-x-0'}`}
            />
          </button>
        </div>

        {/* 날짜/시간 */}
        <div className="space-y-3">
          {/* 시작 */}
          <div>
            <label className="text-xs text-stone-500 mb-1.5 block">시작</label>
            <div className="flex gap-2">
              <div className={`${isAllDay ? '' : 'flex-1 '}${dateBtnCls}`}>
                <span className="relative z-10 pointer-events-none">{formatDateWithDOW(startDate)}</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                />
              </div>
              {!isAllDay && (
                <button
                  onClick={() => toggleTimePicker('start')}
                  className={timeBtnCls(activeTimePicker === 'start')}
                >
                  {startTime}
                </button>
              )}
            </div>
          </div>

          {/* 시작 시간 wheel picker */}
          {!isAllDay && activeTimePicker === 'start' && (
            <TimeWheelPicker
              hours={parseInt(startTime.split(':')[0])}
              minutes={parseInt(startTime.split(':')[1])}
              onChange={handleStartTimeChange}
            />
          )}

          {/* 종료 */}
          <div className={endShake ? 'shake' : ''}>
            <label className="text-xs text-stone-500 mb-1.5 block">종료</label>
            <div className="flex gap-2">
              <div className={`${isAllDay ? '' : 'flex-1 '}${dateBtnCls}`}>
                <span className="relative z-10 pointer-events-none">{formatDateWithDOW(endDate)}</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                />
              </div>
              {!isAllDay && (
                <button
                  onClick={() => toggleTimePicker('end')}
                  className={timeBtnCls(activeTimePicker === 'end')}
                >
                  {endTime}
                </button>
              )}
            </div>
          </div>

          {/* 종료 시간 wheel picker */}
          {!isAllDay && activeTimePicker === 'end' && (
            <TimeWheelPicker
              hours={parseInt(endTime.split(':')[0])}
              minutes={parseInt(endTime.split(':')[1])}
              onChange={handleEndTimeChange}
            />
          )}
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
      <div
        className="px-5 pt-3 border-t border-stone-100 dark:border-stone-800 shrink-0"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={handleSave}
          disabled={!title.trim() || !startDate || saving}
          className="w-full py-3 rounded-xl bg-orange-400 hover:bg-orange-500 disabled:opacity-40 text-white font-semibold text-sm transition-colors"
        >
          저장
        </button>
      </div>
    </div>
  )
}
