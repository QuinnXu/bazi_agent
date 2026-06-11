import {
  AGENT_COMPLEXITY_COPY,
  AGENT_REPORT_PREFERENCE_INSTRUCTIONS,
  getFeatureComplexityKindHint,
  type FeatureKind,
} from '@/lib/bubu-content'

export type AgentComplexityMode = 'instant' | 'thinking'
export type AgentReasoningEffort = 'none' | 'high' | 'max'
export type AgentThinkingMode = 'enabled' | 'disabled'
export type AgentReportPreferenceMode = 'concise' | 'balanced' | 'detailed' | 'custom'

export interface AgentReportPreference {
  mode: AgentReportPreferenceMode
  customInstruction?: string | null
}

export interface AgentComplexityProfile {
  mode: AgentComplexityMode
  label: string
  answerMaxTokens: number
  plannerMaxTokens: number
  maxSteps: number
  timeoutMs: number
  featureMaxTokens: number
  analysisMaxTokens: number
  thinking: AgentThinkingMode
  reasoningEffort: AgentReasoningEffort
  plannerInstruction: string
  featureInstruction: string
}

export const DEFAULT_AGENT_COMPLEXITY: AgentComplexityMode = 'instant'

const REPORT_PREFERENCE_INSTRUCTIONS: Record<AgentReportPreferenceMode, string> = AGENT_REPORT_PREFERENCE_INSTRUCTIONS

export const AGENT_COMPLEXITY_PROFILES: Record<
  AgentComplexityMode,
  AgentComplexityProfile
> = {
  instant: {
    mode: 'instant',
    label: AGENT_COMPLEXITY_COPY.instant.label,
    answerMaxTokens: 8_000,
    plannerMaxTokens: 1000,
    maxSteps: 2,
    timeoutMs: 120_000,
    featureMaxTokens: 8_000,
    analysisMaxTokens: 8_000,
    thinking: 'disabled',
    reasoningEffort: 'none',
    plannerInstruction: AGENT_COMPLEXITY_COPY.instant.plannerInstruction,
    featureInstruction: AGENT_COMPLEXITY_COPY.instant.featureInstruction,
  },
  thinking: {
    mode: 'thinking',
    label: AGENT_COMPLEXITY_COPY.thinking.label,
    answerMaxTokens: 64_000,
    plannerMaxTokens: 2200,
    maxSteps: 4,
    timeoutMs: 285_000,
    featureMaxTokens: 64_000,
    analysisMaxTokens: 64_000,
    thinking: 'enabled',
    reasoningEffort: 'high',
    plannerInstruction: AGENT_COMPLEXITY_COPY.thinking.plannerInstruction,
    featureInstruction: AGENT_COMPLEXITY_COPY.thinking.featureInstruction,
  },
}

export function normalizeAgentComplexityMode(
  value: unknown,
): AgentComplexityMode {
  if (value === 'instant' || value === 'thinking') {
    return value
  }
  return DEFAULT_AGENT_COMPLEXITY
}

export function getAgentComplexityProfile(
  value: unknown,
): AgentComplexityProfile {
  return AGENT_COMPLEXITY_PROFILES[normalizeAgentComplexityMode(value)]
}

export function getFeatureComplexityInstruction(
  mode: AgentComplexityMode | undefined,
  kind?: FeatureKind,
): string {
  const profile = getAgentComplexityProfile(mode)
  const kindHint = getFeatureComplexityKindHint(kind)

  return `${profile.featureInstruction}${kindHint ? `\n${kindHint}` : ''}`
}

export function normalizeAgentReportPreference(
  value: unknown,
): AgentReportPreference | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<AgentReportPreference>
  if (
    raw.mode === 'concise' ||
    raw.mode === 'balanced' ||
    raw.mode === 'detailed' ||
    raw.mode === 'custom'
  ) {
    return {
      mode: raw.mode,
      customInstruction:
        typeof raw.customInstruction === 'string' && raw.customInstruction.trim()
          ? raw.customInstruction.trim()
          : null,
    }
  }
  return null
}

export function getAgentReportPreferenceInstruction(
  preference?: AgentReportPreference | null,
): string {
  const normalized = normalizeAgentReportPreference(preference)
  if (!normalized) return ''
  const base = REPORT_PREFERENCE_INSTRUCTIONS[normalized.mode]
  if (normalized.mode === 'custom' && normalized.customInstruction) {
    return `${base}\n用户自定义要求：${normalized.customInstruction}`
  }
  return base
}

export function getAgentReportPreferenceLabel(
  preference?: AgentReportPreference | null,
): string {
  const normalized = normalizeAgentReportPreference(preference)
  if (!normalized) return '未选择'
  if (normalized.mode === 'concise') return '简洁结论型'
  if (normalized.mode === 'balanced') return '均衡报告型'
  if (normalized.mode === 'detailed') return '深度展开型'
  return normalized.customInstruction || '自定义'
}
