import type { FeatureKind } from '@/lib/feature-service'

export type AgentComplexityMode = 'instant' | 'thinking' | 'extend'
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
  plannerMaxTokens: number
  maxSteps: number
  timeoutMs: number
  featureMaxTokens: number
  thinking: AgentThinkingMode
  reasoningEffort: AgentReasoningEffort
  plannerInstruction: string
  featureInstruction: string
}

export const DEFAULT_AGENT_COMPLEXITY: AgentComplexityMode = 'instant'

const REPORT_PREFERENCE_MAX_TOKENS: Partial<Record<AgentReportPreferenceMode, number>> = {
  concise: 6_000,
  balanced: 18_000,
}

const REPORT_PREFERENCE_INSTRUCTIONS: Record<AgentReportPreferenceMode, string> = {
  concise:
    '【报告风格：简洁结论型】优先给结论、关键依据和行动建议，压缩背景铺垫，避免长篇逐项展开。',
  balanced:
    '【报告风格：均衡报告型】保持清晰层级，兼顾命理依据、关键阶段和行动建议，篇幅适中。',
  detailed:
    '【报告风格：深度展开型】在当前 Agent 深度允许的范围内充分展开结构、阶段差异、风险点和执行建议。',
  custom:
    '【报告风格：自定义】按用户补充的风格要求调整表达、篇幅和重点。',
}

export const AGENT_COMPLEXITY_PROFILES: Record<
  AgentComplexityMode,
  AgentComplexityProfile
> = {
  instant: {
    mode: 'instant',
    label: 'Instant',
    plannerMaxTokens: 1000,
    maxSteps: 2,
    timeoutMs: 120_000,
    featureMaxTokens: 8_000,
    thinking: 'disabled',
    reasoningEffort: 'none',
    plannerInstruction:
      '当前复杂度：Instant。优先快速完成判断，只做必要澄清；若问题很轻，不调用工具，直接给简短回答；若必须调用工具，参数尽量收敛，结果要求精简。',
    featureInstruction:
      '【Agent 复杂度：Instant】请输出短报告：先给结论，再给关键依据和 3-5 条行动建议。不要展开长篇章节，不要逐项铺满所有维度。',
  },
  thinking: {
    mode: 'thinking',
    label: 'Thinking',
    plannerMaxTokens: 2200,
    maxSteps: 4,
    timeoutMs: 285_000,
    featureMaxTokens: 64_000,
    thinking: 'enabled',
    reasoningEffort: 'high',
    plannerInstruction:
      '当前复杂度：Thinking。正常拆解问题，必要时补问，参数完整时调用结构化工具；回答深度保持均衡，给出依据、节奏和可执行建议。',
    featureInstruction:
      '【Agent 复杂度：Thinking】请输出中等深度报告：保留清晰层级、命理依据、关键时间窗口和行动建议；避免过短，也避免多年研究报告式铺陈。',
  },
  extend: {
    mode: 'extend',
    label: 'Extend',
    plannerMaxTokens: 3500,
    maxSteps: 5,
    timeoutMs: 300_000,
    featureMaxTokens: 384_000,
    thinking: 'enabled',
    reasoningEffort: 'max',
    plannerInstruction:
      '当前复杂度：Extend。允许更细的拆解和更长的工具报告；对复杂命理、长周期、多人关系和应事问题，优先调用结构化工具并保留充分上下文。',
    featureInstruction:
      '【Agent 复杂度：Extend】请输出深度长报告：展开完整结构、充分解释命局依据和阶段差异，覆盖关键月份/年份/人物互动，给出细颗粒度风险点与执行清单。',
  },
}

export function normalizeAgentComplexityMode(
  value: unknown,
): AgentComplexityMode {
  if (value === 'instant' || value === 'thinking' || value === 'extend') {
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
  const kindHint =
    kind === 'avatar'
      ? '头像分析仍需看图，但输出长度和建议数量按当前复杂度控制。'
      : kind === 'fortune'
      ? '运势分析按当前复杂度控制逐日/逐月展开颗粒度。'
      : kind === 'hepan'
      ? '合盘/应事分析按当前复杂度控制参与者互动和时间节点展开颗粒度。'
      : kind === 'lifepath'
      ? '人生脉络分析按当前复杂度控制大运分段展开颗粒度。'
      : ''

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

export function getAgentReportPreferenceMaxTokens(
  preference?: AgentReportPreference | null,
): number | undefined {
  const normalized = normalizeAgentReportPreference(preference)
  if (!normalized) return undefined
  return REPORT_PREFERENCE_MAX_TOKENS[normalized.mode]
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
