'use client'

import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import type { RecurrenceFreq, RecurrenceRule } from '@/types/recurrence'
import { buildRecurrenceLabel, DOW_KR, getRecurrenceIntervalUnit } from '@/types/recurrence'

interface Props {
  initial: RecurrenceRule | null
  startDate: string   // YYYY-MM-DD — used to default day-of-week / day-of-month
  onSave: (rule: RecurrenceRule) => void
  onBack: () => void
}

const FREQ_OPTIONS: Array<{ label: string; value: RecurrenceFreq }> = [
  { label: '매일',  value: 'daily'   },
  { label: '매주',  value: 'weekly'  },
  { label: '매월',  value: 'monthly' },
  { label: '매년',  value: 'yearly'  },
]

const DOW_FULL = DOW_KR.map((d) => d + '요일')

function defaultDaysOfWeek(startDate: string): number[] {
  const d = new Date(startDate + 'T00:00:00')
  return [d.getDay()]
}

function defaultDayOfMonth(startDate: string): number {
  return new Date(startDate + 'T00:00:00').getDate()
}

function addMonths(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

function addYears(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setFullYear(d.getFullYear() + n)
  return d.toISOString().slice(0, 10)
}

export function RecurrenceCustomModal({ initial, startDate, onSave, onBack }: Props) {
  const [freq, setFreq] = useState<RecurrenceFreq>(initial?.freq ?? 'weekly')
  const [interval, setInterval] = useState(initial?.interval ?? 1)
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    initial?.daysOfWeek ?? defaultDaysOfWeek(startDate)
  )
  const dayOfMonth = initial?.dayOfMonth ?? defaultDayOfMonth(startDate)
  const [hasEndDate, setHasEndDate] = useState(!!initial?.endDate)
  const [endDate, setEndDate] = useState<string>(
    initial?.endDate ?? addMonths(startDate, 3)
  )
  const [showFreqPicker, setShowFreqPicker] = useState(false)

  const currentRule: RecurrenceRule = {
    freq,
    interval,
    ...(freq === 'weekly' ? { daysOfWeek } : {}),
    ...(freq === 'monthly' ? { dayOfMonth } : {}),
    ...(hasEndDate ? { endDate } : {}),
  }

  const toggleDow = (dow: number) => {
    setDaysOfWeek((prev) => {
      if (prev.includes(dow)) {
        // At least one day must remain selected
        if (prev.length === 1) return prev
        return prev.filter((d) => d !== dow)
      }
      return [...prev, dow]
    })
  }

  const handleSave = () => {
    onSave(currentRule)
  }

  const freqLabel = FREQ_OPTIONS.find((f) => f.value === freq)?.label ?? '매주'
  const intervalUnit = getRecurrenceIntervalUnit(freq)

  const handleIntervalChange = (value: string) => {
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed) || parsed < 1) {
      setInterval(1)
      return
    }
    setInterval(parsed)
  }

  return (
    <div className="fixed inset-0 z-[90] bg-white dark:bg-stone-900 flex flex-col">
      <div className="flex items-center justify-between px-4 py-4 border-b border-stone-100 dark:border-stone-800 pt-safe">
        <button onClick={onBack} className="p-1 text-stone-500 dark:text-stone-400">
          <ChevronLeft size={22} />
        </button>
        <h2 className="text-base font-bold text-stone-800 dark:text-stone-100">반복</h2>
        <button
          onClick={handleSave}
          className="text-sm font-semibold text-accent-400"
        >
          완료
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div className="rounded-xl overflow-hidden bg-stone-50 dark:bg-stone-800 divide-y divide-stone-100 dark:divide-stone-700">
          <button
            onClick={() => setShowFreqPicker((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3.5 text-sm"
          >
            <span className="text-stone-700 dark:text-stone-300">반복 주기</span>
            <span className="text-stone-500 dark:text-stone-400">{freqLabel} ⌄</span>
          </button>
          {showFreqPicker && (
            <div className="divide-y divide-stone-100 dark:divide-stone-700">
              {FREQ_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setFreq(opt.value); setShowFreqPicker(false) }}
                  className={`w-full flex items-center justify-between px-4 py-3 text-sm ${
                    freq === opt.value
                      ? 'text-accent-400 font-semibold'
                      : 'text-stone-700 dark:text-stone-300'
                  }`}
                >
                  {opt.label}
                  {freq === opt.value && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-accent-400">
                      <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between px-4 py-3.5 text-sm">
            <span className="text-stone-700 dark:text-stone-300">반복 간격</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="반복 간격 감소"
                onClick={() => setInterval((prev) => Math.max(1, prev - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-200 text-stone-600 transition-colors hover:bg-stone-300 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600"
              >
                -
              </button>
              <label className="flex items-center gap-1 text-stone-500 dark:text-stone-400">
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  aria-label="반복 간격"
                  value={interval}
                  onChange={(e) => handleIntervalChange(e.target.value)}
                  className="w-14 rounded-lg border border-stone-200 bg-white px-2 py-1 text-right text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-accent-400 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
                />
                <span>{intervalUnit}</span>
              </label>
              <button
                type="button"
                aria-label="반복 간격 증가"
                onClick={() => setInterval((prev) => prev + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-200 text-stone-600 transition-colors hover:bg-stone-300 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {freq === 'weekly' && (
          <div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mb-2 px-1">지정일:</p>
            <div className="rounded-xl overflow-hidden bg-stone-50 dark:bg-stone-800 divide-y divide-stone-100 dark:divide-stone-700">
              {DOW_FULL.map((label, dow) => (
                <button
                  key={dow}
                  onClick={() => toggleDow(dow)}
                  className="w-full flex items-center justify-between px-4 py-3.5 text-sm text-stone-700 dark:text-stone-300"
                >
                  <span>{label}</span>
                  <Toggle on={daysOfWeek.includes(dow)} />
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-400 mt-2 px-1">
              {buildRecurrenceLabel({ freq, interval, daysOfWeek })}
            </p>
          </div>
        )}

        <div>
          <p className="text-xs text-stone-500 dark:text-stone-400 mb-2 px-1">반복 종료:</p>
          <div className="rounded-xl overflow-hidden bg-stone-50 dark:bg-stone-800">
            <div className="flex items-center justify-between px-4 py-3.5">
              <span className="text-sm text-stone-700 dark:text-stone-300">종료일 설정</span>
              <Toggle on={hasEndDate} onClick={() => setHasEndDate((v) => !v)} />
            </div>
            {hasEndDate && (
              <div className="border-t border-stone-100 dark:border-stone-700">
                <div className="relative px-4 py-3.5 flex items-center justify-between">
                  <span className="text-sm text-stone-700 dark:text-stone-300">종료일</span>
                  <span className="text-sm text-stone-500 dark:text-stone-400">{endDate}</span>
                  <input
                    type="date"
                    value={endDate}
                    min={addMonths(startDate, 1)}
                    max={addYears(startDate, 2)}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
          {!hasEndDate && (
            <p className="mt-2 px-1 text-xs text-stone-400">
              종료일을 설정하지 않으면 시작일 기준 1년 동안 반복 일정을 생성해요.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function Toggle({ on, onClick }: { on: boolean; onClick?: () => void }) {
  const className = `relative w-11 h-6 rounded-full transition-colors ${on ? 'bg-accent-400' : 'bg-stone-200 dark:bg-stone-600'}`
  const knob = (
    <span
      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`}
    />
  )

  if (!onClick) {
    return (
      <span aria-hidden="true" className={className}>
        {knob}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
    >
      {knob}
    </button>
  )
}
