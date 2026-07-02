"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Calendar, ChevronDown, X } from "lucide-react"
import { BirthLocationPicker } from "@/components/birth-location-picker"
import { BAZI_HOUR_GROUPS, normalizeBaziHourValue } from "@/lib/bazi-time-options"
import {
  DEFAULT_BIRTH_LOCATION,
  coerceBirthLocation,
  type BirthLocation,
} from "@/lib/birth-location"

export interface BaziData {
  profileName?: string
  year: string
  month: string
  day: string
  hour: string
  minute: string
  isSolar: boolean
  isFemale: boolean
  longitude: string
  latitude: string
  locationName?: string
}

interface BaziDialogProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: BaziData) => void
  initialData?: Partial<BaziData>
}

const DEFAULT_BAZI_DATA: BaziData = {
  profileName: "",
  year: "1995",
  month: "1",
  day: "1",
  hour: "",
  minute: "",
  isSolar: true,
  isFemale: false,
  longitude: String(DEFAULT_BIRTH_LOCATION.longitude),
  latitude: String(DEFAULT_BIRTH_LOCATION.latitude),
  locationName: DEFAULT_BIRTH_LOCATION.name,
}

function normalizeBaziData(data?: Partial<BaziData>): BaziData {
  return {
    ...DEFAULT_BAZI_DATA,
    ...Object.fromEntries(
      Object.entries(data || {}).filter(([, value]) => value !== undefined && value !== null),
    ),
    hour: normalizeBaziHourValue(data?.hour || DEFAULT_BAZI_DATA.hour),
    longitude: String(data?.longitude ?? DEFAULT_BAZI_DATA.longitude),
    latitude: String(data?.latitude ?? DEFAULT_BAZI_DATA.latitude),
    locationName: data?.locationName || DEFAULT_BIRTH_LOCATION.name,
  }
}

export function BaziDialog({ isOpen, onClose, onSubmit, initialData }: BaziDialogProps) {
  const [baziData, setBaziData] = useState<BaziData>(() => normalizeBaziData(initialData))
  const [formNotice, setFormNotice] = useState("")

  useEffect(() => {
    setBaziData(normalizeBaziData(initialData))
    setFormNotice("")
  }, [initialData])

  const monthOptions = useMemo(() => {
    const months = [
      "一月", "二月", "三月", "四月", "五月", "六月",
      "七月", "八月", "九月", "十月", "十一月", "十二月",
    ]
    return months.map((month, index) => ({
      value: String(index + 1),
      label: month,
    }))
  }, [])

  const birthLocation = useMemo<BirthLocation>(() => (
    coerceBirthLocation(baziData.longitude, baziData.latitude, baziData.locationName)
  ), [baziData.latitude, baziData.locationName, baziData.longitude])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const val = type === "checkbox" ? (e.target as HTMLInputElement).checked : value
    setBaziData(prev => ({ ...prev, [name]: val }))
  }, [])

  const handleGenderChange = useCallback((isFemale: boolean) => {
    setBaziData(prev => ({ ...prev, isFemale }))
  }, [])

  const handleTimeChange = useCallback((field: "hour" | "minute", value: string) => {
    setBaziData(prev => ({
      ...prev,
      [field]: field === "hour" ? normalizeBaziHourValue(value) : value,
    }))
  }, [])

  const handleLocationChange = useCallback((location: BirthLocation) => {
    setBaziData(prev => ({
      ...prev,
      longitude: String(location.longitude),
      latitude: String(location.latitude),
      locationName: location.name,
    }))
  }, [])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    setFormNotice("")

    if (!String(baziData.profileName || "").trim()) {
      setFormNotice("卜卜象还不知道这位是谁，先给 TA 起个好认的名字吧。")
      return
    }

    if (!baziData.year || !baziData.month || !baziData.day || !baziData.hour) {
      setFormNotice("卜卜象还差一点点出生日期和时间，补齐后我就能稳稳排盘啦。")
      return
    }

    onSubmit(baziData)
  }, [baziData, onSubmit])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card/95 p-6 shadow-xl backdrop-blur-sm glass-minimal">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-muted transition-colors hover:bg-muted/80"
          type="button"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>

        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
            <Calendar className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="pr-8">
            <h2 className="text-xl font-light text-foreground">
              {initialData?.profileName ? "更新人物资料" : "给小象添加人物"}
            </h2>
            <p className="mt-1 text-xs font-light leading-5 text-muted-foreground">
              填好姓名、生辰和出生地，小象会排盘并保存到人物册。
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {formNotice && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-light text-foreground">
              {formNotice}
            </div>
          )}

          <label className="block space-y-2 text-sm font-light text-foreground">
            <span>人物名称</span>
            <input
              type="text"
              name="profileName"
              value={baziData.profileName || ""}
              onChange={handleInputChange}
              className="w-full rounded-lg border border-border bg-card/60 px-3 py-2 text-foreground placeholder-muted-foreground transition-all duration-300 focus:border-primary/60 focus:bg-card/80 focus:outline-none"
              placeholder="例如：本人、伴侣、朋友的名字"
              autoFocus={!initialData?.profileName}
              required
            />
          </label>

          <div className="space-y-3">
            <label className="block text-sm font-light text-foreground">
              出生日期
            </label>
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              <div className="relative">
                <input
                  type="number"
                  name="year"
                  value={baziData.year}
                  onChange={handleInputChange}
                  className="w-full rounded-lg border border-border bg-card/60 px-3 py-2 pr-8 text-foreground placeholder-muted-foreground transition-all duration-300 focus:border-primary/60 focus:bg-card/80 focus:outline-none"
                  placeholder="1995"
                  required
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-light text-muted-foreground">
                  年
                </span>
              </div>

              <div className="relative">
                <select
                  name="month"
                  value={baziData.month}
                  onChange={handleInputChange}
                  className="w-full cursor-pointer appearance-none rounded-lg border border-border bg-card/60 px-3 py-2 text-foreground transition-all duration-300 focus:border-primary/60 focus:bg-card/80 focus:outline-none"
                  required
                >
                  {monthOptions.map(month => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>

              <div className="relative">
                <input
                  type="number"
                  name="day"
                  value={baziData.day}
                  onChange={handleInputChange}
                  className="w-full rounded-lg border border-border bg-card/60 px-3 py-2 pr-8 text-foreground placeholder-muted-foreground transition-all duration-300 focus:border-primary/60 focus:bg-card/80 focus:outline-none"
                  placeholder="1"
                  required
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-light text-muted-foreground">
                  日
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-light text-foreground">
              出生时间
            </label>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="relative">
                <select
                  value={normalizeBaziHourValue(baziData.hour)}
                  onChange={(e) => handleTimeChange("hour", e.target.value)}
                  className="w-full cursor-pointer appearance-none rounded-lg border border-border bg-card/60 px-3 py-2 text-foreground transition-all duration-300 focus:border-primary/60 focus:bg-card/80 focus:outline-none"
                  required
                >
                  <option value="">时</option>
                  {BAZI_HOUR_GROUPS.map(group => (
                    <optgroup key={group.label} label={`${group.label} ${group.rangeLabel}`}>
                      {group.hours.map(hour => (
                        <option key={hour.value} value={hour.value}>
                          {hour.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={baziData.minute}
                  onChange={(e) => handleTimeChange("minute", e.target.value)}
                  className="w-full rounded-lg border border-border bg-card/60 px-3 py-2 pr-8 text-foreground placeholder-muted-foreground transition-all duration-300 focus:border-primary/60 focus:bg-card/80 focus:outline-none"
                  placeholder="00"
                  required
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-light text-muted-foreground">
                  分
                </span>
              </div>
            </div>
          </div>

          <BirthLocationPicker value={birthLocation} onChange={handleLocationChange} />

          <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                name="isSolar"
                checked={baziData.isSolar}
                onChange={handleInputChange}
                className="rounded text-foreground focus:ring-primary"
              />
              <span className="text-sm font-light text-foreground">阳历</span>
            </label>

            <div className="flex items-center space-x-1">
              <span className="mr-3 text-sm font-light text-foreground">性别:</span>
              <button
                type="button"
                onClick={() => handleGenderChange(false)}
                className={`rounded-full px-3 py-1 text-xs font-light transition-all duration-300 ${
                  !baziData.isFemale
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                男性
              </button>
              <button
                type="button"
                onClick={() => handleGenderChange(true)}
                className={`rounded-full px-3 py-1 text-xs font-light transition-all duration-300 ${
                  baziData.isFemale
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                女性
              </button>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => {
                setBaziData(prev => ({
                  ...prev,
                  profileName: prev.profileName || "小象示例",
                  year: "2000",
                  month: "1",
                  day: "1",
                  hour: "15",
                  minute: "30",
                  isSolar: true,
                  isFemale: false,
                  longitude: String(DEFAULT_BIRTH_LOCATION.longitude),
                  latitude: String(DEFAULT_BIRTH_LOCATION.latitude),
                  locationName: DEFAULT_BIRTH_LOCATION.name,
                }))
              }}
              className="rounded-full bg-accent/20 px-4 py-2 text-sm font-light text-accent transition-all duration-300 hover:bg-accent/30"
            >
              小象示例
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-muted px-4 py-2 text-sm font-light text-muted-foreground transition-all duration-300 hover:bg-muted/80"
            >
              先不填
            </button>
            <button
              type="submit"
              className="rounded-full bg-primary px-4 py-2 text-sm font-light text-primary-foreground transition-all duration-300 hover:opacity-90"
            >
              交给小象
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
