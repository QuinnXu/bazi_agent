"use client"

import React, { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { Check, Loader2, Minus, Plus } from "lucide-react"
import { BirthDatePicker, BirthTimePicker } from "@/components/birth-date-time-picker"
import { BirthLocationPicker } from "@/components/birth-location-picker"
import { normalizeBaziHourValue } from "@/lib/bazi-time-options"
import {
  DEFAULT_BIRTH_LOCATION,
  coerceBirthLocation,
  type BirthLocation,
} from "@/lib/birth-location"

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

export interface AgentBaziProfileInputData {
  profileName?: string
  year?: string
  month?: string
  day?: string
  hour?: string
  minute?: string
  isSolar?: boolean
  isFemale?: boolean
  longitude?: string
  latitude?: string
  locationName?: string
}

export interface AgentInlineInputRequest {
  type: 'human_input_request'
  requestId: string
  kind: 'bazi_profile' | 'bazi_profiles' | 'profile_required' | 'feature_params'
  title: string
  message: string
  fields: AgentInputField[]
  profiles?: AgentBaziProfileInputData[]
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

function initialValueFor(field: AgentInputField): AgentInputValue {
  if (field.value !== undefined) return field.value
  if (field.inputType === 'choice' && field.multiple) return []
  if (field.inputType === 'boolean') return false
  return ''
}

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
      errors[field.name] = `小象还缺：${field.label}`
    }
  })

  const hasTimePreset = fields.some(field => field.name === 'timeRangePreset')
  if (hasTimePreset && String(values.timeRangePreset ?? '') === 'custom') {
    if (!hasInputValue(values.customStart)) errors.customStart = '小象还缺自定义开始日期'
    if (!hasInputValue(values.customEnd)) errors.customEnd = '小象还缺自定义结束日期'
  }

  return errors
}

const BATCH_BAZI_FIELDS = [
  'profileName',
  'year',
  'month',
  'day',
  'hour',
  'minute',
  'isSolar',
  'gender',
  'longitude',
  'latitude',
  'locationName',
] as const

const BATCH_PROFILE_COUNT_FIELD = 'profiles.__count'

function batchFieldName(index: number, name: typeof BATCH_BAZI_FIELDS[number]) {
  return `profiles.${index}.${name}`
}

function batchOriginalNameField(index: number) {
  return `profiles.${index}.__originalName`
}

function batchProfileInitialEntries(profile: AgentBaziProfileInputData, index: number): Array<[string, AgentInputValue]> {
  const profileName = profile.profileName || `人物${index + 1}`
  return [
    [batchOriginalNameField(index), profile.profileName || ''],
    [batchFieldName(index, 'profileName'), profileName],
    [batchFieldName(index, 'year'), profile.year || ''],
    [batchFieldName(index, 'month'), profile.month || '1'],
    [batchFieldName(index, 'day'), profile.day || '1'],
    [batchFieldName(index, 'hour'), normalizeBaziHourValue(profile.hour || '')],
    [batchFieldName(index, 'minute'), profile.minute || '0'],
    [batchFieldName(index, 'isSolar'), profile.isSolar === false ? 'lunar' : 'solar'],
    [batchFieldName(index, 'gender'), profile.isFemale ? 'female' : 'male'],
    [batchFieldName(index, 'longitude'), profile.longitude || String(DEFAULT_BIRTH_LOCATION.longitude)],
    [batchFieldName(index, 'latitude'), profile.latitude || String(DEFAULT_BIRTH_LOCATION.latitude)],
    [batchFieldName(index, 'locationName'), profile.locationName || DEFAULT_BIRTH_LOCATION.name],
  ]
}

function batchProfilesInitialValues(profiles: AgentBaziProfileInputData[]): AgentInputValues {
  return Object.fromEntries([
    [BATCH_PROFILE_COUNT_FIELD, profiles.length],
    ...profiles.flatMap((profile, index) => batchProfileInitialEntries(profile, index)),
  ]) as AgentInputValues
}

function reindexBatchValues(
  currentValues: AgentInputValues,
  removedIndex: number,
  nextCount: number,
): AgentInputValues {
  const nextValues: AgentInputValues = {}
  Object.entries(currentValues).forEach(([key, value]) => {
    if (key === BATCH_PROFILE_COUNT_FIELD) return
    const match = key.match(/^profiles\.(\d+)\.(.+)$/)
    if (!match) {
      nextValues[key] = value
      return
    }
    const currentIndex = Number(match[1])
    if (currentIndex === removedIndex) return
    const nextIndex = currentIndex > removedIndex ? currentIndex - 1 : currentIndex
    nextValues[`profiles.${nextIndex}.${match[2]}`] = value
  })
  nextValues[BATCH_PROFILE_COUNT_FIELD] = nextCount
  return nextValues
}

function validateBatchBaziProfiles(
  profiles: AgentBaziProfileInputData[],
  values: AgentInputValues,
): Record<string, string> {
  const errors: Record<string, string> = {}
  profiles.forEach((profile, index) => {
    const label = String(values[batchFieldName(index, 'profileName')] || profile.profileName || `人物${index + 1}`)
    const requiredFields: Array<[typeof BATCH_BAZI_FIELDS[number], string]> = [
      ['profileName', '人物名称'],
      ['year', '出生年'],
      ['month', '出生月'],
      ['day', '出生日'],
      ['hour', '出生时'],
      ['isSolar', '历法'],
      ['gender', '性别'],
      ['longitude', '出生地点'],
      ['latitude', '出生地点'],
    ]
    requiredFields.forEach(([fieldName, fieldLabel]) => {
      const key = batchFieldName(index, fieldName)
      if (!hasInputValue(values[key])) {
        errors[key] = `${label} 还缺：${fieldLabel}`
      }
    })
  })
  return errors
}

export function AgentInputRequest({ request, disabled = false, onSubmit }: AgentInputRequestProps) {
  const requestBatchProfiles = useMemo(() => {
    if (request.kind !== 'bazi_profiles') return []
    return request.profiles && request.profiles.length > 0 ? request.profiles : [{}]
  }, [request.kind, request.profiles])

  const initialValues = useMemo(() => {
    if (request.kind === 'bazi_profiles') {
      return batchProfilesInitialValues(requestBatchProfiles)
    }
    return Object.fromEntries(request.fields.map(field => [field.name, initialValueFor(field)])) as AgentInputValues
  }, [request.fields, request.kind, requestBatchProfiles])

  const [values, setValues] = useState<AgentInputValues>(initialValues)
  const [batchProfiles, setBatchProfiles] = useState<AgentBaziProfileInputData[]>(requestBatchProfiles)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const isBaziProfileRequest =
    request.kind === 'bazi_profile' || request.kind === 'profile_required'
  const isBatchBaziProfileRequest = request.kind === 'bazi_profiles'

  useEffect(() => {
    setValues(initialValues)
    setFieldErrors({})
    if (request.kind === 'bazi_profiles') {
      setBatchProfiles(requestBatchProfiles)
    }
  }, [initialValues, request.kind, requestBatchProfiles])

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

  const addBatchProfile = () => {
    const nextIndex = batchProfiles.length
    const nextProfile: AgentBaziProfileInputData = { profileName: `人物${nextIndex + 1}` }
    setBatchProfiles(prev => [...prev, nextProfile])
    setValues(prev => ({
      ...prev,
      ...Object.fromEntries(batchProfileInitialEntries(nextProfile, nextIndex)),
      [BATCH_PROFILE_COUNT_FIELD]: nextIndex + 1,
    }))
    setFieldErrors({})
  }

  const removeBatchProfile = (index: number) => {
    if (batchProfiles.length <= 1) return
    const nextProfiles = batchProfiles.filter((_, profileIndex) => profileIndex !== index)
    setBatchProfiles(nextProfiles)
    setValues(prev => reindexBatchValues(prev, index, nextProfiles.length))
    setFieldErrors({})
  }

  const renderBaziProfileFields = (profileIndex?: number) => {
    const isBatchProfile = typeof profileIndex === 'number'
    const nameFor = (fieldName: typeof BATCH_BAZI_FIELDS[number]) => (
      isBatchProfile ? batchFieldName(profileIndex, fieldName) : fieldName
    )
    const currentLocation = coerceBirthLocation(
      String(values[nameFor('longitude')] ?? ''),
      String(values[nameFor('latitude')] ?? ''),
      String(values[nameFor('locationName')] ?? '') || DEFAULT_BIRTH_LOCATION.name,
    )
    const handleLocationChange = (location: BirthLocation) => {
      updateValue(nameFor('longitude'), String(location.longitude))
      updateValue(nameFor('latitude'), String(location.latitude))
      updateValue(nameFor('locationName'), location.name)
    }
    const handleDateChange = (date: { year: string; month: string; day: string }) => {
      updateValue(nameFor('year'), date.year)
      updateValue(nameFor('month'), date.month)
      updateValue(nameFor('day'), date.day)
    }
    const handleTimeChange = (time: { hour: string; minute: string }) => {
      updateValue(nameFor('hour'), normalizeBaziHourValue(time.hour))
      updateValue(nameFor('minute'), time.minute)
    }

    return (
      <div className="space-y-4">
        <label className="space-y-1.5 text-xs text-muted-foreground block">
          <span>人物名称 *</span>
          <input
            type="text"
            value={String(values[nameFor('profileName')] ?? '')}
            disabled={disabled || isSubmitting}
            required
            placeholder="比如：小明、伴侣，或者小象要看的那个人"
            onChange={event => updateValue(nameFor('profileName'), event.target.value)}
            className="w-full h-10 rounded-lg border border-border bg-card/60 px-3 text-sm text-foreground outline-none focus:border-primary/60 focus:bg-card/80"
          />
        </label>

        <BirthDatePicker
          year={String(values[nameFor('year')] ?? '')}
          month={String(values[nameFor('month')] ?? '1')}
          day={String(values[nameFor('day')] ?? '1')}
          onChange={handleDateChange}
          disabled={disabled || isSubmitting}
        />

        <BirthTimePicker
          hour={String(values[nameFor('hour')] ?? '')}
          minute={String(values[nameFor('minute')] ?? '0')}
          onChange={handleTimeChange}
          disabled={disabled || isSubmitting}
        />

        <BirthLocationPicker
          value={currentLocation}
          onChange={handleLocationChange}
          disabled={disabled || isSubmitting}
        />

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1.5 text-xs text-muted-foreground">
            <span>历法 *</span>
            <select
              value={String(values[nameFor('isSolar')] ?? 'solar')}
              disabled={disabled || isSubmitting}
              onChange={event => updateValue(nameFor('isSolar'), event.target.value)}
              className="w-full h-10 rounded-lg border border-border bg-card/60 px-3 text-sm text-foreground outline-none focus:border-primary/60 focus:bg-card/80"
            >
              <option value="solar">公历 / 阳历</option>
              <option value="lunar">农历 / 阴历</option>
            </select>
          </label>
          <label className="space-y-1.5 text-xs text-muted-foreground">
            <span>性别 *</span>
            <select
              value={String(values[nameFor('gender')] ?? 'male')}
              disabled={disabled || isSubmitting}
              onChange={event => updateValue(nameFor('gender'), event.target.value)}
              className="w-full h-10 rounded-lg border border-border bg-card/60 px-3 text-sm text-foreground outline-none focus:border-primary/60 focus:bg-card/80"
            >
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </label>
        </div>
      </div>
    )
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (disabled || isSubmitting) return
    const nextErrors = isBatchBaziProfileRequest
      ? validateBatchBaziProfiles(batchProfiles, values)
      : validateInputValues(request.fields, values)
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
        <div className="w-8 h-8 rounded-lg border border-primary/20 bg-card flex items-center justify-center flex-shrink-0 overflow-hidden">
          <Image src="/avatar-small.png" alt="卜卜象" width={32} height={32} className="h-full w-full object-contain" />
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

      {isBatchBaziProfileRequest ? (
        <div className="mt-4 space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={addBatchProfile}
              disabled={disabled || isSubmitting}
              aria-label="添加人物"
              title="添加人物"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:border-primary/50 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {batchProfiles.map((profile, index) => (
            <div key={`${profile.profileName || 'profile'}-${index}`} className="rounded-lg border border-border/70 bg-card/45 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">
                  {String(values[batchFieldName(index, 'profileName')] || profile.profileName || `人物${index + 1}`)}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {index + 1}/{batchProfiles.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeBatchProfile(index)}
                    disabled={disabled || isSubmitting || batchProfiles.length <= 1}
                    aria-label="移除人物"
                    title="移除人物"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {renderBaziProfileFields(index)}
            </div>
          ))}
        </div>
      ) : isBaziProfileRequest ? (
        <div className="mt-4">
          {renderBaziProfileFields()}
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
                    placeholder={field.customPlaceholder || field.placeholder || '写下你的小想法，按回车告诉卜卜象~'}
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
        {request.submitLabel || '交给小象继续'}
      </button>
    </form>
  )
}
