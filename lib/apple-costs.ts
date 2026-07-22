import appleCostsConfig from '@/config/apple-costs.json'

export type BillingPlanId = 'free' | 'plus' | 'ultra'
export type UserTierId = 'guest' | BillingPlanId
export type MembershipTier = BillingPlanId
export type FeatureAppleCostKey = 'hepan' | 'fortune' | 'avatar' | 'lifepath'
export type AgentReportAppleCostKey = 'concise' | 'balanced' | 'detailed'
export type LiuYaoAppleCostKey = 'reading' | 'followUp'

type TieredAppleCost = Partial<Record<BillingPlanId, unknown>>

type AppleCostsConfig = {
  classicChat?: TieredAppleCost
  agentReports?: Partial<Record<AgentReportAppleCostKey, TieredAppleCost>>
  featureCards?: Partial<Record<FeatureAppleCostKey, TieredAppleCost>>
  liuyao?: Partial<Record<LiuYaoAppleCostKey, TieredAppleCost>>
}

const DEFAULT_APPLE_COST = 1

function normalizeAppleCost(value: unknown, fallback = DEFAULT_APPLE_COST): number {
  const numericValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numericValue)) return fallback
  return Math.max(0, Math.floor(numericValue))
}

function normalizeTieredCost(value: TieredAppleCost | undefined, fallback = DEFAULT_APPLE_COST) {
  const free = normalizeAppleCost(value?.free, fallback)
  return {
    free,
    plus: normalizeAppleCost(value?.plus, free),
    ultra: normalizeAppleCost(value?.ultra, 0),
  } satisfies Record<BillingPlanId, number>
}

const config = appleCostsConfig as AppleCostsConfig

export const CLASSIC_CHAT_APPLE_COSTS = normalizeTieredCost(config.classicChat)

export const AGENT_REPORT_APPLE_COSTS_BY_PLAN: Record<
  AgentReportAppleCostKey,
  Record<BillingPlanId, number>
> = {
  concise: normalizeTieredCost(config.agentReports?.concise),
  balanced: normalizeTieredCost(config.agentReports?.balanced),
  detailed: normalizeTieredCost(config.agentReports?.detailed),
}

export const FEATURE_APPLE_COSTS_BY_PLAN: Record<
  FeatureAppleCostKey,
  Record<BillingPlanId, number>
> = {
  hepan: normalizeTieredCost(config.featureCards?.hepan),
  fortune: normalizeTieredCost(config.featureCards?.fortune),
  avatar: normalizeTieredCost(config.featureCards?.avatar),
  lifepath: normalizeTieredCost(config.featureCards?.lifepath),
}

export const LIUYAO_APPLE_COSTS_BY_PLAN: Record<
  LiuYaoAppleCostKey,
  Record<BillingPlanId, number>
> = {
  reading: normalizeTieredCost(config.liuyao?.reading),
  followUp: normalizeTieredCost(config.liuyao?.followUp, 0),
}

// Standard prices remain the default UI price outside membership-aware surfaces.
export const CLASSIC_CHAT_APPLE_COST = CLASSIC_CHAT_APPLE_COSTS.free
export const AGENT_REPORT_APPLE_COSTS: Record<AgentReportAppleCostKey, number> = {
  concise: AGENT_REPORT_APPLE_COSTS_BY_PLAN.concise.free,
  balanced: AGENT_REPORT_APPLE_COSTS_BY_PLAN.balanced.free,
  detailed: AGENT_REPORT_APPLE_COSTS_BY_PLAN.detailed.free,
}
export const FEATURE_APPLE_COSTS: Record<FeatureAppleCostKey, number> = {
  hepan: FEATURE_APPLE_COSTS_BY_PLAN.hepan.free,
  fortune: FEATURE_APPLE_COSTS_BY_PLAN.fortune.free,
  avatar: FEATURE_APPLE_COSTS_BY_PLAN.avatar.free,
  lifepath: FEATURE_APPLE_COSTS_BY_PLAN.lifepath.free,
}

export function resolveBillingPlan(tierOrPaid: MembershipTier | boolean | null | undefined): BillingPlanId {
  if (tierOrPaid === 'ultra') return 'ultra'
  if (tierOrPaid === 'plus' || tierOrPaid === true) return 'plus'
  return 'free'
}

export function getClassicChatAppleCost(plan: BillingPlanId = 'free'): number {
  return CLASSIC_CHAT_APPLE_COSTS[plan]
}

export function getAgentReportAppleCost(
  depth: AgentReportAppleCostKey,
  plan: BillingPlanId = 'free',
): number {
  return AGENT_REPORT_APPLE_COSTS_BY_PLAN[depth][plan]
}

export function getFeatureAppleCost(
  kind: FeatureAppleCostKey,
  plan: BillingPlanId = 'free',
): number {
  return FEATURE_APPLE_COSTS_BY_PLAN[kind][plan]
}

export function getLiuYaoAppleCost(
  kind: LiuYaoAppleCostKey,
  plan: BillingPlanId = 'free',
): number {
  return LIUYAO_APPLE_COSTS_BY_PLAN[kind][plan]
}
