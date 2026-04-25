'use client'

import { useState, useRef, useEffect, type MouseEvent } from 'react'
import { X, Bell, RefreshCw, Check, Tag, CalendarDays, Clock3, ChevronRight, AlignLeft } from 'lucide-react'
import { REMINDER_OPTIONS, LABEL_COLORS, LABEL_COLOR_NAMES, type Calendar, type CalendarEvent } from '@/lib/calendar'
import { toDisplayColor } from '@/lib/label-colors'
import { TimeWheelPicker } from './TimeWheelPicker'
import { RecurrencePickerSheet } from './RecurrencePickerSheet'
import { RecurrenceCustomModal } from './RecurrenceCustomModal'
import { buildRecurrenceLabel, type RecurrenceRule, type RecurrenceScope } from '@/types/recurrence'

const DOW_KR = ['일', '월', '화', '수', '목', '금', '토']

function formatDateWithDOW(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW_KR[d.getDay()]})`
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
  recurrenceScope?: RecurrenceScope
  defaultLabelColor?: string | null
  calendars: Calendar[]
  onClose: () => void
  onSave: (params: {
    calendarId: string | null
    title: string
    description: string | null
    startAt: string
    endAt: string | null
    localStartDate: string
    localEndDate: string
    isAllDay: boolean
    reminderMinutes: number[]
    recurrence: RecurrenceRule | null
    labelColor: string | null
  }) => Promise<void>
}

export function EventFormModal({
  initial,
  initialDate,
  initialReminderMinutes = [],
  recurrenceScope,
  defaultLabelColor,
  calendars,
  onClose,
  onSave,
}: Props) {
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
  const [labelColor, setLabelColor] = useState<string | null>(
    initial ? initial.label_color : (defaultLabelColor ?? null)
  )
  const [labelPickerOpen, setLabelPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Recurrence state (only for new events — editing uses scope sheet in parent)
  const isNewEvent = !initial
  const [recurrence, setRecurrence] = useState<RecurrenceRule | null>(null)
  const [customRule, setCustomRule] = useState<RecurrenceRule | null>(null)
  const [recurrenceModal, setRecurrenceModal] = useState<'picker' | 'custom' | null>(null)
  const isScopedRecurringEdit = Boolean(initial?.series_id && recurrenceScope && recurrenceScope !== 'single')
  const canEditOccurrenceDate = !isScopedRecurringEdit

  const titleInputRef = useRef<HTMLInputElement>(null)
  const startDateInputRef = useRef<HTMLInputElement>(null)
  const endDateInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      titleInputRef.current?.focus({ preventScroll: true })
    }, 300)
    return () => clearTimeout(timer)
  }, [])

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

  const openDatePicker = (input: HTMLInputElement) => {
    input.focus({ preventScroll: true })
    input.showPicker()
  }

  const handleDateButtonClick = (event: MouseEvent<HTMLLabelElement>, input: HTMLInputElement | null) => {
    if (!input || input.disabled || typeof input.showPicker !== 'function') return
    event.preventDefault()
    openDatePicker(input)
  }

  const keepEndAtOrAfterStart = (
    nextStartDate: string,
    nextStartTime: string,
    nextEndDate = endDate,
    nextEndTime = endTime,
    nextIsAllDay = isAllDay
  ) => {
    const start = nextIsAllDay
      ? new Date(nextStartDate + 'T00:00:00')
      : new Date(`${nextStartDate}T${nextStartTime}`)
    const end = nextIsAllDay
      ? new Date(nextEndDate + 'T00:00:00')
      : new Date(`${nextEndDate}T${nextEndTime}`)

    if (end < start) {
      setEndDate(nextStartDate)
      if (!nextIsAllDay) setEndTime(nextStartTime)
      triggerShake()
      return false
    }

    return true
  }

  const handleStartDateChange = (value: string) => {
    setStartDate(value)
    keepEndAtOrAfterStart(value, startTime)
  }

  const handleEndDateChange = (value: string) => {
    if (keepEndAtOrAfterStart(startDate, startTime, value)) {
      setEndDate(value)
    }
  }

  const handleStartTimeChange = (h: number, m: number) => {
    const newStartTime = buildTime(h, m)
    setStartTime(newStartTime)
    keepEndAtOrAfterStart(startDate, newStartTime)
  }

  const handleEndTimeChange = (h: number, m: number) => {
    const newEndTime = buildTime(h, m)
    if (keepEndAtOrAfterStart(startDate, startTime, endDate, newEndTime, false)) {
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
    setSaveError(null)
    try {
      await onSave({
        calendarId,
        title: title.trim(),
        description: description.trim() || null,
        startAt,
        endAt,
        localStartDate: startDate,
        localEndDate: endDate,
        isAllDay,
        reminderMinutes: Array.from(reminderMinutes),
        recurrence: isNewEvent ? recurrence : null,
        labelColor,
      })
      onClose()
    } catch (e) {
      console.error('[EventFormModal] save failed:', e)
      setSaveError('저장에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  const timeBtnCls = (active: boolean) =>
    `min-w-[4.25rem] rounded-xl px-3 py-1.5 text-sm font-semibold text-center transition-colors shrink-0 sm:min-w-20 sm:rounded-2xl sm:px-4 sm:py-2.5 ${
      active
        ? 'bg-accent-400 text-white'
        : 'bg-stone-100 dark:bg-stone-800/95 text-stone-700 dark:text-stone-100'
    }`

  const dateBtnCls = 'relative overflow-hidden min-w-0 rounded-xl bg-stone-100 px-3 py-1.5 text-center text-sm font-semibold text-stone-700 dark:bg-stone-800/95 dark:text-stone-100 sm:rounded-2xl sm:px-4 sm:py-2.5'
  const reminderLabel = reminderMinutes.size > 0
    ? REMINDER_OPTIONS
      .filter((opt) => reminderMinutes.has(opt.minutes))
      .map((opt) => opt.label)
      .join(', ')
    : '없음'

  return (
    <div className={`fixed inset-0 z-[70] bg-stone-950/40 dark:bg-black flex items-end sm:items-center justify-center sm:p-6 ${isClosing ? 'modal-slide-down' : 'modal-slide-up'}`}>
      <div
        className="flex h-dvh w-full flex-col overflow-hidden rounded-t-[1.75rem] bg-stone-50 shadow-2xl dark:bg-[#090909] sm:h-[min(860px,calc(100dvh-48px))] sm:w-[min(920px,calc(100vw-48px))] sm:max-w-none sm:rounded-[2rem]"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
      <div className="mx-auto mt-2 h-1 w-12 shrink-0 rounded-full bg-stone-300/60 dark:bg-stone-700/70" />

      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 pb-4 pt-3 shrink-0 sm:px-5 sm:pb-4 sm:pt-5">
        <button
          onClick={handleClose}
          className="flex h-10 w-10 items-center justify-center rounded-full text-accent-500 transition-colors hover:bg-stone-100 dark:text-accent-300 dark:hover:bg-stone-900 sm:h-11 sm:w-11"
          aria-label="닫기"
        >
          <X size={26} strokeWidth={1.8} />
        </button>
        <button
          onClick={handleSave}
          disabled={!title.trim() || !startDate || saving}
          className="rounded-full border border-stone-200 bg-stone-50 px-7 py-2 text-sm font-bold text-stone-800 transition-colors hover:bg-stone-100 disabled:opacity-40 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100 dark:hover:bg-stone-900 sm:px-8 sm:py-2.5"
        >
          저장
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-8 sm:pb-10">
        {/* 제목 */}
        <div className="px-5 pb-4 sm:px-8 sm:pb-5">
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목"
            className="w-full bg-transparent text-[1.625rem] font-extrabold leading-tight tracking-normal text-stone-900 placeholder:text-stone-400 focus:outline-none dark:text-stone-100 dark:placeholder:text-stone-600 sm:text-[2rem]"
          />
        </div>

        {saveError && (
          <p className="mx-6 mb-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-500 dark:bg-red-950/30 dark:text-red-300">{saveError}</p>
        )}

        <div className="border-y border-stone-200/70 dark:border-stone-900">
          {/* 캘린더 선택 */}
          <div className="grid min-h-14 grid-cols-[3.25rem_1fr] items-center border-b border-stone-200/70 dark:border-stone-900 sm:min-h-[4.75rem] sm:grid-cols-[4.5rem_1fr]">
            <div className="flex justify-center text-accent-500 dark:text-accent-300">
              <CalendarDays size={22} strokeWidth={1.8} />
            </div>
            <div className="min-w-0 pr-4 sm:pr-5">
              {calendars.length > 0 ? (
                <div className="flex flex-wrap gap-2 py-2 sm:py-3">
                  {calendars.map((cal) => {
                    const active = calendarId === cal.id
                    return (
                      <button
                        key={cal.id}
                        onClick={() => setCalendarId(cal.id)}
                        className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold transition-all sm:rounded-2xl sm:px-3.5 sm:py-2 sm:text-base"
                        style={
                          active
                            ? { backgroundColor: cal.color, color: '#fff' }
                            : { backgroundColor: 'transparent', color: cal.color }
                        }
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: active ? '#fff' : cal.color }}
                        />
                        {cal.name}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <span className="text-base font-semibold text-stone-500 dark:text-stone-400 sm:text-lg">캘린더 없음</span>
              )}
            </div>
          </div>

          {/* 종일 토글 */}
          <div className="grid min-h-14 grid-cols-[3.25rem_1fr_auto] items-center border-b border-stone-200/70 dark:border-stone-900 sm:min-h-[4.75rem] sm:grid-cols-[4.5rem_1fr_auto]">
            <div className="flex justify-center text-accent-500 dark:text-accent-300">
              <Clock3 size={22} strokeWidth={1.8} />
            </div>
            <span className="text-base font-semibold text-stone-900 dark:text-stone-100 sm:text-xl">종일</span>
            <button
              onClick={() => toggleAllDay(!isAllDay)}
              className={`relative mr-4 h-7 w-14 rounded-full transition-colors sm:mr-5 sm:h-8 sm:w-[4.25rem] ${isAllDay ? 'bg-accent-400' : 'bg-stone-300 dark:bg-stone-700'}`}
              aria-label="종일"
            >
              <span
                className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform sm:h-6 sm:w-6 ${isAllDay ? 'translate-x-7 sm:translate-x-9' : 'translate-x-0'}`}
              />
            </button>
          </div>

          {/* 날짜/시간 */}
          <div className="grid grid-cols-[3.25rem_1fr] border-b border-stone-200/70 dark:border-stone-900 sm:grid-cols-[4.5rem_1fr]">
            <div />
            <div className="py-3 pr-4 sm:py-5 sm:pr-5">
              {isScopedRecurringEdit && (
                <p className="mb-3 rounded-2xl bg-stone-100 px-4 py-3 text-sm text-stone-500 dark:bg-stone-900 dark:text-stone-400">
                  이 범위에서는 날짜 이동 없이 시간과 내용만 변경할 수 있어요.
                </p>
              )}

              <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-y-2.5 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-y-5">
                <span className="text-base font-medium text-stone-800 dark:text-stone-100 sm:text-lg">시작</span>
                <div className={`flex justify-end gap-2 ${isAllDay ? '' : 'min-w-0'}`}>
                  <label
                    data-testid="start-date-button"
                    onClick={(event) => handleDateButtonClick(event, startDateInputRef.current)}
                    className={`${isAllDay ? 'w-full max-w-[18rem]' : 'flex-1'} ${dateBtnCls}`}
                  >
                    <span className="relative z-10 pointer-events-none whitespace-nowrap">{formatDateWithDOW(startDate)}</span>
                    <input
                      ref={startDateInputRef}
                      type="date"
                      value={startDate}
                      disabled={!canEditOccurrenceDate}
                      aria-label={`시작 날짜 ${formatDateWithDOW(startDate)}`}
                      onChange={(e) => handleStartDateChange(e.target.value)}
                      className={`absolute inset-0 h-full w-full opacity-0 ${canEditOccurrenceDate ? 'cursor-pointer' : 'cursor-default'}`}
                    />
                  </label>
                  {!isAllDay && (
                    <button
                      onClick={() => toggleTimePicker('start')}
                      className={timeBtnCls(activeTimePicker === 'start')}
                    >
                      {startTime}
                    </button>
                  )}
                </div>

                {!isAllDay && activeTimePicker === 'start' && (
                  <div className="col-span-2">
                    <TimeWheelPicker
                      hours={parseInt(startTime.split(':')[0])}
                      minutes={parseInt(startTime.split(':')[1])}
                      onChange={handleStartTimeChange}
                    />
                  </div>
                )}

                <span className="text-base font-medium text-stone-800 dark:text-stone-100 sm:text-lg">종료</span>
                <div className={`flex justify-end gap-2 ${endShake ? 'shake' : ''}`}>
                  <label
                    data-testid="end-date-button"
                    onClick={(event) => handleDateButtonClick(event, endDateInputRef.current)}
                    className={`${isAllDay ? 'w-full max-w-[18rem]' : 'flex-1'} ${dateBtnCls}`}
                  >
                    <span className="relative z-10 pointer-events-none whitespace-nowrap">{formatDateWithDOW(endDate)}</span>
                    <input
                      ref={endDateInputRef}
                      type="date"
                      value={endDate}
                      disabled={!canEditOccurrenceDate}
                      aria-label={`종료 날짜 ${formatDateWithDOW(endDate)}`}
                      onChange={(e) => handleEndDateChange(e.target.value)}
                      className={`absolute inset-0 h-full w-full opacity-0 ${canEditOccurrenceDate ? 'cursor-pointer' : 'cursor-default'}`}
                    />
                  </label>
                  {!isAllDay && (
                    <button
                      onClick={() => toggleTimePicker('end')}
                      className={timeBtnCls(activeTimePicker === 'end')}
                    >
                      {endTime}
                    </button>
                  )}
                </div>

                {!isAllDay && activeTimePicker === 'end' && (
                  <div className="col-span-2">
                    <TimeWheelPicker
                      hours={parseInt(endTime.split(':')[0])}
                      minutes={parseInt(endTime.split(':')[1])}
                      onChange={handleEndTimeChange}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 라벨 색상 */}
          <button
            type="button"
            onClick={() => setLabelPickerOpen((v) => !v)}
            className="grid min-h-14 w-full grid-cols-[3.25rem_1fr_auto] items-center border-b border-stone-200/70 text-left dark:border-stone-900 sm:min-h-[4.75rem] sm:grid-cols-[4.5rem_1fr_auto]"
          >
            <div className="flex justify-center text-accent-500 dark:text-accent-300">
              <Tag size={22} strokeWidth={1.8} />
            </div>
            <span className="text-base font-semibold text-stone-900 dark:text-stone-100 sm:text-xl">라벨</span>
            <div className="mr-4 flex items-center gap-2 text-right sm:mr-5">
              {labelColor ? (
                <>
                  <span
                    className="h-5 w-5 rounded-full shrink-0 sm:h-6 sm:w-6"
                    style={{ backgroundColor: toDisplayColor(labelColor) }}
                  />
                  <span className="text-sm font-semibold text-stone-500 dark:text-stone-400">
                    {LABEL_COLOR_NAMES[labelColor] ?? labelColor}
                  </span>
                </>
              ) : (
                <span className="text-sm font-semibold text-stone-400">
                  캘린더 색상 사용
                </span>
              )}
            </div>
          </button>

          {labelPickerOpen && (
            <div className="border-b border-stone-200/70 px-6 py-4 dark:border-stone-900">
              <div className="flex flex-wrap gap-3 pl-[3.25rem]">
                <button
                  type="button"
                  onClick={() => { setLabelColor(null); setLabelPickerOpen(false) }}
                  className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all ${
                    labelColor === null
                      ? 'border-stone-400 dark:border-stone-300'
                      : 'border-stone-200 dark:border-stone-700'
                  } bg-gradient-to-br from-stone-200 to-stone-400 dark:from-stone-600 dark:to-stone-800`}
                  title="캘린더 색상 사용"
                >
                  {labelColor === null && <Check size={12} className="text-white" strokeWidth={3} />}
                </button>

                {LABEL_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => { setLabelColor(color); setLabelPickerOpen(false) }}
                    className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all ${
                      labelColor === color
                        ? 'border-stone-800 dark:border-white scale-110'
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: toDisplayColor(color) }}
                    title={LABEL_COLOR_NAMES[color]}
                  >
                    {labelColor === color && <Check size={12} className="text-white" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 알림 */}
          <div className="grid grid-cols-[3.25rem_1fr] border-b border-stone-200/70 dark:border-stone-900 sm:grid-cols-[4.5rem_1fr]">
            <div className="flex justify-center pt-4 text-accent-500 dark:text-accent-300 sm:pt-6">
              <Bell size={22} strokeWidth={1.8} />
            </div>
            <div className="py-3 pr-4 sm:py-5 sm:pr-5">
              <div className="mb-2 flex items-center justify-between gap-3 sm:mb-3">
                <span className="text-base font-semibold text-stone-900 dark:text-stone-100 sm:text-xl">알람</span>
                <span className="max-w-[55%] truncate text-sm font-semibold text-stone-400">{reminderLabel}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {REMINDER_OPTIONS.map((opt) => {
                  const active = reminderMinutes.has(opt.minutes)
                  return (
                    <button
                      key={opt.minutes}
                      onClick={() => toggleReminder(opt.minutes)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors sm:rounded-full sm:px-4 sm:py-2 sm:text-sm ${
                        active
                          ? 'bg-accent-400 text-white'
                          : 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 메모 */}
          <div className="grid grid-cols-[3.25rem_1fr] border-b border-stone-200/70 dark:border-stone-900 sm:grid-cols-[4.5rem_1fr]">
            <div className="flex justify-center pt-4 text-accent-500 dark:text-accent-300 sm:pt-6">
              <AlignLeft size={22} strokeWidth={1.8} />
            </div>
            <div className="py-3 pr-4 sm:py-5 sm:pr-5">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="메모 (선택)"
                rows={2}
                className="w-full resize-none rounded-xl bg-stone-100 px-3 py-2.5 text-base text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-accent-400 dark:bg-stone-900 dark:text-stone-100 sm:rounded-2xl sm:px-4 sm:py-3"
              />
            </div>
          </div>

          {/* 반복 */}
          {isNewEvent && (
            <button
              type="button"
              onClick={() => setRecurrenceModal('picker')}
              className="grid min-h-14 w-full grid-cols-[3.25rem_1fr_auto] items-center text-left sm:min-h-[4.75rem] sm:grid-cols-[4.5rem_1fr_auto]"
            >
              <div className="flex justify-center text-accent-500 dark:text-accent-300">
                <RefreshCw size={22} strokeWidth={1.8} />
              </div>
              <span className="text-base font-semibold text-stone-900 dark:text-stone-100 sm:text-xl">반복</span>
              <div className="mr-4 flex items-center gap-1 text-sm font-semibold text-stone-400 sm:mr-5">
                <span>{recurrence ? buildRecurrenceLabel(recurrence) : '안 함'}</span>
                <ChevronRight size={18} />
              </div>
            </button>
          )}
        </div>
      </div>

      {recurrenceModal === 'picker' && (
        <RecurrencePickerSheet
          value={recurrence}
          customRule={customRule}
          onSelect={(rule) => { setRecurrence(rule); setRecurrenceModal(null) }}
          onCustomize={() => setRecurrenceModal('custom')}
          onClose={() => setRecurrenceModal(null)}
        />
      )}

      {recurrenceModal === 'custom' && (
        <RecurrenceCustomModal
          initial={customRule ?? recurrence}
          startDate={startDate}
          onSave={(rule) => { setCustomRule(rule); setRecurrence(rule); setRecurrenceModal(null) }}
          onBack={() => setRecurrenceModal('picker')}
        />
      )}
      </div>
    </div>
  )
}
