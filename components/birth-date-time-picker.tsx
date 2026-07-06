"use client"

import { useMemo, useState } from "react"
import { CalendarDays, Check, Clock } from "lucide-react"
import { normalizeBaziHourValue } from "@/lib/bazi-time-options"

function pad2(value: string | number) {
  return String(value).padStart(2, "0")
}

function padYear(value: string | number) {
  return String(value).padStart(4, "0")
}

function todayIso() {
  const today = new Date()
  return [
    today.getFullYear(),
    pad2(today.getMonth() + 1),
    pad2(today.getDate()),
  ].join("-")
}

function formatDateValue(year: string, month: string, day: string) {
  const parsedYear = Number(year)
  const parsedMonth = Number(month)
  const parsedDay = Number(day)
  if (
    !Number.isInteger(parsedYear) ||
    !Number.isInteger(parsedMonth) ||
    !Number.isInteger(parsedDay) ||
    parsedYear < 1 ||
    parsedMonth < 1 ||
    parsedMonth > 12 ||
    parsedDay < 1 ||
    parsedDay > 31
  ) {
    return ""
  }

  const value = `${padYear(parsedYear)}-${pad2(parsedMonth)}-${pad2(parsedDay)}`
  const date = new Date(`${value}T00:00:00`)
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== parsedYear ||
    date.getMonth() + 1 !== parsedMonth ||
    date.getDate() !== parsedDay
  ) {
    return ""
  }
  return value
}

function formatTimeValue(hour: string, minute: string) {
  const normalizedHour = normalizeBaziHourValue(hour)
  const parsedHour = Number(normalizedHour)
  const parsedMinute = Number(minute || "0")
  if (
    !Number.isInteger(parsedHour) ||
    parsedHour < 0 ||
    parsedHour > 23 ||
    !Number.isInteger(parsedMinute) ||
    parsedMinute < 0 ||
    parsedMinute > 59
  ) {
    return ""
  }
  return `${pad2(parsedHour)}:${pad2(parsedMinute)}`
}

export function BirthDatePicker({
  year,
  month,
  day,
  onChange,
  disabled = false,
  className = "",
}: {
  year: string
  month: string
  day: string
  onChange: (value: { year: string; month: string; day: string }) => void
  disabled?: boolean
  className?: string
}) {
  const value = useMemo(() => formatDateValue(year, month, day), [day, month, year])

  return (
    <div className={`space-y-2 ${className}`}>
      <p className="inline-flex items-center gap-1.5 text-sm font-light text-foreground">
        <CalendarDays className="h-4 w-4 text-primary" />
        出生日期
      </p>
      <input
        type="date"
        value={value}
        max={todayIso()}
        disabled={disabled}
        onChange={event => {
          if (!event.target.value) {
            onChange({ year: "", month: "", day: "" })
            return
          }
          const [nextYear, nextMonth, nextDay] = event.target.value.split("-")
          onChange({
            year: String(Number(nextYear || "")),
            month: String(Number(nextMonth || "")),
            day: String(Number(nextDay || "")),
          })
        }}
        className="h-11 w-full rounded-lg border border-border bg-card/60 px-3 text-sm text-foreground outline-none transition-all focus:border-primary/60 focus:bg-card/80 disabled:cursor-not-allowed disabled:opacity-60"
        required
      />
    </div>
  )
}

export function BirthTimePicker({
  hour,
  minute,
  onChange,
  disabled = false,
  className = "",
}: {
  hour: string
  minute: string
  onChange: (value: { hour: string; minute: string }) => void
  disabled?: boolean
  className?: string
}) {
  const [timeUnknown, setTimeUnknown] = useState(false)
  const timeValue = useMemo(() => formatTimeValue(hour, minute), [hour, minute])
  const summary = timeUnknown
    ? "不记得时辰，暂按 12:00 午时排盘"
    : timeValue
      ? `当前按 ${timeValue} 入盘`
      : "可直接选择出生证明或记忆里的时间"

  function toggleUnknown() {
    const nextUnknown = !timeUnknown
    setTimeUnknown(nextUnknown)
    onChange(nextUnknown ? { hour: "12", minute: "0" } : { hour: "", minute: "" })
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-sm font-light text-foreground">
          <Clock className="h-4 w-4 text-primary" />
          出生时刻
        </p>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={timeUnknown}
          onClick={toggleUnknown}
          className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-light transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
            timeUnknown
              ? "border-primary/50 bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
          }`}
        >
          <Check className="h-3.5 w-3.5" />
          不记得时辰
        </button>
      </div>
      <input
        type="time"
        value={timeValue}
        disabled={disabled || timeUnknown}
        onChange={event => {
          const [nextHour, nextMinute] = event.target.value.split(":")
          setTimeUnknown(false)
          onChange({
            hour: normalizeBaziHourValue(nextHour),
            minute: String(Number(nextMinute || "0")),
          })
        }}
        className="h-11 w-full rounded-lg border border-border bg-card/60 px-3 text-sm text-foreground outline-none transition-all focus:border-primary/60 focus:bg-card/80 disabled:cursor-not-allowed disabled:opacity-60"
        required={!timeUnknown}
      />
      <p className="text-xs font-light leading-5 text-muted-foreground">{summary}</p>
    </div>
  )
}
