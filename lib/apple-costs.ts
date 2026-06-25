import appleCostsConfig from '@/config/apple-costs.json'

export type FeatureAppleCostKey = 'hepan' | 'fortune' | 'avatar' | 'lifepath'
export type AgentReportAppleCostKey = 'concise' | 'balanced' | 'detailed'

type AppleCostsConfig = {
  classicChat?: unknown
  agentReports?: Partial<Record<AgentReportAppleCostKey, unknown>>
  featureCards?: Partial<Record<FeatureAppleCostKey, unknown>>
}

const DEFAULT_APPLE_COST = 1

function normalizeAppleCost(value: unknown, fallback = DEFAULT_APPLE_COST): number {
  const numericValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numericValue)) return fallback
  return Math.max(0, Math.floor(numericValue))
}

const config = appleCostsConfig as AppleCostsConfig

export const CLASSIC_CHAT_APPLE_COST = normalizeAppleCost(config.classicChat)

export const AGENT_REPORT_APPLE_COSTS: Record<AgentReportAppleCostKey, number> = {
  concise: normalizeAppleCost(config.agentReports?.concise),
  balanced: normalizeAppleCost(config.agentReports?.balanced),
  detailed: normalizeAppleCost(config.agentReports?.detailed),
}

export const FEATURE_APPLE_COSTS: Record<FeatureAppleCostKey, number> = {
  hepan: normalizeAppleCost(config.featureCards?.hepan),
  fortune: normalizeAppleCost(config.featureCards?.fortune),
  avatar: normalizeAppleCost(config.featureCards?.avatar),
  lifepath: normalizeAppleCost(config.featureCards?.lifepath),
}

export function getAgentReportAppleCost(depth: AgentReportAppleCostKey): number {
  return AGENT_REPORT_APPLE_COSTS[depth]
}

export function getFeatureAppleCost(kind: FeatureAppleCostKey): number {
  return FEATURE_APPLE_COSTS[kind]
}