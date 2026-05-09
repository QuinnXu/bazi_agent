/**
 * Shared types for the 4 feature sub-pages and their submit payloads.
 * Used by both client components (feature pages, chat-message bubbles) and
 * the server route at app/api/feature-analyze/route.ts.
 */

import type { FeatureType } from '@/components/app-sidebar'

// ==================== Participant ====================

export interface FeatureParticipant {
  id?: string
  name: string
  pillars?: string | null // e.g. "甲子 乙丑 丙寅 丁卯"
  baziText?: string | null // full plaintext bazi report
}

// ==================== Per-feature params ====================

export type HepanSubtype = 'pair' | 'multi' | 'event'

export interface HepanParams {
  subtype: HepanSubtype
  relationLabel?: string
  eventDesc?: string
  participants: FeatureParticipant[]
  analysisAngle?: string
}

export type Granularity = 'day' | 'month'

export interface FortuneParams {
  profile: FeatureParticipant
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD
  granularity: Granularity
  focus: string[]
  analysisAngle?: string
}

export interface AvatarParams {
  imageDataUrl: string // data:image/...;base64,...
  combineBazi: boolean
  profile?: FeatureParticipant | null
  analysisAngle?: string
}

export interface LifePathParams {
  profile: FeatureParticipant
  analysisAngle?: string
}

// ==================== Discriminated payload ====================

export type FeaturePayload =
  | { kind: 'hepan'; params: HepanParams }
  | { kind: 'fortune'; params: FortuneParams }
  | { kind: 'avatar'; params: AvatarParams }
  | { kind: 'lifepath'; params: LifePathParams }

export type FeatureKind = FeaturePayload['kind']

// ==================== UI metadata ====================

export const FEATURE_LABELS: Record<FeatureKind, string> = {
  hepan: '合盘 · 应事',
  fortune: '近期运势',
  avatar: '头像分析推荐',
  lifepath: '人生脉络与总体分析',
}

export const FEATURE_COSTS_UI: Record<FeatureKind, number> = {
  hepan: 2,
  fortune: 1,
  avatar: 3,
  lifepath: 2,
}

// Mapping from FeatureType (sidebar) to FeatureKind (payload)
export function featureTypeToKind(t: FeatureType): FeatureKind | null {
  if (t === 'hepan' || t === 'fortune' || t === 'avatar' || t === 'lifepath') {
    return t
  }
  return null
}
