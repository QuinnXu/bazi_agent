"use client"

import React, { useMemo, useState } from 'react'
import { X, Plus } from 'lucide-react'
import { FeaturePageShell } from '@/components/feature-page-shell'
import { ProfilePicker } from './profile-picker'
import { useAuth } from '@/contexts/auth-context'
import type {
  FeatureParticipant,
  FortuneParams,
  Granularity,
} from '@/lib/feature-types'

interface FortunePageProps {
  onBack: () => void
  onSubmit: (params: FortuneParams) => void
  onOpenProfilesManager: () => void
  onRequireAuth: () => void
  loading?: boolean
}

const FOCUS_PRESETS = ['事业突破', '感情缘分', '财富能量', '学业成长', '身心状态', '人际磁场']

const MAX_RANGE_DAYS = 92 // ~3 months

function pad2(n: number) {
  return n.toString().padStart(2, '0')
}
function fmtToday(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function diffDaysInclusive(startStr: string, endStr: string) {
  const a = new Date(startStr).setHours(0, 0, 0, 0)
  const b = new Date(endStr).setHours(0, 0, 0, 0)
  return Math.round((b - a) / 86400000) + 1
}

export function FortunePage({
  onBack,
  onSubmit,
  onOpenProfilesManager,
  onRequireAuth,
  loading = false,
}: FortunePageProps) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [profile, setProfile] = useState<FeatureParticipant | null>(null)
  const [start, setStart] = useState(fmtToday(0))
  const [end, setEnd] = useState(fmtToday(13)) // default 14 days
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [focus, setFocus] = useState<string[]>(['事业突破', '感情缘分'])
  const [customFocus, setCustomFocus] = useState('')

  const stepLabels = ['人物', '时间范围', '关注方向']

  const rangeDays = useMemo(() => {
    if (!start || !end) return 0
    const d = diffDaysInclusive(start, end)
    return d
  }, [start, end])

  const rangeError = useMemo(() => {
    if (!start || !end) return '卜卜象需要明确的时间范围才能看清趋势哦 🐘'
    if (new Date(end) < new Date(start)) return '结束时间跑到开始时间前面去啦，稍微调整一下吧~'
    if (rangeDays > MAX_RANGE_DAYS) return `卜卜象的鼻子不够长，一次最多只能看约 ${MAX_RANGE_DAYS} 天的风景喔 🐘（当前 ${rangeDays} 天）`
    return null
  }, [start, end, rangeDays])

  const canNextStep1 = !!profile
  const canNextStep2 = !rangeError
  const canSubmit = canNextStep1 && canNextStep2 && focus.length > 0

  const handleAddCustom = () => {
    const text = customFocus.trim()
    if (!text) return
    if (focus.includes(text)) {
      setCustomFocus('')
      return
    }
    setFocus(prev => [...prev, text])
    setCustomFocus('')
  }

  const toggleFocus = (label: string) => {
    setFocus(prev =>
      prev.includes(label) ? prev.filter(f => f !== label) : [...prev, label],
    )
  }

  const handleSubmit = () => {
    if (!user) {
      onRequireAuth()
      return
    }
    if (!canSubmit || !profile) return
    onSubmit({
      profile,
      start,
      end,
      granularity,
      focus,
    })
  }

  const handleNext = () => {
    if (step === 1 && canNextStep1) setStep(2)
    else if (step === 2 && canNextStep2) setStep(3)
  }
  const handlePrev = () => setStep(s => Math.max(1, s - 1))

  return (
    <FeaturePageShell
      title="近期运势推演"
      subtitle="逐日 / 逐月看清这段时间的能量起伏"
      step={step}
      totalSteps={3}
      stepLabels={stepLabels}
      onBack={onBack}
      onPrev={handlePrev}
      onNext={handleNext}
      onSubmit={handleSubmit}
      canPrev={step > 1}
      canNext={step === 1 ? canNextStep1 : step === 2 ? canNextStep2 : false}
      canSubmit={canSubmit}
      isLastStep={step === 3}
      loading={loading}
      cost={1}
    >
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">先选一位想推演的人物</p>
          <ProfilePicker
            selectedIds={profile?.id ? [profile.id] : []}
            onChange={list => setProfile(list[0] || null)}
            onOpenManager={onOpenProfilesManager}
            emptyHint="先添加一位人物，才能推演运势"
          />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div>
            <label className="text-sm text-muted-foreground">时间范围</label>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <p className="text-[11px] text-muted-foreground/70 mb-1">起始</p>
                <input
                  type="date"
                  value={start}
                  onChange={e => setStart(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-card/60 border border-border text-foreground text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground/70 mb-1">结束</p>
                <input
                  type="date"
                  value={end}
                  onChange={e => setEnd(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-card/60 border border-border text-foreground text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
            {rangeError ? (
              <p className="text-xs text-destructive mt-2">{rangeError}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground/70 mt-2">
                共 {rangeDays} 天
              </p>
            )}
          </div>

          <div>
            <label className="text-sm text-muted-foreground">颗粒度</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {(
                [
                  { id: 'day', label: '逐日（精确）' },
                  { id: 'month', label: '逐月（概览）' },
                ] as { id: Granularity; label: string }[]
              ).map(opt => {
                const active = granularity === opt.id
                return (
                  <button
                    key={opt.id}
                    onClick={() => setGranularity(opt.id)}
                    className={`py-2 rounded-xl border text-sm font-light transition-all ${
                      active
                        ? 'bg-primary/10 border-primary/50 text-primary'
                        : 'bg-card/60 border-border/60 text-muted-foreground hover:border-primary/30'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-muted-foreground/70 mt-2">
              逐日适合 30 天内的精细分析；超过 30 天建议使用逐月概览。
            </p>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">
              关注方向 <span className="text-muted-foreground/60">（可多选）</span>
            </label>
            <div className="flex flex-wrap gap-2 mt-2">
              {FOCUS_PRESETS.map(label => {
                const active = focus.includes(label)
                return (
                  <button
                    key={label}
                    onClick={() => toggleFocus(label)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-light border transition-all ${
                      active
                        ? 'bg-primary/15 text-primary border-primary/40'
                        : 'bg-card/60 text-muted-foreground border-border/60 hover:border-primary/30'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
              {focus
                .filter(f => !FOCUS_PRESETS.includes(f))
                .map(label => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-light bg-accent/15 text-accent border border-accent/30"
                  >
                    {label}
                    <button
                      onClick={() => toggleFocus(label)}
                      className="opacity-70 hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground/80">添加自定义方向</label>
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={customFocus}
                onChange={e => setCustomFocus(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddCustom()
                  }
                }}
                placeholder="例如：搬家、签证、考证…"
                className="flex-1 px-3 py-2 rounded-lg bg-card/60 border border-border text-foreground text-sm placeholder-muted-foreground/60 focus:outline-none focus:border-primary/50"
              />
              <button
                onClick={handleAddCustom}
                disabled={!customFocus.trim()}
                className="px-3 py-2 rounded-lg bg-primary/15 text-primary text-xs font-light hover:bg-primary/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                添加
              </button>
            </div>
          </div>

          {focus.length === 0 && (
            <p className="text-xs text-destructive">至少选择一个关注方向</p>
          )}

          <div className="rounded-lg bg-secondary/40 border border-border/40 p-3 text-xs text-muted-foreground leading-relaxed space-y-1">
            <p>
              <span className="text-foreground/80">人物：</span>
              {profile?.name || '未选择'}
            </p>
            <p>
              <span className="text-foreground/80">范围：</span>
              {start} ~ {end} · {granularity === 'day' ? '逐日' : '逐月'}
            </p>
            <p>
              <span className="text-foreground/80">关注：</span>
              {focus.join('、') || '—'}
            </p>
          </div>
        </div>
      )}
    </FeaturePageShell>
  )
}
