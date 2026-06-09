import { isLifetimeWealthQuestion, isPartnerArchetypeQuestion } from '@/lib/agent-slot-extractor'
import type { AgentAnalysisSlots, AgentOutputDepth } from '@/lib/agent-workflow-types'
import type { AgentReportPreference } from '@/lib/agent-complexity'
import type { FeatureKind } from '@/lib/feature-prompts'
import {
  buildScenarioPrompt,
  getScenarioLabel,
  getScenarioStructure,
  type AgentScenarioKind,
} from '@/lib/bubu-content'

export type { AgentScenarioKind }

type ScenarioDepth = Exclude<AgentOutputDepth, 'chat'> | 'feature'

interface ScenarioPromptOptions {
  depth?: ScenarioDepth
  reportPreference?: AgentReportPreference | null
}

interface FeatureScenarioParams {
  subtype?: string
  relationLabel?: string
  eventDesc?: string
  focus?: string[]
  analysisAngle?: string
  combineBazi?: boolean
}

function compactText(text: string): string {
  return text.replace(/\s+/g, '')
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text))
}

function focusText(focus?: string[] | null): string {
  return Array.isArray(focus) ? focus.filter(Boolean).join('、') : ''
}

export { getScenarioLabel, getScenarioStructure }

export function getScenarioPrompt(
  scenario: AgentScenarioKind,
  options: ScenarioPromptOptions = {},
): string {
  return buildScenarioPrompt(scenario, options)
}

export function inferAgentScenario(
  slots: AgentAnalysisSlots,
  userQuestion: string,
): AgentScenarioKind {
  const raw = slots.matter?.raw || userQuestion
  const text = compactText(`${raw}${userQuestion}${focusText(slots.matter?.focus)}`)
  const category = slots.matter?.category || 'general'

  if (category === 'avatar') return 'avatar_style'
  if (isPartnerArchetypeQuestion(raw) || isPartnerArchetypeQuestion(userQuestion)) return 'partner_archetype'
  if (isLifetimeWealthQuestion(raw) || isLifetimeWealthQuestion(userQuestion)) return 'lifetime_wealth'
  if (category === 'event' || includesAny(text, [/应事|择日|签约|签合同|开业|搬家|面试|考试|发布|上线|要不要|适不适合|能不能|可不可以/])) {
    return 'event_decision'
  }
  if (category === 'relationship') return 'relationship_dynamics'
  if (includesAny(text, [/事业|工作|职业|职场|项目|创业|升职|跳槽|岗位|行业|平台|公司|老板|客户/])) {
    return 'career_development'
  }
  if (includesAny(text, [/财运|财富|财库|偏财|正财|钱|收入|投资|副业|生意|赚钱|挣钱|搞钱|现金流|资产|资源/])) {
    return 'wealth_strategy'
  }
  if (category === 'lifepath') return 'lifepath_growth'
  if (category === 'fortune') return 'fortune_timing'
  return 'general'
}

export function inferFeatureScenario(kind: FeatureKind, params: unknown): AgentScenarioKind {
  const featureParams = (params || {}) as FeatureScenarioParams
  const text = compactText([
    featureParams.subtype,
    featureParams.relationLabel,
    featureParams.eventDesc,
    focusText(featureParams.focus),
    featureParams.analysisAngle,
  ].filter(Boolean).join(' '))

  if (kind === 'avatar') return 'avatar_style'
  if (kind === 'hepan') {
    if (featureParams.subtype === 'event' || includesAny(text, [/应事|事件|选择|决策|要不要|适不适合|签约|开业|搬家|考试|面试|投资/])) {
      return 'event_decision'
    }
    return 'relationship_dynamics'
  }
  if (kind === 'lifepath') {
    if (includesAny(text, [/暴富|发财|财富跃迁|此生|一生.*财|财运|财富|赚钱|搞钱|投资|现金流/])) return 'lifetime_wealth'
    if (includesAny(text, [/事业|工作|职业|职场|创业|升职|跳槽|行业|平台/])) return 'career_development'
    if (includesAny(text, [/感情|婚姻|伴侣|关系|合盘|合作|合伙/])) return 'relationship_dynamics'
    return 'lifepath_growth'
  }
  if (kind === 'fortune') {
    if (includesAny(text, [/应事|择日|签约|签合同|开业|搬家|面试|考试|发布|上线|要不要|适不适合/])) return 'event_decision'
    if (includesAny(text, [/事业|工作|职业|职场|项目|创业|升职|跳槽|平台|行业/])) return 'career_development'
    if (includesAny(text, [/财运|财富|财库|偏财|正财|钱|收入|投资|副业|生意|赚钱|挣钱|搞钱|现金流|资产|资源/])) return 'wealth_strategy'
    return 'fortune_timing'
  }
  return 'general'
}

