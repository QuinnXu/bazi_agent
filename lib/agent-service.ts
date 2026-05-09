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
import { extractAgentCorrectionWithLLM } from '@/lib/agent-correction-extractor'
import { buildCalendarContext } from '@/lib/agent-prompt-builder'
import {
  applyPendingAnswer,
  planNextQuestion,
} from '@/lib/agent-question-planner'
import {
  buildInitialSlots,
  extractPersonCorrection,
  hasAgentCorrectionSignal,
  hasAnalysisIntent,
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
    },
    opts: { signal?: AbortSignal },
  ) => Promise<ReadableStream | string>
  extractCorrection?: (
    input: {
      latestText: string
      pendingConfirmation: AgentPendingConfirmation
      selectedProfile?: AgentParticipant | null
      participants?: ChatParticipant[]
    },
    opts: { signal?: AbortSignal },
  ) => Promise<AgentWorkflowCorrection | null>
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
      content: `【更早上下文摘要】\n${truncateText(summary, 2400)}`,
    },
    ...recent,
  ]
}

function fastLocalAnswer(input: AgentChatInput): string | null {
  const latest = latestUserText(input.messages).trim()
  if (!latest) return null
  const compact = latest.replace(/[\s。！？!?,，～~.]/g, '').toLowerCase()
  if (/^(你好|您好|嗨|hi|hello|在吗|早上好|下午好|晚上好)$/.test(compact)) {
    return '你好呀～我是卜卜象。你可以直接告诉我想看的问题，比如近期运势、关系合盘、人生脉络，或者先创建一个八字人物。'
  }
  if (/^(谢谢|感谢|多谢|thx|thanks)$/.test(compact)) {
    return '不客气呀～需要继续看某个月份、某段关系或某个选择时，直接告诉我就好。'
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
      content: `【会话摘要】\n${truncateText(input.sessionSummary, 1600)}`,
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
    },
    { signal },
  )
  return stream
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
  const depth = reportPreferenceToDepth(input.reportPreference || input.pendingConfirmation?.executionProfile?.reportPreference)
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
  const customInstruction = normalizeAgentReportPreference(input.reportPreference)?.customInstruction || null
  return {
    slots,
    calendar,
    depth,
    userQuestion: slots.matter?.raw || sourceText,
    conversationSummary: input.sessionSummary || input.featureContext?.summary || null,
    promptStyleHint: customInstruction
      ? customInstruction
      : `当前报告风格：${getAgentReportPreferenceLabel(input.reportPreference)}`,
  }
}

async function openAnalysisStream(
  input: AgentChatInput,
  deps: AgentRuntimeDeps,
  request: AgentAnalysisRequest,
): Promise<ReadableStream> {
  if (deps.runAnalysisStream) {
    const result = await deps.runAnalysisStream(
      { userId: input.userId, request },
      { signal: input.signal },
    )
    return typeof result === 'string' ? textToStream(result, { dripDelayMs: 0 }) : result
  }
  const result = await runAgentAnalysisStream(
    { userId: input.userId, request },
    { signal: input.signal },
  )
  return result.stream
}

function shouldDirectChat(input: AgentChatInput, latest: string): boolean {
  if (!latest.trim()) return true
  if (input.pendingConfirmation && isPendingOptionTurn(input.pendingConfirmation, latest)) return false
  if (isPlainChatRequest(latest)) return true
  if (input.featureContext && /(继续|展开|详细说|第[一二三四五六七八九十0-9]+点|行动清单|怎么做|什么意思|总结|接着|那.*呢)/.test(latest)) {
    return true
  }
  return !hasAnalysisIntent(latest)
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
        latestText: latest,
        pendingConfirmation: input.pendingConfirmation,
        selectedProfile: input.selectedProfile,
        participants: input.participants,
      },
      { signal: input.signal },
    )
  }
  return extractAgentCorrectionWithLLM({
    latestText: latest,
    pendingConfirmation: input.pendingConfirmation,
    selectedProfile: input.selectedProfile,
    participants: input.participants,
    signal: input.signal,
  })
}

export async function* runAgentChatEvents(
  input: AgentChatInput,
  deps: AgentRuntimeDeps = {},
): AsyncGenerator<AgentStreamEvent> {
  const startedAt = Date.now()
  const complexity = normalizeAgentComplexityMode(input.complexity)
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
      title: '快速回复',
    })
    yield* streamTextEvents(fastAnswer)
    yield progressEvent(startedAt, {
      step: 1,
      phase: 'final',
      status: 'completed',
      title: '已快速回复',
    })
    yield { type: 'done', trace }
    return
  }

  if (shouldDirectChat(input, latest)) {
    yield traceEvent(trace, {
      step: 1,
      action: 'direct_chat',
      ok: true,
      detail: 'lightweight_chat',
      elapsedMs: Date.now() - startedAt,
    })
    yield progressEvent(startedAt, {
      step: 1,
      phase: 'final',
      status: 'running',
      title: '直接回复',
    })
    if (input.pendingConfirmation) {
      yield* streamTextEvents('刚才那一步分析我先帮你放在旁边，不会丢。我们先接住你现在这句。\n\n')
    }
    const directStream = await openDirectChatStream(input, deps, input.signal)
    yield* streamReadableEvents(directStream)
    yield progressEvent(startedAt, {
      step: 1,
      phase: 'final',
      status: 'completed',
      title: '已直接回复',
    })
    yield { type: 'done', trace, pendingConfirmation: input.pendingConfirmation || null }
    return
  }

  yield progressEvent(startedAt, {
    step: 1,
    phase: 'planner',
    status: 'running',
    title: '抽取问题要素',
    detail: '人物、时间、事宜、补充信息',
  })

  const liveCorrection = await maybeExtractLiveCorrection(input, deps, latest)
  const pendingSlots = applyPendingAnswer(input.pendingConfirmation, latest, liveCorrection)
  const sourceText = input.pendingConfirmation?.sourceIntent || latest
  const initialSlots = pendingSlots || buildInitialSlots({
    messages: input.messages,
    timeRanges: input.timeRanges,
    sessionSummary: input.sessionSummary || input.featureContext?.summary || null,
  })
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
    }),
    elapsedMs: Date.now() - startedAt,
  })
  yield progressEvent(startedAt, {
    step: 1,
    phase: 'planner',
    status: 'completed',
    title: '已抽取问题要素',
  })

  if (resolved.matter?.category === 'avatar') {
    const content = '头像分析需要先看到图片，卜卜象不能凭空想象头像。你可以先到「头像分析推荐」里上传图片；如果只是想聊职业感或社交头像方向，也可以描述一下画面，我先帮你做聊天式建议。'
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
      title: '提示补充图片',
    })
    yield* streamTextEvents(content)
    yield progressEvent(startedAt, {
      step: 2,
      phase: 'final',
      status: 'completed',
      title: '已提示补充图片',
    })
    yield { type: 'done', trace }
    return
  }

  const question = planNextQuestion(resolved, sourceText)
  if (question) {
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
      title: '已请求用户选择',
    })
    yield {
      type: 'done',
      trace,
      pendingConfirmation: question.pending,
    }
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
      title: '生成卜卜象分析',
      detail: `深度：${request.depth}`,
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
      title: '已生成卜卜象分析',
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
      title: '分析生成失败',
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
