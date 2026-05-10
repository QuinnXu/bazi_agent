import { callLLMWithTools, type LlmToolCall, type LlmToolDefinition } from '@/lib/llm'
import { recordLlmUsage } from '@/lib/token-usage'
import { hasClearFocusIntent, isLifetimeWealthQuestion, isPartnerArchetypeQuestion, parseAskedTime } from '@/lib/agent-slot-extractor'
import type { ChatFeatureContext, ChatParticipant } from '@/lib/chat-service'
import type {
  AgentAnalysisSlots,
  AgentMatterCategory,
  AgentMessage,
  AgentOutputDepth,
  AgentParticipant,
  AgentTimeRangeContext,
  PendingAgentStep,
} from '@/lib/agent-workflow-types'

export type AgentToolName =
  | 'agent_direct_chat'
  | 'agent_request_bazi_profile'
  | 'agent_confirm_time_range'
  | 'agent_confirm_focus'
  | 'agent_select_depth'
  | 'agent_run_bazi_analysis'

export interface AgentToolDecision {
  name: AgentToolName
  arguments: Record<string, unknown>
  callId?: string
  content?: string
  rawToolCall?: LlmToolCall
}

export interface AgentToolPlanningInput {
  userId?: string
  latestText: string
  messages: AgentMessage[]
  pendingConfirmation?: PendingAgentStep | null
  selectedProfile?: AgentParticipant | null
  participants?: ChatParticipant[]
  timeRanges?: AgentTimeRangeContext[]
  sessionSummary?: string | null
  featureContext?: ChatFeatureContext
  baziAnalysisResult?: string | null
}

const TOOL_NAMES: AgentToolName[] = [
  'agent_direct_chat',
  'agent_request_bazi_profile',
  'agent_confirm_time_range',
  'agent_confirm_focus',
  'agent_select_depth',
  'agent_run_bazi_analysis',
]

const CATEGORY_VALUES: AgentMatterCategory[] = [
  'fortune',
  'relationship',
  'lifepath',
  'event',
  'avatar',
  'general',
]

const DEPTH_VALUES: Exclude<AgentOutputDepth, 'chat'>[] = ['concise', 'balanced', 'detailed']
const SELF_NAMES = new Set(['我', '本人', '自己', '当前命主', '用户', '命主'])

function objectSchema(properties: Record<string, unknown>, required: string[] = []) {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required,
  }
}

const commonProperties = {
  reason: {
    type: 'string',
    description: '简短说明为什么选择这个工具。',
  },
  sourceIntent: {
    type: 'string',
    description: '用户原始分析意图，后续恢复 workflow 时使用。',
  },
  category: {
    type: 'string',
    enum: CATEGORY_VALUES,
    description: '问题类型。',
  },
  focus: {
    type: 'array',
    items: { type: 'string' },
    description: '用户已经明确的分析重点。',
  },
}

export const AGENT_TOOL_DEFINITIONS: LlmToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'agent_direct_chat',
      description: '用于普通闲聊、解释已有结论、用户明确要求不要报告/不要推演/像聊天一样说，或人物上下文已足够且问题具体、边界清楚、适合几段话直接回答的情况。不会发卡片，也不会执行报告分析。',
      parameters: objectSchema({
        reason: commonProperties.reason,
      }, ['reason']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agent_request_bazi_profile',
      description: '当用户想做命盘/合盘/运势/事业财运等结构化分析，但缺少当前命主或某个被提到人物的八字资料时调用。调用后后端会向用户发八字资料卡片。',
      parameters: objectSchema({
        ...commonProperties,
        profileName: {
          type: 'string',
          description: '缺少资料的人物名。当前命主缺资料时可填“我”；关系对象缺资料时填对象名字。',
        },
      }, ['reason', 'profileName']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agent_confirm_time_range',
      description: '仅当结构化分析缺少时间范围，或用户说了“最近/未来/以后/这段时间/什么时候”等需要确认语义的时间词时调用。今天、明天、后天、具体日期、用户已添加时间段都不需要用这个工具确认。',
      parameters: objectSchema({
        ...commonProperties,
        timeText: {
          type: 'string',
          description: '用户提到的自然语言时间范围，例如“最近”“未来三个月”“今年”。没有就留空。',
        },
      }, ['reason']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agent_confirm_focus',
      description: '当用户想做结构化分析但重点过宽，应该先让用户选择事业、财富、感情、整体等分析重点时调用。调用后后端会发重点选择卡片。',
      parameters: objectSchema({
        ...commonProperties,
      }, ['reason']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agent_select_depth',
      description: '当请求明确要报告/深度/完整分析，或属于长期、宏观、多维、较长需求，且人物、时间、重点基本齐全但还没选择报告长度时调用。调用后后端会发报告深度选择卡片。',
      parameters: objectSchema({
        ...commonProperties,
      }, ['reason']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'agent_run_bazi_analysis',
      description: '当结构化报告所需的人物、时间、重点、报告深度都已具备时调用。后端会进入现有 Agent 分析生成流程。',
      parameters: objectSchema({
        ...commonProperties,
        timeText: {
          type: 'string',
          description: '已明确的时间范围文本。',
        },
        depth: {
          type: 'string',
          enum: DEPTH_VALUES,
          description: '用户已明确的报告深度。',
        },
      }, ['reason']),
    },
  },
]

export function isAgentToolName(value: string): value is AgentToolName {
  return TOOL_NAMES.includes(value as AgentToolName)
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function safeParseObject(text: string): Record<string, unknown> {
  if (!text.trim()) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 6)
}

function coerceCategory(value: unknown): AgentMatterCategory | null {
  const text = stringValue(value)
  return CATEGORY_VALUES.includes(text as AgentMatterCategory)
    ? text as AgentMatterCategory
    : null
}

function coerceDepth(value: unknown): Exclude<AgentOutputDepth, 'chat'> | null {
  const text = stringValue(value)
  return DEPTH_VALUES.includes(text as Exclude<AgentOutputDepth, 'chat'>)
    ? text as Exclude<AgentOutputDepth, 'chat'>
    : null
}

function cloneSlots(slots: AgentAnalysisSlots): AgentAnalysisSlots {
  return JSON.parse(JSON.stringify(slots))
}

function summarizeProfiles(input: AgentToolPlanningInput) {
  const profiles = [
    ...(input.selectedProfile ? [input.selectedProfile] : []),
    ...(input.participants || []),
  ]
  const seen = new Set<string>()
  return profiles
    .filter(profile => profile?.name?.trim())
    .map(profile => {
      const id = 'id' in profile ? profile.id || null : null
      return {
        id,
        name: profile.name,
        hasBazi: !!(profile.baziText?.trim() || profile.pillars?.trim()),
        isSelected: !!input.selectedProfile && profile.name === input.selectedProfile.name,
      }
    })
    .filter(profile => {
      const key = profile.id ? `id:${profile.id}` : `name:${profile.name}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function toolPlannerMessages(input: AgentToolPlanningInput) {
  return [
    {
      role: 'system',
      content: `你是卜卜象 Agent 的后端工具路由器。你只能通过 OpenAI tool calling 选择一个工具，不要直接回答用户。

决策规则：
1. 用户明确要闲聊、简单说、不要报告、不要推演、解释已有内容时，调用 agent_direct_chat。
2. 用户的问题具体、边界清楚、人物上下文已足够，且几段话就能有效回答时，调用 agent_direct_chat，例如某天适不适合行动、近期状态提醒、单个选择建议。
3. 用户明确要报告/详细/深度/完整/全面/展开/研究，或问题较长、多段、多主题、长期/宏观/需要结构化章节时，不要直聊；先检查缺什么并进入报告流程。
4. 用户要做八字/命盘/合盘/运势/事业财运/感情/人生脉络等结构化分析时，如果属于宏观或报告型需求，不要直聊；先检查缺什么。
5. 缺当前命主或被提到人物的八字资料，调用 agent_request_bazi_profile。
6. 只有时间缺失或时间词含糊时，才调用 agent_confirm_time_range，例如“最近/未来/以后/这段时间/什么时候/哪段时间”。如果用户说的是今天/明天/后天/本周X/周末/具体日期，或已经添加时间段，不要为了确认时间再调用时间卡。
7. 分析重点太宽且用户没说重点，调用 agent_confirm_focus。用户已说财运/财富/暴富/发财/搞钱/赚钱/事业/感情等明确重点时，不要调用 agent_confirm_focus。
8. 只剩报告长度未定，且这是报告型需求时，调用 agent_select_depth。
9. 报告型需求的人物、时间、重点、深度都足够时，调用 agent_run_bazi_analysis。
10. 不要把用户询问的运势时间误当出生日期；出生资料只能在用户明确提供出生年月日时用于资料卡预填。
11. “此生/这一生/什么时候能暴富/发财”是人生财富窗口，不要要求用户改选未来 30 天/3 个月/今年；如果当前命主已存在，通常只需要选择深度或直接分析。
12. “适合和谁/哪类人一起搞钱/合伙赚钱”是合作对象画像，不是缺少具体第二个人；不要调用 agent_request_bazi_profile 补“谁”的八字。
13. 轻量日常择日问题，例如“我今天适合出门吗/明天适合签约吗”，且没有要求报告、详细分析、深度推演时，调用 agent_direct_chat，让主聊天结合已有命盘直接回答。
14. pendingConfirmation 不为空时，优先让既有 workflow 处理，除非用户明显改成闲聊。`,
    },
    {
      role: 'user',
      content: JSON.stringify({
        latestText: input.latestText,
        recentMessages: input.messages.slice(-8),
        pendingConfirmation: input.pendingConfirmation
          ? {
              kind: input.pendingConfirmation.kind,
              taskKind: input.pendingConfirmation.taskKind || null,
              sourceIntent: input.pendingConfirmation.sourceIntent || null,
              missingInputs: input.pendingConfirmation.missingInputs || [],
            }
          : null,
        selectedProfile: input.selectedProfile
          ? {
              name: input.selectedProfile.name,
              hasBazi: !!(input.selectedProfile.baziText?.trim() || input.selectedProfile.pillars?.trim() || input.baziAnalysisResult?.trim()),
            }
          : null,
        profiles: summarizeProfiles(input),
        timeRanges: input.timeRanges || [],
        sessionSummary: input.sessionSummary || null,
        featureContext: input.featureContext
          ? {
              kind: input.featureContext.kind,
              summary: input.featureContext.summary,
              matter: input.featureContext.matter,
              timeRange: input.featureContext.timeRange,
            }
          : null,
      }),
    },
  ]
}

function createPlannerSignal(signal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const timeoutMs = readPositiveInt('AGENT_TOOL_CALL_TIMEOUT_MS', 10000)
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

export async function selectAgentToolWithLLM(
  input: AgentToolPlanningInput,
  opts: { signal?: AbortSignal } = {},
): Promise<AgentToolDecision | null> {
  if (!process.env.DEEPSEEK_API_KEY) return null

  const plannerSignal = createPlannerSignal(opts.signal)
  try {
    const response = await callLLMWithTools(
      toolPlannerMessages(input),
      'agent_planner',
      {
        tools: AGENT_TOOL_DEFINITIONS,
        toolChoice: 'required',
        parallelToolCalls: false,
        signal: plannerSignal.signal,
        temperature: 0,
        maxTokens: 700,
        thinking: 'disabled',
        reasoningEffort: 'none',
      },
    )
    if (input.userId) {
      // Fire-and-forget; recordLlmUsage swallows its own errors.
      void recordLlmUsage({
        userId: input.userId,
        source: 'agent_planner',
        mode: 'agent',
        model: response.config.model,
        task: 'agent_planner',
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
      })
    }
    const call = response.toolCalls[0]
    if (!call || !isAgentToolName(call.function.name)) return null
    return {
      name: call.function.name,
      arguments: safeParseObject(call.function.arguments),
      callId: call.id,
      content: response.content,
      rawToolCall: call,
    }
  } catch (error) {
    const aborted = !!(
      error &&
      typeof error === 'object' &&
      'name' in error &&
      String((error as any).name) === 'AbortError'
    )
    if (aborted) {
      console.warn('[agent-tools] tool planner timed out; falling back to rules')
    } else {
      console.warn('[agent-tools] tool planner failed; falling back to rules', error)
    }
    return null
  } finally {
    plannerSignal.cleanup()
  }
}

export function applyAgentToolDecisionToSlots(
  slots: AgentAnalysisSlots,
  decision: AgentToolDecision,
  input: {
    latestText: string
    timeRanges?: AgentTimeRangeContext[]
  },
): AgentAnalysisSlots {
  const next = cloneSlots(slots)
  const args = decision.arguments
  const localLifetimeWealth = isLifetimeWealthQuestion(input.latestText)
  const localPartnerArchetype = isPartnerArchetypeQuestion(input.latestText)
  const category = localLifetimeWealth || localPartnerArchetype
    ? 'lifepath'
    : coerceCategory(args.category) || next.matter?.category || 'general'
  const sourceIntent = stringValue(args.sourceIntent) || next.matter?.raw || input.latestText
  const focus = stringArray(args.focus)
  const reason = stringValue(args.reason)
  const preserveLocalFocus = hasClearFocusIntent(input.latestText) || localLifetimeWealth || localPartnerArchetype

  next.matter = {
    raw: sourceIntent,
    category,
    focus: focus.length > 0 ? focus : (next.matter?.focus || []),
    analysisMode: decision.name === 'agent_direct_chat' ? 'chat' : 'analysis',
    confidence: 'high',
  }
  next.confidence.matter = 'high'

  if (reason) {
    next.supplements = [
      ...next.supplements,
      `工具路由依据：${reason}`,
    ]
  }

  const timeText = stringValue(args.timeText)
  if (timeText) {
    const askedTime = parseAskedTime(timeText, input.timeRanges, category)
    if (askedTime) {
      next.askedTime = {
        ...askedTime,
        confidence: decision.name === 'agent_confirm_time_range' && askedTime.confidence !== 'high'
          ? 'medium'
          : askedTime.confidence,
      }
      next.confidence.time = next.askedTime.confidence
    }
  }

  if (decision.name === 'agent_request_bazi_profile') {
    const profileName = stringValue(args.profileName)
    next.people = []
    if (profileName && !SELF_NAMES.has(profileName)) {
      next.mentionedNames = [profileName]
      next.unresolvedNames = [profileName]
      next.confidence.people = 'medium'
    } else {
      next.confidence.people = 'none'
    }
  }

  if (decision.name === 'agent_confirm_time_range' && !next.askedTime) {
    next.confidence.time = 'none'
  }

  if (decision.name === 'agent_confirm_focus' && !preserveLocalFocus && focus.length === 0) {
    if (next.matter) next.matter.focus = []
    next.confidence.matter = 'high'
  }

  if (decision.name === 'agent_select_depth') {
    next.outputDepth = null
    next.confidence.depth = 'none'
  }

  const depth = coerceDepth(args.depth)
  if (decision.name === 'agent_run_bazi_analysis' && depth) {
    next.outputDepth = depth
    next.confidence.depth = 'high'
  }

  return next
}
