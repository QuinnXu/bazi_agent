"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Check, ChevronDown, Loader2, MapPin, UserPlus } from "lucide-react"
import { OptimizedSelect } from "@/components/optimized-select"

export type AgentInputFieldType =
  | 'text'
  | 'number'
  | 'select'
  | 'choice'
  | 'boolean'
  | 'date'
  | 'time'

export interface AgentInputField {
  name: string
  label: string
  inputType: AgentInputFieldType
  required?: boolean
  value?: string | boolean | number | null
  placeholder?: string
  options?: Array<{
    label: string
    value: string | boolean | number
    description?: string
    params?: any
    resumeIntent?: string
    reportPreference?: any
    complexity?: string | null
  }>
  multiple?: boolean
  allowCustom?: boolean
  customPlaceholder?: string
}

export interface AgentInlineInputRequest {
  type: 'human_input_request'
  requestId: string
  kind: 'bazi_profile' | 'profile_required' | 'feature_params'
  title: string
  message: string
  fields: AgentInputField[]
  submitLabel?: string
  resumeIntent?: string
}

export type AgentInputValue = string | string[] | boolean | number | null
export type AgentInputValues = Record<string, AgentInputValue>

interface AgentInputRequestProps {
  request: AgentInlineInputRequest
  disabled?: boolean
  onSubmit: (request: AgentInlineInputRequest, values: AgentInputValues) => void | Promise<void>
}

interface LocationData {
  area: string
  city: string
  country: string
  lat: string
  lng: string
  province: string
}

function initialValueFor(field: AgentInputField): AgentInputValue {
  if (field.value !== undefined) return field.value
  if (field.inputType === 'choice' && field.multiple) return []
  if (field.inputType === 'boolean') return false
  return ''
}

const MONTH_OPTIONS = [
  '一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月',
].map((label, index) => ({ value: String(index + 1), label }))

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, '0'),
)

function hasInputValue(value: AgentInputValue): boolean {
  if (Array.isArray(value)) return value.some(item => String(item).trim())
  if (typeof value === 'boolean') return true
  return String(value ?? '').trim().length > 0
}

function validateInputValues(
  fields: AgentInputField[],
  values: AgentInputValues,
): Record<string, string> {
  const errors: Record<string, string> = {}

  fields.forEach(field => {
    if (field.required && !hasInputValue(values[field.name])) {
      errors[field.name] = `请填写${field.label}`
    }
  })

  const hasTimePreset = fields.some(field => field.name === 'timeRangePreset')
  if (hasTimePreset && String(values.timeRangePreset ?? '') === 'custom') {
    if (!hasInputValue(values.customStart)) errors.customStart = '请选择自定义开始日期'
    if (!hasInputValue(values.customEnd)) errors.customEnd = '请选择自定义结束日期'
  }

  return errors
}

export function AgentInputRequest({ request, disabled = false, onSubmit }: AgentInputRequestProps) {
  const initialValues = useMemo(() => {
    return Object.fromEntries(request.fields.map(field => [field.name, initialValueFor(field)])) as AgentInputValues
  }, [request.fields])

  const [values, setValues] = useState<AgentInputValues>(initialValues)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [locationData, setLocationData] = useState<LocationData[]>([])
  const [selectedProvince, setSelectedProvince] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [isCustomLocation, setIsCustomLocation] = useState(false)

  const isBaziProfileRequest =
    request.kind === 'bazi_profile' || request.kind === 'profile_required'

  const provinces = useMemo(() => {
    return Array.from(
      new Set(locationData.map(item => item.province).filter(Boolean)),
    )
  }, [locationData])

  const cities = useMemo(() => {
    if (!selectedProvince) return []
    return Array.from(
      new Set(
        locationData
          .filter(item => item.province === selectedProvince)
          .map(item => item.city)
          .filter(Boolean),
      ),
    )
  }, [locationData, selectedProvince])

  useEffect(() => {
    setValues(initialValues)
    setFieldErrors({})
  }, [initialValues])

  useEffect(() => {
    if (!isBaziProfileRequest || locationData.length > 0) return
    let cancelled = false
    fetch('/geodata/data.json')
      .then(response => response.json())
      .then((data: LocationData[]) => {
        if (!cancelled) setLocationData(data)
      })
      .catch(error => {
        console.error('加载地理位置数据失败:', error)
      })
    return () => {
      cancelled = true
    }
  }, [isBaziProfileRequest, locationData.length])

  useEffect(() => {
    if (!selectedProvince || !selectedCity || isCustomLocation) return
    const location = locationData.find(
      item => item.province === selectedProvince && item.city === selectedCity,
    )
    if (!location) return
    setValues(prev => ({
      ...prev,
      longitude: location.lng,
      latitude: location.lat,
    }))
  }, [isCustomLocation, locationData, selectedCity, selectedProvince])

  const updateValue = (name: string, value: AgentInputValue) => {
    setValues(prev => ({ ...prev, [name]: value }))
    setFieldErrors(prev => {
      if (!prev[name] && name !== 'timeRangePreset') return prev
      const next = { ...prev }
      delete next[name]
      if (name === 'timeRangePreset' && value !== 'custom') {
        delete next.customStart
        delete next.customEnd
      }
      return next
    })
  }

  const toggleChoiceValue = (
    field: AgentInputField,
    optionValue: string | boolean | number,
  ) => {
    const nextValue = String(optionValue)
    if (field.multiple) {
      const rawValue = values[field.name]
      const current = Array.isArray(rawValue)
        ? rawValue.map(String)
        : String(rawValue ?? '')
          ? [String(rawValue)]
          : []
      updateValue(
        field.name,
        current.includes(nextValue)
          ? current.filter(item => item !== nextValue)
          : [...current, nextValue],
      )
      return
    }
    updateValue(field.name, nextValue)
  }

  const isChoiceSelected = (
    field: AgentInputField,
    optionValue: string | boolean | number,
  ) => {
    const value = values[field.name]
    const target = String(optionValue)
    return Array.isArray(value)
      ? value.map(String).includes(target)
      : String(value ?? '') === target
  }

  const toggleCustomLocation = () => {
    setIsCustomLocation(prev => {
      if (!prev) {
        setSelectedProvince('')
        setSelectedCity('')
      }
      return !prev
    })
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (disabled || isSubmitting) return
    const nextErrors = validateInputValues(request.fields, values)
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    setIsSubmitting(true)
    try {
      await onSubmit(request, values)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mt-4 rounded-xl border border-border/70 bg-background/70 p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
          <UserPlus className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{request.title}</p>
          {request.message && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{request.message}</p>
          )}
        </div>
      </div>

      {Object.keys(fieldErrors).length > 0 && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive"
        >
          {Object.values(fieldErrors).map(error => (
            <div key={error}>{error}</div>
          ))}
        </div>
      )}

      {isBaziProfileRequest ? (
        <div className="mt-4 space-y-4">
          <label className="space-y-1.5 text-xs text-muted-foreground block">
            <span>人物名称 *</span>
            <input
              type="text"
              value={String(values.profileName ?? '')}
              disabled={disabled || isSubmitting}
              required
              placeholder="比如：小明、伴侣，或者写下你想看的人的名字 🐘"
              onChange={event => updateValue('profileName', event.target.value)}
              className="w-full h-10 rounded-lg border border-border bg-card/60 px-3 text-sm text-foreground outline-none focus:border-primary/60 focus:bg-card/80"
            />
          </label>

          <div className="space-y-2">
            <p className="text-sm font-light text-foreground">出生日期</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="relative">
                <input
                  type="number"
                  value={String(values.year ?? '')}
                  disabled={disabled || isSubmitting}
                  required
                  placeholder="1995"
                  onChange={event => updateValue('year', event.target.value)}
                  className="w-full h-10 rounded-lg border border-border bg-card/60 px-3 pr-8 text-sm text-foreground outline-none focus:border-primary/60 focus:bg-card/80"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                  年
                </span>
              </div>
              <label className="relative">
                <select
                  value={String(values.month ?? '1')}
                  disabled={disabled || isSubmitting}
                  onChange={event => updateValue('month', event.target.value)}
                  className="w-full h-10 rounded-lg border border-border bg-card/60 px-3 text-sm text-foreground outline-none focus:border-primary/60 focus:bg-card/80 appearance-none cursor-pointer"
                >
                  {MONTH_OPTIONS.map(month => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={String(values.day ?? '')}
                  disabled={disabled || isSubmitting}
                  required
                  placeholder="1"
                  onChange={event => updateValue('day', event.target.value)}
                  className="w-full h-10 rounded-lg border border-border bg-card/60 px-3 pr-8 text-sm text-foreground outline-none focus:border-primary/60 focus:bg-card/80"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                  日
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-light text-foreground">出生时间</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="relative">
                <select
                  value={String(values.hour ?? '')}
                  disabled={disabled || isSubmitting}
                  required
                  onChange={event => updateValue('hour', event.target.value)}
                  className="w-full h-10 rounded-lg border border-border bg-card/60 px-3 text-sm text-foreground outline-none focus:border-primary/60 focus:bg-card/80 appearance-none cursor-pointer"
                >
                  <option value="">时</option>
                  {HOUR_OPTIONS.map(hour => (
                    <option key={hour} value={hour}>
                      {hour}时
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={String(values.minute ?? '0')}
                  disabled={disabled || isSubmitting}
                  placeholder="00"
                  onChange={event => updateValue('minute', event.target.value)}
                  className="w-full h-10 rounded-lg border border-border bg-card/60 px-3 pr-8 text-sm text-foreground outline-none focus:border-primary/60 focus:bg-card/80"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                  分
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-light text-foreground">出生地点</p>
              <button
                type="button"
                onClick={toggleCustomLocation}
                disabled={disabled || isSubmitting}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-light transition-all ${
                  isCustomLocation
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                } disabled:opacity-50`}
              >
                <MapPin className="w-3 h-3" />
                自定义经纬度
              </button>
            </div>

            {!isCustomLocation ? (
              <div className="grid grid-cols-2 gap-3">
                <OptimizedSelect
                  value={selectedProvince}
                  onChange={event => {
                    setSelectedProvince(event.target.value)
                    setSelectedCity('')
                  }}
                  options={provinces}
                  placeholder="请选择省份"
                  disabled={disabled || isSubmitting}
                />
                <OptimizedSelect
                  value={selectedCity}
                  onChange={event => setSelectedCity(event.target.value)}
                  options={cities}
                  placeholder="请选择城市"
                  disabled={disabled || isSubmitting || !selectedProvince}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5 text-xs text-muted-foreground">
                  <span>经度</span>
                  <input
                    type="number"
                    step="0.000001"
                    value={String(values.longitude ?? '')}
                    disabled={disabled || isSubmitting}
                    placeholder="121.5"
                    onChange={event => updateValue('longitude', event.target.value)}
                    className="w-full h-10 rounded-lg border border-border bg-card/60 px-3 text-sm text-foreground outline-none focus:border-primary/60 focus:bg-card/80"
                  />
                </label>
                <label className="space-y-1.5 text-xs text-muted-foreground">
                  <span>纬度</span>
                  <input
                    type="number"
                    step="0.000001"
                    value={String(values.latitude ?? '')}
                    disabled={disabled || isSubmitting}
                    placeholder="31.2"
                    onChange={event => updateValue('latitude', event.target.value)}
                    className="w-full h-10 rounded-lg border border-border bg-card/60 px-3 text-sm text-foreground outline-none focus:border-primary/60 focus:bg-card/80"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5 text-xs text-muted-foreground">
              <span>历法 *</span>
              <select
                value={String(values.isSolar ?? 'solar')}
                disabled={disabled || isSubmitting}
                onChange={event => updateValue('isSolar', event.target.value)}
                className="w-full h-10 rounded-lg border border-border bg-card/60 px-3 text-sm text-foreground outline-none focus:border-primary/60 focus:bg-card/80"
              >
                <option value="solar">公历 / 阳历</option>
                <option value="lunar">农历 / 阴历</option>
              </select>
            </label>
            <label className="space-y-1.5 text-xs text-muted-foreground">
              <span>性别 *</span>
              <select
                value={String(values.gender ?? 'male')}
                disabled={disabled || isSubmitting}
                onChange={event => updateValue('gender', event.target.value)}
                className="w-full h-10 rounded-lg border border-border bg-card/60 px-3 text-sm text-foreground outline-none focus:border-primary/60 focus:bg-card/80"
              >
                <option value="male">男</option>
                <option value="female">女</option>
              </select>
            </label>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {request.fields.map(field => {
          const value = values[field.name]
          if (field.inputType === 'choice') {
            const optionValues = new Set((field.options || []).map(option => String(option.value)))
            const customValue = Array.isArray(value)
              ? ''
              : String(value ?? '')
            const isCustomActive =
              field.allowCustom &&
              customValue.trim() &&
              !optionValues.has(customValue)
            return (
              <div key={field.name} className="space-y-2 text-xs text-muted-foreground sm:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <span>{field.label}{field.required ? ' *' : ''}</span>
                  {field.multiple && (
                    <span className="text-[10px] text-muted-foreground/75">可多选</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(field.options || []).map(option => {
                    const selected = isChoiceSelected(field, option.value)
                    return (
                      <button
                        key={String(option.value)}
                        type="button"
                        disabled={disabled || isSubmitting}
                        onClick={() => toggleChoiceValue(field, option.value)}
                        className={`min-h-9 rounded-lg border px-3 py-1.5 text-left text-sm transition-all ${
                          selected
                            ? 'border-primary/60 bg-primary text-primary-foreground shadow-sm'
                            : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/50'
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        <span className="block leading-snug">{option.label}</span>
                        {option.description && (
                          <span className={`mt-0.5 block text-[11px] leading-relaxed ${
                            selected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                          }`}>
                            {option.description}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
                {field.allowCustom && !field.multiple && (
                  <input
                    type="text"
                    value={isCustomActive ? customValue : ''}
                    disabled={disabled || isSubmitting}
                    placeholder={field.customPlaceholder || field.placeholder || '还有什么想告诉卜卜象的吗？'}
                    onChange={event => updateValue(field.name, event.target.value)}
                    className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                  />
                )}
                {field.allowCustom && field.multiple && (
                  <input
                    type="text"
                    disabled={disabled || isSubmitting}
                    placeholder={field.customPlaceholder || field.placeholder || '写下你的小想法，敬回车告诉卜卜象~'}
                    onKeyDown={event => {
                      if (event.key !== 'Enter') return
                      event.preventDefault()
                      const custom = event.currentTarget.value.trim()
                      if (!custom) return
                      const rawValue = values[field.name]
                      const current = Array.isArray(rawValue)
                        ? rawValue.map(String)
                        : []
                      if (!current.includes(custom)) {
                        updateValue(field.name, [...current, custom])
                      }
                      event.currentTarget.value = ''
                    }}
                    className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                  />
                )}
                {field.allowCustom && field.multiple && Array.isArray(value) && value.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {value.map(item => (
                      <button
                        key={item}
                        type="button"
                        disabled={disabled || isSubmitting}
                        onClick={() =>
                          updateValue(field.name, value.filter(existing => existing !== item))
                        }
                        className="rounded-md bg-muted px-2 py-1 text-[11px] text-foreground hover:bg-muted/80 disabled:opacity-60"
                        title="点击移除"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          if (field.inputType === 'select') {
            return (
              <label key={field.name} className="space-y-1.5 text-xs text-muted-foreground">
                <span>{field.label}{field.required ? ' *' : ''}</span>
                <select
                  value={String(value ?? '')}
                  disabled={disabled || isSubmitting}
                  onChange={event => updateValue(field.name, event.target.value)}
                  className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
                >
                  {(field.options || []).map(option => (
                    <option key={String(option.value)} value={String(option.value)}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )
          }

          if (field.inputType === 'boolean') {
            return (
              <label
                key={field.name}
                className="h-10 mt-5 flex items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground"
              >
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  disabled={disabled || isSubmitting}
                  onChange={event => updateValue(field.name, event.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span>{field.label}</span>
              </label>
            )
          }

          return (
            <label key={field.name} className="space-y-1.5 text-xs text-muted-foreground">
              <span>{field.label}{field.required ? ' *' : ''}</span>
              <input
                type={field.inputType === 'number' ? 'number' : field.inputType}
                value={String(value ?? '')}
                disabled={disabled || isSubmitting}
                required={field.required}
                placeholder={field.placeholder}
                onChange={event => updateValue(field.name, event.target.value)}
                className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
              />
            </label>
          )
          })}
        </div>
      )}

      <button
        type="submit"
        disabled={disabled || isSubmitting}
        className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        {request.submitLabel || '提交并继续'}
      </button>
    </form>
  )
}
