import {
  runClassicChatStream,
  type ChatFeatureContext,
  type ChatParticipant,
} from '@/lib/chat-service'
import {
  getAgentReportPreferenceLabel,
  normalizeAgentComplexityMode,
  normalizeAgentReportPreference,
  type AgentComplexityMode,
  type AgentReportPreference,
} from '@/lib/agent-complexity'
import { runAgentAnalysisStream } from '@/lib/agent-analysis-runner'
import {
  normalizeAgentCardPlan,
  planAgentCardWithLLM,
  type AgentCardPlan,
  type AgentCardPlanningInput,
} from '@/lib/agent-card-planner'
import { extractAgentCorrectionWithLLM } from '@/lib/agent-correction-extractor'
import { buildCalendarContext } from '@/lib/agent-prompt-builder'
import {
  applyAgentToolDecisionToSlots,
  selectAgentToolWithLLM,
  type AgentToolDecision,
  type AgentToolPlanningInput,
} from '@/lib/agent-tools'
import {
  applyPendingAnswer,
  planNextQuestion,
  type AgentQuestionResponseMode,
} from '@/lib/agent-question-planner'
import {
  buildInitialSlots,
  extractPersonCorrection,
  hasAgentCorrectionSignal,
  hasAnalysisIntent,
  isDateChoiceQuestion,
  isLightweightDailyDecisionQuestion,
  isLifetimeWealthQuestion,
  isPartnerArchetypeQuestion,
  isPlainChatRequest,
  latestUserText,
} from '@/lib/agent-slot-extractor'
import {
  contextProfiles,
  resolveCurrentProfile,
  resolveSlots,
} from '@/lib/agent-slot-resolver'
import {
  sanitizeReplacementChars,
  takeSemanticStreamChunk,
} from '@/lib/text-sanitize'
import {
  BUBU_COPY,
  buildAgentDirectAnswerGuidance,
  buildAgentEarlierContextSummary,
  buildAgentReportStyleHint,
  buildAgentSessionSummary,
} from '@/lib/bubu-content'
import type {
  AgentAnalysisRequest,
  AgentAnalysisSlots,
  AgentBaziFormData,
  AgentHumanInputRequestUiEvent,
  AgentMessage,
  AgentOutputDepth,
  AgentParticipant,
  AgentTimeRangeContext,
  AgentWorkflowCorrection,
  PendingAgentStep,
} from '@/lib/agent-workflow-types'

export type { AgentMessage, AgentBaziFormData, AgentTimeRangeContext }
export type AgentPendingConfirmation = PendingAgentStep

const AGENT_STREAM_DELAY_MS = 0
const AGENT_STREAM_MIN_CHARS = 4
const AGENT_STREAM_MAX_CHARS = 24
const MAX_MESSAGE_CHARS = 1600

type AgentResponseReason =
  | 'plain_chat'
  | 'specific_answer'
  | 'needs_clarifying_card'
  | 'explicit_report'
  | 'macro_report'
  | 'report_recommended'
  | 'active_report_workflow'

interface AgentResponsePolicy {
  mode: AgentQuestionResponseMode
  reason: AgentResponseReason
}

export interface AgentChatInput {
  userId: string
  messages: AgentMessage[]
  baziAnalysisResult?: string | null
  selectedProfile?: AgentParticipant | null
  participants?: ChatParticipant[]
  timeRanges?: AgentTimeRangeContext[]
  reportPreference?: AgentReportPreference | null
  sessionSummary?: string | null
  pendingConfirmation?: AgentPendingConfirmation | null
  featureContext?: ChatFeatureContext
  complexity?: AgentComplexityMode
  maxSteps?: number
  timeoutMs?: number
  signal?: AbortSignal
}

export interface AgentTraceEvent {
  step: number
  action: string
  ok: boolean
  detail?: string
  elapsedMs: number
}

export interface AgentProgressEvent {
  step: number
  phase: 'planner' | 'tool' | 'final' | 'fallback'
  status: 'running' | 'completed' | 'failed'
  title: string
  detail?: string
  elapsedMs: number
}

export interface AgentBaziFormUiEvent {
  type: 'bazi_profile_form'
  message: string
  initialData: AgentBaziFormData
}

export type AgentStreamEvent =
  | { type: 'progress'; progress: AgentProgressEvent }
  | { type: 'trace'; trace: AgentTraceEvent }
  | { type: 'ui'; ui: AgentBaziFormUiEvent | AgentHumanInputRequestUiEvent }
  | { type: 'delta'; content: string }
  | {
      type: 'done'
      trace: AgentTraceEvent[]
      pendingConfirmation?: AgentPendingConfirmation | null
      featureContext?: (ChatFeatureContext & { participants?: ChatParticipant[] }) | null
    }
  | { type: 'error'; message: string }

export interface AgentChatResult {
  stream: ReadableStream
  trace: AgentTraceEvent[]
}

export interface AgentRuntimeDeps {
  directChat?: (
    input: AgentChatInput,
    opts: { signal?: AbortSignal },
  ) => Promise<string | ReadableStream>
  runAnalysisStream?: (
    input: {
      userId: string
      request: AgentAnalysisRequest
      complexity?: AgentComplexityMode | null
    },
    opts: { signal?: AbortSignal },
  ) => Promise<ReadableStream | string>
  extractCorrection?: (
    input: {
      userId?: string
      latestText: string
      pendingConfirmation: AgentPendingConfirmation
      selectedProfile?: AgentParticipant | null
      participants?: ChatParticipant[]
    },
    opts: { signal?: AbortSignal },
  ) => Promise<AgentWorkflowCorrection | null>
  selectTool?: (
    input: AgentToolPlanningInput,
    opts: { signal?: AbortSignal },
  ) => Promise<AgentToolDecision | null>
  planCard?: (
    input: AgentCardPlanningInput,
    opts: { signal?: AbortSignal },
  ) => Promise<AgentCardPlan | unknown | null>
}

function truncateText(text: string | null | undefined, max: number): string {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}\n...（已截断）` : text
}

function debugLog(
  userId: string,
  label: string,
  payload?: Record<string, unknown>,
) {
  const suffix = payload ? ` ${JSON.stringify(payload)}` : ''
  console.log(`[agent][${userId.slice(0, 8)}] ${label}${suffix}`)
}

function traceEvent(
  trace: AgentTraceEvent[],
  event: Omit<AgentTraceEvent, 'elapsedMs'> & { elapsedMs?: number },
): AgentStreamEvent {
  const item: AgentTraceEvent = {
    ...event,
    elapsedMs: event.elapsedMs ?? 0,
  }
  trace.push(item)
  return { type: 'trace', trace: item }
}

function progressEvent(
  startedAt: number,
  event: Omit<AgentProgressEvent, 'elapsedMs'>,
): AgentStreamEvent {
  return {
    type: 'progress',
    progress: {
      ...event,
      elapsedMs: Date.now() - startedAt,
    },
  }
}

async function* streamTextEvents(text: string): AsyncGenerator<AgentStreamEvent> {
  let rest = sanitizeReplacementChars(text)
  while (rest.length > 0) {
    const chunk = takeSemanticStreamChunk(rest, {
      minChars: AGENT_STREAM_MIN_CHARS,
      maxChars: AGENT_STREAM_MAX_CHARS,
    }) || rest
    rest = rest.slice(chunk.length)
    yield { type: 'delta', content: chunk }
    if (AGENT_STREAM_DELAY_MS > 0) {
      await new Promise(resolve => setTimeout(resolve, AGENT_STREAM_DELAY_MS))
    }
  }
}

function textToStream(text: string, opts: { dripDelayMs?: number } = {}): ReadableStream {
  const encoder = new TextEncoder()
  const delay = opts.dripDelayMs ?? AGENT_STREAM_DELAY_MS
  return new ReadableStream({
    async start(controller) {
      let rest = sanitizeReplacementChars(text)
      while (rest.length > 0) {
        const chunk = takeSemanticStreamChunk(rest, {
          minChars: AGENT_STREAM_MIN_CHARS,
          maxChars: AGENT_STREAM_MAX_CHARS,
        }) || rest
        rest = rest.slice(chunk.length)
        controller.enqueue(encoder.encode(chunk))
        if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))
      }
      controller.close()
    },
  })
}

async function* streamReadableEvents(
  stream: ReadableStream,
): AsyncGenerator<AgentStreamEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = sanitizeReplacementChars(decoder.decode(value, { stream: true }))
    if (chunk) yield { type: 'delta', content: chunk }
  }
  const tail = sanitizeReplacementChars(decoder.decode())
  if (tail) yield { type: 'delta', content: tail }
}

function normalizeMessages(messages: AgentMessage[]): AgentMessage[] {
  const safe = messages
    .filter(message => message && ['user', 'assistant', 'system'].includes(message.role))
    .map(message => ({
      role: message.role,
      content: truncateText(String(message.content || ''), MAX_MESSAGE_CHARS),
    }))
  const recent = safe.slice(-16)
  const older = safe.slice(0, -16)
  if (older.length === 0) return recent
  const summary = older
    .map(message => `${message.role}: ${truncateText(message.content, 220)}`)
    .join('\n')
  return [
    {
      role: 'system',
      content: buildAgentEarlierContextSummary(truncateText(summary, 2400)),
    },
    ...recent,
  ]
}

function fastLocalAnswer(input: AgentChatInput): string | null {
  const latest = latestUserText(input.messages).trim()
  if (!latest) return null
  const compact = latest.replace(/[\s。！？!?,，～~.]/g, '').toLowerCase()
  if (/^(你好|您好|嗨|hi|hello|在吗|早上好|下午好|晚上好)$/.test(compact)) {
    return BUBU_COPY.agentService.fastHello
  }
  if (/^(谢谢|感谢|多谢|thx|thanks)$/.test(compact)) {
    return BUBU_COPY.agentService.fastThanks
  }
  return null
}

async function openDirectChatStream(
  input: AgentChatInput,
  deps: AgentRuntimeDeps,
  signal?: AbortSignal,
): Promise<ReadableStream> {
  if (deps.directChat) {
    const result = await deps.directChat(input, { signal })
    return typeof result === 'string' ? textToStream(result, { dripDelayMs: 0 }) : result
  }

  const currentProfile = resolveCurrentProfile(input)
  const summaryMessages: AgentMessage[] = []
  if (input.sessionSummary) {
    summaryMessages.push({
      role: 'system',
      content: buildAgentSessionSummary(truncateText(input.sessionSummary, 1600)),
    })
  }

  const { stream } = await runClassicChatStream(
    {
      userId: input.userId,
      messages: [
        ...summaryMessages,
        ...normalizeMessages(input.messages),
      ],
      baziAnalysisResult: currentProfile?.baziText || input.baziAnalysisResult || null,
      useUltraMode: false,
      participants: contextProfiles(input),
      featureContext: input.featureContext,
      complexity: effectiveAgentComplexity(input),
    },
    { signal },
  )
  return stream
}

function effectiveAgentComplexity(input: AgentChatInput): AgentComplexityMode {
  return normalizeAgentComplexityMode(
    input.pendingConfirmation?.executionProfile?.complexity || input.complexity,
  )
}

function effectiveReportPreference(input: AgentChatInput): AgentReportPreference | null {
  return input.reportPreference || input.pendingConfirmation?.executionProfile?.reportPreference || null
}

function reportPreferenceToDepth(
  preference?: AgentReportPreference | null,
): Exclude<AgentOutputDepth, 'chat'> | null {
  const normalized = normalizeAgentReportPreference(preference)
  if (!normalized) return null
  if (normalized.mode === 'concise') return 'concise'
  if (normalized.mode === 'detailed') return 'detailed'
  return 'balanced'
}

function finalizeDepth(
  slots: AgentAnalysisSlots,
  input: AgentChatInput,
): AgentAnalysisSlots {
  if (slots.outputDepth) return slots
  const depth = reportPreferenceToDepth(effectiveReportPreference(input))
  if (!depth) return slots
  return {
    ...slots,
    outputDepth: depth,
    confidence: {
      ...slots.confidence,
      depth: 'high',
    },
  }
}

function isPendingOptionTurn(pending: AgentPendingConfirmation | null | undefined, latest: string): boolean {
  if (!pending) return false
  if (hasAgentCorrectionSignal(latest)) return true
  if (/已创建八字人物|生成.*命盘|确认|选择|报告长度|分析重点|时间范围/.test(latest)) return true
  return (pending.field?.options || []).some(option => latest.includes(String(option.label || '')))
}

function compactOneLine(text: string, max = 420): string {
  return truncateText(text.replace(/\s+/g, ' ').trim(), max)
}

function buildAgentFeatureContext(
  request: AgentAnalysisRequest,
  content: string,
): ChatFeatureContext & { participants?: ChatParticipant[] } {
  const names = request.slots.people.map(person => person.name).filter(Boolean).join('、') || '未命名人物'
  const time = request.slots.askedTime
    ? `${request.slots.askedTime.start} ~ ${request.slots.askedTime.end}`
    : '当下语境'
  const focus = request.slots.matter?.focus?.join('、') || request.slots.matter?.category || '综合'
  return {
    kind: 'agent_analysis',
    summary: `Agent 分析 · 人物：${names}；时间：${time}；重点：${focus}。核心结论：${compactOneLine(content)}`,
    people: request.slots.people,
    timeRange: request.slots.askedTime
      ? {
          label: request.slots.askedTime.label,
          start: request.slots.askedTime.start,
          end: request.slots.askedTime.end,
        }
      : null,
    matter: request.slots.matter?.raw || request.userQuestion,
    participants: request.slots.people.map(person => ({
      name: person.name,
      baziText: person.baziText,
      pillars: person.pillars,
    })),
  }
}

function buildAnalysisRequest(
  input: AgentChatInput,
  slots: AgentAnalysisSlots,
  sourceText: string,
): AgentAnalysisRequest {
  const depth = (slots.outputDepth && slots.outputDepth !== 'chat'
    ? slots.outputDepth
    : 'balanced') as Exclude<AgentOutputDepth, 'chat'>
  const calendar = buildCalendarContext(slots)
  const preference = effectiveReportPreference(input)
  const customInstruction = normalizeAgentReportPreference(preference)?.customInstruction || null
  return {
    slots,
    calendar,
    depth,
    userQuestion: slots.matter?.raw || sourceText,
    conversationSummary: input.sessionSummary || input.featureContext?.summary || null,
    promptStyleHint: customInstruction
      ? customInstruction
      : buildAgentReportStyleHint(getAgentReportPreferenceLabel(preference)),
  }
}

async function openAnalysisStream(
  input: AgentChatInput,
  deps: AgentRuntimeDeps,
  request: AgentAnalysisRequest,
): Promise<ReadableStream> {
  if (deps.runAnalysisStream) {
    const result = await deps.runAnalysisStream(
      { userId: input.userId, request, complexity: effectiveAgentComplexity(input) },
      { signal: input.signal },
    )
    return typeof result === 'string' ? textToStream(result, { dripDelayMs: 0 }) : result
  }
  const result = await runAgentAnalysisStream(
    { userId: input.userId, request, complexity: effectiveAgentComplexity(input) },
    { signal: input.signal },
  )
  return result.stream
}

function shouldDirectChat(input: AgentChatInput, latest: string): boolean {
  if (!latest.trim()) return true
  if (input.pendingConfirmation && isPendingOptionTurn(input.pendingConfirmation, latest)) return false
  if (isPlainChatRequest(latest)) return true
  if (textSuggestsReportFlow(input, latest)) return false
  const canAnswerDirectly = isLightweightDailyDecisionQuestion(latest) || (
    isBoundedDirectAnswerText(latest) && !isDateChoiceQuestion(latest)
  )
  if (canAnswerDirectly && !hasRelationshipCounterpartyCue(latest) && hasDirectChatProfileContext(input)) return true
  if (input.featureContext && /(继续|展开|详细说|第[一二三四五六七八九十0-9]+点|行动清单|怎么做|什么意思|总结|接着|那.*呢)/.test(latest)) {
    return true
  }
  return !hasAnalysisIntent(latest)
}

function hasDirectChatProfileContext(input: AgentChatInput): boolean {
  const currentProfile = resolveCurrentProfile(input)
  if (currentProfile?.baziText?.trim() || currentProfile?.pillars?.trim()) return true
  if (input.baziAnalysisResult?.trim()) return true
  return (input.participants || []).some(profile => !!(profile.baziText?.trim() || profile.pillars?.trim()))
}

function compactIntentText(text: string): string {
  return text.replace(/\s+/g, '')
}

function hasExplicitReportRequest(text: string): boolean {
  const compact = compactIntentText(text)
  return /报告|深度|详细|完整|全面|展开|研究|长一点|细一点|长报告|系统性|结构化|推演/.test(compact)
}

function hasLongHorizonCue(text: string): boolean {
  const compact = compactIntentText(text)
  return /未来几年|接下来几年|近几年|后面几年|未来[一二两三四五六七八九十\d]+年|接下来[一二两三四五六七八九十\d]+年|今年|全年|长期|大运|流年|人生|此生|一生|这一生|这辈子|阶段|窗口|整体|综合|全局/.test(compact)
}

function countMonths(start?: string, end?: string): number {
  if (!start || !end) return 0
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0
  return (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()) + 1
}

function hasLongHorizonSlots(slots: AgentAnalysisSlots): boolean {
  const label = slots.askedTime?.label || ''
  if (/未来\s*[三四五六七八九十\d]+\s*年|未来几年|接下来几年|今年全年|全年|长期|大运|人生/.test(label)) return true
  return countMonths(slots.askedTime?.start, slots.askedTime?.end) >= 10
}

function hasMacroReportShape(text: string, slots?: AgentAnalysisSlots): boolean {
  if (isLifetimeWealthQuestion(text) || isPartnerArchetypeQuestion(text)) return true
  if (hasLongHorizonCue(text)) return true
  if (slots?.matter?.category === 'lifepath') return true
  if (slots?.matter?.category === 'relationship' && /合盘|关系|相处|缘分|婚姻|长期|今年|未来|如何|怎么样/.test(text)) return true
  if (slots && hasLongHorizonSlots(slots)) return true
  return false
}

function hasMultiPartReportShape(text: string, slots?: AgentAnalysisSlots): boolean {
  const compact = compactIntentText(text)
  const focusCount = slots?.matter?.focus?.length || 0
  if (compact.length >= 90) return true
  if (focusCount >= 3) return true
  if (compact.length >= 52 && /(同时|另外|再看|顺便|以及|并且|分别|还想|也想|多个|几个|第一|第二)/.test(compact)) return true
  if (focusCount >= 2 && /(整体|综合|分别|对比|规划|策略|行动|时间线|窗口|路线|地图)/.test(compact)) return true
  return false
}

function textSuggestsReportFlow(input: AgentChatInput, text: string): boolean {
  return !!effectiveReportPreference(input) ||
    hasExplicitReportRequest(text) ||
    hasMacroReportShape(text) ||
    hasMultiPartReportShape(text)
}

function isBoundedDirectAnswerText(text: string): boolean {
  const compact = compactIntentText(text)
  if (hasExplicitReportRequest(compact) || hasLongHorizonCue(compact)) return false
  if (isDateChoiceQuestion(compact)) return true
  if (/(今天|明天|后天|本周|这周|周末|最近|近期|这几天|这个月|本月|下个月|未来30天|未来一个月).{0,20}(状态|怎么样|如何|注意|提醒|建议|适合|要不要|能不能|可不可以|好不好|怎么办|怎么做)/.test(compact)) {
    return true
  }
  return /(要不要|适不适合|适合吗|合适吗|能不能|可不可以|行不行|好不好|注意什么|怎么做|怎么办|选哪个|哪一个)/.test(compact)
}

function hasRelationshipCounterpartyCue(text: string): boolean {
  const compact = compactIntentText(text)
  return /合盘|(?:我|本人|自己|当前命主).{0,4}(?:和|跟|与)|(?:和|跟|与).{1,18}(?:关系|相处|缘分|适合|合适|匹配|合不合|配不配)/.test(compact)
}

function shouldAskClarifyingCardBeforeDirect(
  slots: AgentAnalysisSlots,
  sourceText: string,
  toolDecision?: AgentToolDecision | null,
): boolean {
  const category = slots.matter?.category
  if ((category === 'fortune' || category === 'event') && !slots.askedTime && isDateChoiceQuestion(sourceText)) return true
  if (slots.askedTime?.confidence === 'medium' && isDateChoiceQuestion(sourceText)) return true
  return toolDecision?.name === 'agent_confirm_time_range' && isDateChoiceQuestion(sourceText)
}

function chooseAgentResponseMode(
  input: AgentChatInput,
  slots: AgentAnalysisSlots,
  sourceText: string,
  latest: string,
  toolDecision?: AgentToolDecision | null,
): AgentResponsePolicy {
  const intentText = sourceText || latest
  if (slots.matter?.analysisMode !== 'analysis') {
    return { mode: 'direct_answer', reason: 'plain_chat' }
  }
  if (input.pendingConfirmation?.kind === 'select_depth' || effectiveReportPreference(input)) {
    return { mode: 'report', reason: 'active_report_workflow' }
  }
  if (hasExplicitReportRequest(intentText)) {
    return { mode: 'report', reason: 'explicit_report' }
  }
  if (hasMacroReportShape(intentText, slots)) {
    return { mode: 'report', reason: 'macro_report' }
  }
  if (hasMultiPartReportShape(intentText, slots)) {
    return { mode: 'report', reason: 'report_recommended' }
  }
  if (shouldAskClarifyingCardBeforeDirect(slots, intentText, toolDecision)) {
    return { mode: 'ask_more', reason: 'needs_clarifying_card' }
  }
  return { mode: 'direct_answer', reason: 'specific_answer' }
}

function buildDirectAnswerInput(
  input: AgentChatInput,
  slots: AgentAnalysisSlots,
  sourceText: string,
  policy: AgentResponsePolicy,
): AgentChatInput {
  const people = slots.people.map(person => person.name).filter(Boolean).join('、') || '当前上下文人物'
  const time = slots.askedTime?.label || '用户问题里的自然时间语境'
  const focus = slots.matter?.focus?.join('、') || slots.matter?.category || '当前问题'
  const guidance: AgentMessage = {
    role: 'system',
    content: buildAgentDirectAnswerGuidance({
      reason: policy.reason,
      sourceText,
      people,
      time,
      focus,
    }),
  }
  return {
    ...input,
    pendingConfirmation: null,
    messages: [guidance, ...input.messages],
  }
}

function normalizeToolDecisionForQuestion(
  input: AgentChatInput,
  latest: string,
  decision: AgentToolDecision | null,
): AgentToolDecision | null {
  if (!decision) return null
  if (decision.name === 'agent_direct_chat' && textSuggestsReportFlow(input, latest)) {
    return {
      ...decision,
      name: 'agent_select_depth',
      arguments: {
        ...decision.arguments,
        reason: '用户需求更适合作为结构化报告处理；改走表单和报告流程。',
      },
    }
  }
  if (decision.name === 'agent_direct_chat') return decision
  const canAnswerDirectly = isLightweightDailyDecisionQuestion(latest) || (
    isBoundedDirectAnswerText(latest) && !isDateChoiceQuestion(latest)
  )
  if (!canAnswerDirectly || hasRelationshipCounterpartyCue(latest) || !hasDirectChatProfileContext(input)) return decision
  if (decision.name === 'agent_request_bazi_profile') return decision
  return {
    ...decision,
    name: 'agent_direct_chat',
    arguments: {
      reason: '用户问的是具体、边界清楚的问题，且未要求深度报告；改为结合命盘直接回答，避免不必要卡片。',
    },
  }
}

async function maybeExtractLiveCorrection(
  input: AgentChatInput,
  deps: AgentRuntimeDeps,
  latest: string,
): Promise<AgentWorkflowCorrection | null> {
  if (!input.pendingConfirmation) return null
  if (!hasAgentCorrectionSignal(latest)) return null
  if (extractPersonCorrection(latest)) return null
  if (deps.extractCorrection) {
    return deps.extractCorrection(
      {
        userId: input.userId,
        latestText: latest,
        pendingConfirmation: input.pendingConfirmation,
        selectedProfile: input.selectedProfile,
        participants: input.participants,
      },
      { signal: input.signal },
    )
  }
  return extractAgentCorrectionWithLLM({
    userId: input.userId,
    latestText: latest,
    pendingConfirmation: input.pendingConfirmation,
    selectedProfile: input.selectedProfile,
    participants: input.participants,
    signal: input.signal,
  })
}

async function maybeSelectAgentTool(
  input: AgentChatInput,
  deps: AgentRuntimeDeps,
  latest: string,
): Promise<AgentToolDecision | null> {
  if (input.pendingConfirmation) return null
  if (!deps.selectTool && !process.env.DEEPSEEK_API_KEY) return null
  const planningInput: AgentToolPlanningInput = {
    userId: input.userId,
    latestText: latest,
    messages: input.messages,
    pendingConfirmation: input.pendingConfirmation,
    selectedProfile: input.selectedProfile,
    participants: input.participants,
    timeRanges: input.timeRanges,
    sessionSummary: input.sessionSummary || null,
    featureContext: input.featureContext,
    baziAnalysisResult: input.baziAnalysisResult,
  }
  if (deps.selectTool) {
    return normalizeToolDecisionForQuestion(
      input,
      latest,
      await deps.selectTool(planningInput, { signal: input.signal }),
    )
  }
  return normalizeToolDecisionForQuestion(
    input,
    latest,
    await selectAgentToolWithLLM(planningInput, { signal: input.signal }),
  )
}

async function maybePlanAgentCard(
  input: AgentChatInput,
  deps: AgentRuntimeDeps,
  question: NonNullable<ReturnType<typeof planNextQuestion>>,
  slots: AgentAnalysisSlots,
  sourceText: string,
): Promise<AgentCardPlan | null> {
  if (question.pending.kind === 'create_profile') return null
  const planningInput: AgentCardPlanningInput = {
    userId: input.userId,
    latestText: sourceText,
    slots,
    pendingKind: question.pending.kind,
    deterministicTitle: question.ui.title,
    deterministicMessage: question.content,
  }
  if (deps.planCard) {
    return normalizeAgentCardPlan(await deps.planCard(planningInput, { signal: input.signal }))
  }
  return planAgentCardWithLLM(planningInput, { signal: input.signal })
}

export async function* runAgentChatEvents(
  input: AgentChatInput,
  deps: AgentRuntimeDeps = {},
): AsyncGenerator<AgentStreamEvent> {
  const startedAt = Date.now()
  const complexity = effectiveAgentComplexity(input)
  const trace: AgentTraceEvent[] = []
  const latest = latestUserText(input.messages)

  debugLog(input.userId, 'start', {
    messages: input.messages.length,
    selectedProfile: input.selectedProfile?.name || null,
    participants: input.participants?.map(p => p.name) || [],
    timeRanges: input.timeRanges?.map(range => range.label || `${range.start}~${range.end}`) || [],
    pending: input.pendingConfirmation?.kind || null,
    featureContext: input.featureContext?.kind || null,
    complexity,
  })

  const fastAnswer = fastLocalAnswer(input)
  if (fastAnswer) {
    yield traceEvent(trace, {
      step: 1,
      action: 'fast_answer',
      ok: true,
      detail: 'local_simple_chat',
      elapsedMs: Date.now() - startedAt,
    })
    yield progressEvent(startedAt, {
      step: 1,
      phase: 'final',
      status: 'running',
      title: BUBU_COPY.agentService.progress.fastAnswerRunning,
    })
    yield* streamTextEvents(fastAnswer)
    yield progressEvent(startedAt, {
      step: 1,
      phase: 'final',
      status: 'completed',
      title: BUBU_COPY.agentService.progress.fastAnswerDone,
    })
    yield { type: 'done', trace }
    return
  }

  let toolDecision: AgentToolDecision | null = null
  if (!input.pendingConfirmation && (deps.selectTool || process.env.DEEPSEEK_API_KEY)) {
    yield progressEvent(startedAt, {
      step: 1,
      phase: 'planner',
      status: 'running',
      title: BUBU_COPY.agentService.progress.planningTool,
      detail: BUBU_COPY.agentService.progress.planningToolDetail,
    })
    toolDecision = await maybeSelectAgentTool(input, deps, latest)
    if (toolDecision) {
      yield traceEvent(trace, {
        step: 1,
        action: `tool_call:${toolDecision.name}`,
        ok: true,
        detail: JSON.stringify(toolDecision.arguments),
        elapsedMs: Date.now() - startedAt,
      })
    }
    yield progressEvent(startedAt, {
      step: 1,
      phase: 'planner',
      status: 'completed',
      title: toolDecision ? BUBU_COPY.agentService.progress.toolPicked : BUBU_COPY.agentService.progress.rulePlanned,
      detail: toolDecision?.name,
    })
  }

  if (toolDecision?.name === 'agent_direct_chat' || (!toolDecision && shouldDirectChat(input, latest))) {
    yield traceEvent(trace, {
      step: 1,
      action: 'direct_chat',
      ok: true,
      detail: toolDecision ? `tool:${toolDecision.name}` : 'lightweight_chat',
      elapsedMs: Date.now() - startedAt,
    })
    yield progressEvent(startedAt, {
      step: 1,
      phase: 'final',
      status: 'running',
      title: BUBU_COPY.agentService.progress.directStart,
    })
    if (input.pendingConfirmation) {
      yield* streamTextEvents(BUBU_COPY.agentService.pendingAside)
    }
    const directStream = await openDirectChatStream(input, deps, input.signal)
    yield* streamReadableEvents(directStream)
    yield progressEvent(startedAt, {
      step: 1,
      phase: 'final',
      status: 'completed',
      title: BUBU_COPY.agentService.progress.directDone,
    })
    yield { type: 'done', trace, pendingConfirmation: input.pendingConfirmation || null }
    return
  }

  yield progressEvent(startedAt, {
    step: 1,
    phase: 'planner',
    status: 'running',
    title: BUBU_COPY.agentService.progress.collecting,
    detail: BUBU_COPY.agentService.progress.collectingDetail,
  })

  const liveCorrection = await maybeExtractLiveCorrection(input, deps, latest)
  const pendingSlots = applyPendingAnswer(input.pendingConfirmation, latest, liveCorrection)
  const sourceText = input.pendingConfirmation?.sourceIntent || latest
  const baseSlots = pendingSlots || buildInitialSlots({
    messages: input.messages,
    timeRanges: input.timeRanges,
    sessionSummary: input.sessionSummary || input.featureContext?.summary || null,
  })
  const initialSlots = !pendingSlots && toolDecision
    ? applyAgentToolDecisionToSlots(baseSlots, toolDecision, {
        latestText: sourceText,
        timeRanges: input.timeRanges,
      })
    : baseSlots
  const resolved = finalizeDepth(
    resolveSlots({
      slots: initialSlots,
      selectedProfile: input.selectedProfile,
      baziAnalysisResult: input.baziAnalysisResult,
      participants: input.participants,
      latestText: sourceText,
    }),
    input,
  )

  yield traceEvent(trace, {
    step: 1,
    action: 'extract_slots',
    ok: true,
    detail: JSON.stringify({
      people: resolved.people.map(person => person.name),
      time: resolved.askedTime?.label || null,
      matter: resolved.matter?.category || null,
      focus: resolved.matter?.focus || [],
      depth: resolved.outputDepth || null,
      tool: toolDecision?.name || null,
    }),
    elapsedMs: Date.now() - startedAt,
  })
  yield progressEvent(startedAt, {
    step: 1,
    phase: 'planner',
    status: 'completed',
    title: BUBU_COPY.agentService.progress.collected,
  })

  if (resolved.matter?.category === 'avatar') {
    const content = BUBU_COPY.agentService.avatarGuidance
    yield traceEvent(trace, {
      step: 2,
      action: 'avatar_guidance',
      ok: true,
      elapsedMs: Date.now() - startedAt,
    })
    yield progressEvent(startedAt, {
      step: 2,
      phase: 'final',
      status: 'running',
      title: BUBU_COPY.agentService.progress.avatarNeedsImage,
    })
    yield* streamTextEvents(content)
    yield progressEvent(startedAt, {
      step: 2,
      phase: 'final',
      status: 'completed',
      title: BUBU_COPY.agentService.progress.avatarGuidanceDone,
    })
    yield { type: 'done', trace }
    return
  }

  const responsePolicy = chooseAgentResponseMode(input, resolved, sourceText, latest, toolDecision)
  yield traceEvent(trace, {
    step: 1,
    action: `response_mode:${responsePolicy.mode}`,
    ok: true,
    detail: responsePolicy.reason,
    elapsedMs: Date.now() - startedAt,
  })

  let question = planNextQuestion(resolved, sourceText, null, { responseMode: responsePolicy.mode })
  if (question) {
    const cardPlan = await maybePlanAgentCard(input, deps, question, resolved, sourceText)
    if (cardPlan) {
      yield traceEvent(trace, {
        step: 2,
        action: `card_plan:${cardPlan.family}`,
        ok: true,
        detail: cardPlan.title || cardPlan.message || undefined,
        elapsedMs: Date.now() - startedAt,
      })
      question = planNextQuestion(resolved, sourceText, cardPlan, { responseMode: responsePolicy.mode }) || question
    }
    yield traceEvent(trace, {
      step: 2,
      action: `ask:${question.pending.kind}`,
      ok: true,
      elapsedMs: Date.now() - startedAt,
    })
    yield progressEvent(startedAt, {
      step: 2,
      phase: 'final',
      status: 'running',
      title: question.ui.title,
    })
    yield* streamTextEvents(question.content)
    yield { type: 'ui', ui: question.ui }
    yield progressEvent(startedAt, {
      step: 2,
      phase: 'final',
      status: 'completed',
      title: BUBU_COPY.agentService.progress.waitingChoice,
    })
    yield {
      type: 'done',
      trace,
      pendingConfirmation: question.pending,
    }
    return
  }

  if (responsePolicy.mode !== 'report') {
    yield traceEvent(trace, {
      step: 2,
      action: 'direct_answer',
      ok: true,
      detail: responsePolicy.reason,
      elapsedMs: Date.now() - startedAt,
    })
    yield progressEvent(startedAt, {
      step: 2,
      phase: 'final',
      status: 'running',
      title: BUBU_COPY.agentService.progress.directAnswer,
    })
    const directStream = await openDirectChatStream(
      buildDirectAnswerInput(input, resolved, sourceText, responsePolicy),
      deps,
      input.signal,
    )
    yield* streamReadableEvents(directStream)
    yield progressEvent(startedAt, {
      step: 2,
      phase: 'final',
      status: 'completed',
      title: BUBU_COPY.agentService.progress.directAnswerDone,
    })
    yield { type: 'done', trace, pendingConfirmation: null }
    return
  }

  const request = buildAnalysisRequest(input, resolved, sourceText)
  let fullContent = ''
  try {
    yield traceEvent(trace, {
      step: 2,
      action: 'agent_analysis',
      ok: true,
      detail: request.depth,
      elapsedMs: Date.now() - startedAt,
    })
    yield progressEvent(startedAt, {
      step: 2,
      phase: 'final',
      status: 'running',
      title: BUBU_COPY.agentService.progress.analysisStart,
      detail: BUBU_COPY.agentService.progress.analysisDetail(request.depth),
    })
    const stream = await openAnalysisStream(input, deps, request)
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = sanitizeReplacementChars(decoder.decode(value, { stream: true }))
      if (!chunk) continue
      fullContent += chunk
      yield { type: 'delta', content: chunk }
    }
    const tail = sanitizeReplacementChars(decoder.decode())
    if (tail) {
      fullContent += tail
      yield { type: 'delta', content: tail }
    }
    yield progressEvent(startedAt, {
      step: 2,
      phase: 'final',
      status: 'completed',
      title: BUBU_COPY.agentService.progress.analysisDone,
    })
    yield {
      type: 'done',
      trace,
      pendingConfirmation: null,
      featureContext: buildAgentFeatureContext(request, fullContent),
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    debugLog(input.userId, 'analysis.error', { detail })
    yield traceEvent(trace, {
      step: 2,
      action: 'agent_analysis_error',
      ok: false,
      detail,
      elapsedMs: Date.now() - startedAt,
    })
    yield progressEvent(startedAt, {
      step: 2,
      phase: 'final',
      status: 'failed',
      title: BUBU_COPY.agentService.progress.analysisFailed,
      detail,
    })
    yield { type: 'error', message: detail }
  }
}

export function createAgentEventStream(
  input: AgentChatInput,
  deps: AgentRuntimeDeps = {},
): ReadableStream {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runAgentChatEvents(input, deps)) {
          if (event.type === 'delta') {
            const content = sanitizeReplacementChars(event.content)
            if (!content) continue
            controller.enqueue(encoder.encode(`${JSON.stringify({ ...event, content })}\n`))
            continue
          }
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[agent] event stream fatal error', error)
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'error', message })}\n`))
      } finally {
        controller.close()
      }
    },
  })
}

export async function runAgentChat(
  input: AgentChatInput,
  deps: AgentRuntimeDeps = {},
): Promise<AgentChatResult> {
  const trace: AgentTraceEvent[] = []
  let content = ''
  for await (const event of runAgentChatEvents(input, deps)) {
    if (event.type === 'trace') trace.push(event.trace)
    if (event.type === 'delta') content += sanitizeReplacementChars(event.content)
  }
  return {
    stream: textToStream(content, { dripDelayMs: 0 }),
    trace,
  }
}
