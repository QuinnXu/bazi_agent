"use client"

import React, { useState } from 'react'
import { FeaturePageShell } from '@/components/feature-page-shell'
import { ProfilePicker } from './profile-picker'
import { useAuth } from '@/contexts/auth-context'
import type { FeatureParticipant, LifePathParams } from '@/lib/feature-types'

interface LifePathPageProps {
  onBack: () => void
  onSubmit: (params: LifePathParams) => void
  onOpenProfilesManager: () => void
  onRequireAuth: () => void
  loading?: boolean
}

export function LifePathPage({
  onBack,
  onSubmit,
  onOpenProfilesManager,
  onRequireAuth,
  loading = false,
}: LifePathPageProps) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<FeatureParticipant | null>(null)

  const canSubmit = !!profile

  const handleSubmit = () => {
    if (!user) {
      onRequireAuth()
      return
    }
    if (!canSubmit || !profile) return
    onSubmit({ profile })
  }

  return (
    <FeaturePageShell
      title="人生脉络与总体分析"
      subtitle="从第一步大运到晚年，看清整段人生节奏"
      step={1}
      totalSteps={1}
      stepLabels={['选择人物']}
      onBack={onBack}
      onSubmit={handleSubmit}
      canPrev={false}
      canSubmit={canSubmit}
      isLastStep
      loading={loading}
      cost={2}
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          选好人物，卜卜象就会带你从第一步大运一直走到晚年大运，逐段看趋势、关键节点与建议。
        </p>
        <ProfilePicker
          selectedIds={profile?.id ? [profile.id] : []}
          onChange={list => setProfile(list[0] || null)}
          onOpenManager={onOpenProfilesManager}
          emptyHint="先添加一位人物，才能解读人生脉络~"
        />
      </div>
    </FeaturePageShell>
  )
}
