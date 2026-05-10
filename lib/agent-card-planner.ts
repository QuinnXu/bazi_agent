import { callLLMTextWithUsage } from '@/lib/llm'
import { recordLlmUsage } from '@/lib/token-usage'
import type {
  AgentAnalysisSlots,
  PendingAgentStepKind,
} from '@/lib/agent-workflow-types'

export type AgentCardFamily =
  | 'daily_decision'
  | 'short_trend'
  | 'long_trend'
  | 'focus'
  | 'depth'
  | 'profile'
  | 'none'

export interface AgentCardOptionHint {
  key: string
  label?: string
  description?: string
}

export interface AgentCardPlan {
  family: AgentCardFamily
  title?: string
  message?: string
  submitLabel?: string
  optionHints?: AgentCardOptionHint[]
}

export interface AgentCardPlanningInput {
  userId?: string
  latestText: string
  slots: AgentAnalysisSlots
  pendingKind: PendingAgentStepKind
  deterministicTitle?: string
  deterministicMessage?: string
}

const CARD_FAMILIES: AgentCardFamily[] = [
  'daily_decision',
  'short_trend',
  'long_trend',
  'focus',
  'depth',
  'profile',
  'none',
]

const OPTION_KEYS: Record<AgentCardFamily, string[]> = {
  daily_decision: ['today', 'tomorrow', 'after_tomorrow', 'weekend'],
  short_trend: ['future_7_days', 'future_30_days', 'future_3_months', 'rest_of_year'],
  long_trend: ['current_time', 'future_12_months', 'future_3_years', 'future_5_years', 'rest_of_year'],
  focus: ['focus_0', 'focus_1', 'focus_2', 'focus_3'],
  depth: ['concise', 'balanced', 'detailed'],
  profile: [],
  none: [],
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  return text.length > max ? text.slice(0, max) : text
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return asObject(JSON.parse(trimmed))
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return asObject(JSON.parse(match[0]))
    } catch {
      return null
    }
  }
}

export function normalizeAgentCardPlan(raw: unknown): AgentCardPlan | null {
  const object = asObject(raw)
  if (!object) return null
  const familyText = cleanText(object.family ?? object.cardFamily, 32)
  if (!familyText || !CARD_FAMILIES.includes(familyText as AgentCardFamily)) return null
  const family = familyText as AgentCardFamily
  const allowedKeys = new Set(OPTION_KEYS[family])
  const rawOptions = object.optionHints || object.options
  const optionHints: AgentCardOptionHint[] = []
  if (Array.isArray(rawOptions)) {
    for (const item of rawOptions) {
      const option = asObject(item)
      if (!option) continue
      const key = cleanText(option.key ?? option.value, 48)
      if (!key || !allowedKeys.has(key)) continue
      optionHints.push({
        key,
        label: cleanText(option.label, 28),
        description: cleanText(option.description, 80),
      })
      if (optionHints.length >= 6) break
    }
  }

  return {
    family,
    title: cleanText(object.title, 36),
    message: cleanText(object.message, 160),
    submitLabel: cleanText(object.submitLabel, 24),
    optionHints,
  }
}

function summarizeSlots(slots: AgentAnalysisSlots) {
  return {
    category: slots.matter?.category || 'general',
    focus: slots.matter?.focus || [],
    hasPeople: slots.people.length > 0,
    people: slots.people.map(person => person.name),
    askedTime: slots.askedTime
      ? {
          label: slots.askedTime.label,
          confidence: slots.askedTime.confidence,
          granularity: slots.askedTime.granularity,
        }
      : null,
    outputDepth: slots.outputDepth || null,
  }
}

export async function planAgentCardWithLLM(
  input: AgentCardPlanningInput,
  opts: { signal?: AbortSignal } = {},
): Promise<AgentCardPlan | null> {
  if (!process.env.DEEPSEEK_API_KEY) return null
  try {
    const result = await callLLMTextWithUsage(
      [
        {
          role: 'system',
          content: `你是卜卜象 Agent 的卡片文案规划器。你只能输出 JSON，不要解释。

输出格式：
{"family":"daily_decision|short_trend|long_trend|focus|depth|profile|none","title":"短标题","message":"一句自然说明","submitLabel":"按钮文案","optionHints":[{"key":"白名单key","label":"选项文案","description":"选项说明"}]}

硬性规则：
- 只生成卡片族、标题、说明和选项文案建议。
- 不要生成表单 schema、日期、slot、params、draftSlots。
- option key 必须来自对应 family 的白名单。
- daily_decision keys: today, tomorrow, after_tomorrow, weekend。
- short_trend keys: future_7_days, future_30_days, future_3_months, rest_of_year。
- long_trend keys: current_time, future_12_months, future_3_years, future_5_years, rest_of_year。
- focus keys: focus_0, focus_1, focus_2, focus_3。
- depth keys: concise, balanced, detailed。
- 文案要像卜卜象，但保持简短、清楚、可执行。`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            latestText: input.latestText,
            pendingKind: input.pendingKind,
            deterministicTitle: input.deterministicTitle || null,
            deterministicMessage: input.deterministicMessage || null,
            slots: summarizeSlots(input.slots),
          }),
        },
      ],
      'agent_planner',
      {
        signal: opts.signal,
        temperature: 0.2,
        maxTokens: 900,
        thinking: 'disabled',
        reasoningEffort: 'none',
      },
    )
    if (input.userId) {
      void recordLlmUsage({
        userId: input.userId,
        source: 'agent_planner',
        mode: 'agent',
        model: result.config.model,
        task: 'agent_planner',
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      })
    }
    return normalizeAgentCardPlan(parseJsonObject(result.text))
  } catch (error) {
    const aborted = !!(
      error &&
      typeof error === 'object' &&
      'name' in error &&
      String((error as any).name) === 'AbortError'
    )
    if (!aborted) console.warn('[agent-card-planner] failed; falling back to deterministic card', error)
    return null
  }
}
