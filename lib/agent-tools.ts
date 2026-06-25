import { callLLMWithTools, type LlmToolCall, type LlmToolDefinition } from '@/lib/llm'
import { recordLlmUsage } from '@/lib/token-usage'
import { hasClearFocusIntent, isLifetimeWealthQuestion, isPartnerArchetypeQuestion, parseAskedTime } from '@/lib/agent-slot-extractor'
import type { ChatFeatureContext, ChatParticipant } from '@/lib/chat-service'
import { buildAgentToolRouterPrompt } from '@/lib/bubu-content'
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
          description: '缺少资料的人物名。兼容旧字段；如果缺多个具体人物，优先使用 profileNames。',
        },
        profileNames: {
          type: 'array',
          items: { type: 'string' },
          description: '缺少资料的具体人物名列表。多人合盘/合作问题里一次列出所有缺资料的人物。',
        },
      }, ['reason']),
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
      content: buildAgentToolRouterPrompt(),
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
    const requestedNames = Array.from(new Set([
      ...stringArray(args.profileNames),
      ...(profileName ? [profileName] : []),
    ].filter(name => !SELF_NAMES.has(name))))
    const existingUnresolved = (next.unresolvedNames || []).filter(name => !SELF_NAMES.has(name))
    const unresolvedNames = existingUnresolved.length > 0 ? existingUnresolved : requestedNames
    if (unresolvedNames.length > 0) {
      next.mentionedNames = Array.from(new Set([
        ...(next.mentionedNames || []),
        ...unresolvedNames,
      ]))
      next.unresolvedNames = unresolvedNames
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
