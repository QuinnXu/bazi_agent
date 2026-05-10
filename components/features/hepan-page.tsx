"use client"

import React, { useMemo, useState } from 'react'
import { Heart, Users, Sparkles } from 'lucide-react'
import { FeaturePageShell } from '@/components/feature-page-shell'
import { ProfilePicker } from './profile-picker'
import { useAuth } from '@/contexts/auth-context'
import type {
  FeatureParticipant,
  HepanParams,
  HepanSubtype,
} from '@/lib/feature-types'

interface HepanPageProps {
  onBack: () => void
  onSubmit: (params: HepanParams) => void
  onOpenProfilesManager: () => void
  onRequireAuth: () => void
  loading?: boolean
}

const SUBTYPE_OPTIONS: {
  id: HepanSubtype
  title: string
  desc: string
  icon: React.ElementType
}[] = [
  {
    id: 'pair',
    title: '双人合盘',
    desc: '看两个人的缘分倾向、互动模式与重要节点',
    icon: Heart,
  },
  {
    id: 'multi',
    title: '多人合盘',
    desc: '最多 4 人，看团体 / 家庭 / 合作的整体能量',
    icon: Users,
  },
  {
    id: 'event',
    title: '应事分析',
    desc: '描述具体事件，结合两人或多人的命局给出参考',
    icon: Sparkles,
  },
]

const RELATION_OPTIONS = [
  '情侣 / 伴侣',
  '夫妻',
  '家人',
  '朋友',
  '同事 / 合作',
  '其他',
]

export function HepanPage({
  onBack,
  onSubmit,
  onOpenProfilesManager,
  onRequireAuth,
  loading = false,
}: HepanPageProps) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [subtype, setSubtype] = useState<HepanSubtype>('pair')
  const [participants, setParticipants] = useState<FeatureParticipant[]>([])
  const [relationLabel, setRelationLabel] = useState<string>('')
  const [customRelation, setCustomRelation] = useState<string>('')
  const [eventDesc, setEventDesc] = useState<string>('')

  const minPeople = subtype === 'pair' ? 2 : subtype === 'multi' ? 2 : 1
  const maxPeople = subtype === 'multi' ? 4 : subtype === 'pair' ? 2 : 4

  const canNextStep1 = !!subtype
  const canNextStep2 =
    participants.length >= minPeople && participants.length <= maxPeople
  const canSubmit =
    canNextStep2 &&
    (subtype !== 'event' || (eventDesc.trim().length > 0))

  const stepLabels = ['分析类型', '选择人物', '补充信息']

  const handleSubmit = () => {
    if (!user) {
      onRequireAuth()
      return
    }
    if (!canSubmit) return
    const finalRelation =
      relationLabel === '其他' ? customRelation.trim() : relationLabel
    const params: HepanParams = {
      subtype,
      participants,
      relationLabel: finalRelation || undefined,
      eventDesc: eventDesc.trim() || undefined,
    }
    onSubmit(params)
  }

  const handleNext = () => {
    if (step === 1 && canNextStep1) setStep(2)
    else if (step === 2 && canNextStep2) setStep(3)
  }
  const handlePrev = () => setStep(s => Math.max(1, s - 1))

  return (
    <FeaturePageShell
      title="合盘 · 应事分析"
      subtitle="小象帮你看清彼此的缘分倾向与互动模式"
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
      cost={2}
    >
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">想让小象看哪种关系呢？</p>
          {SUBTYPE_OPTIONS.map(opt => {
            const Icon = opt.icon
            const active = subtype === opt.id
            return (
              <button
                key={opt.id}
                onClick={() => {
                  setSubtype(opt.id)
                  // reset participants when switching subtype
                  setParticipants([])
                }}
                className={`w-full text-left rounded-lg border p-4 transition-all flex items-start gap-3 ${
                  active
                    ? 'bg-primary/10 border-primary/50 shadow-sm'
                    : 'bg-card/60 border-border/60 hover:bg-card/80 hover:border-primary/30'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0 ${
                    active
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {opt.title}
                  </p>
                  <p className="text-xs text-muted-foreground font-light mt-1">
                    {opt.desc}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {subtype === 'pair'
                ? '选择 2 位人物'
                : subtype === 'multi'
                ? `选择 2-${maxPeople} 位人物`
                : '选择 1 位或多位相关人物'}
            </p>
            <span className="text-xs text-primary/80">
              已选 {participants.length}
            </span>
          </div>
          <ProfilePicker
            multi
            max={maxPeople}
            selectedIds={participants.map(p => p.id || '').filter(Boolean)}
            onChange={setParticipants}
            onOpenManager={onOpenProfilesManager}
            emptyHint="先给小象添加几位人物，才能进行合盘"
          />
          {participants.length >= minPeople ? (
            <p className="text-[11px] text-muted-foreground/70">
              选好啦，小象可以继续看
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground/70">
              小象至少需要 {minPeople} 位人物
            </p>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              关系类型 <span className="text-muted-foreground/50">（可选）</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {RELATION_OPTIONS.map(opt => {
                const active = relationLabel === opt
                return (
                  <button
                    key={opt}
                    onClick={() => setRelationLabel(active ? '' : opt)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-light border transition-all ${
                      active
                        ? 'bg-primary/15 text-primary border-primary/40'
                        : 'bg-card/60 text-muted-foreground border-border/60 hover:border-primary/30'
                    }`}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
            {relationLabel === '其他' && (
              <input
                type="text"
                value={customRelation}
                onChange={e => setCustomRelation(e.target.value)}
                placeholder="自定义关系类型，例如：师生、商业搭档…"
                className="w-full px-3 py-2 rounded-lg bg-card/60 border border-border text-foreground text-sm placeholder-muted-foreground/60 focus:outline-none focus:border-primary/50"
              />
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              {subtype === 'event' ? (
                <>
                  应事描述 <span className="text-destructive">*</span>
                </>
              ) : (
                <>
                  具体应事 / 关注事项{' '}
                  <span className="text-muted-foreground/50">（可选）</span>
                </>
              )}
            </label>
            <textarea
              value={eventDesc}
              onChange={e => setEventDesc(e.target.value)}
              rows={4}
              placeholder={
                subtype === 'event'
                  ? '例如：我们在考虑要不要一起创业，希望参考这件事的整体趋势…'
                  : '例如：最近常吵架，想了解相处节奏；或者想看看适合一起出行的时间…'
              }
              className="w-full px-3 py-2.5 rounded-xl bg-card/60 border border-border text-foreground text-sm placeholder-muted-foreground/60 focus:outline-none focus:border-primary/50 resize-none"
            />
          </div>

          <div className="rounded-lg bg-secondary/40 border border-border/40 p-3 text-xs text-muted-foreground leading-relaxed">
            点击「让小象开看」后，卜卜象会带着 {participants.length} 位人物的命盘来给你做合盘解读。
          </div>
        </div>
      )}
    </FeaturePageShell>
  )
}
