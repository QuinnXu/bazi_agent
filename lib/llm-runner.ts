import {
  runClassicChatStream,
  ServiceHttpError,
  type ChatFeatureContext,
  type ChatParticipant,
} from '@/lib/chat-service'
import {
  createAgentEventStream,
  type AgentMessage,
  type AgentPendingConfirmation,
  type AgentStreamEvent,
  type AgentTimeRangeContext,
} from '@/lib/agent-service'
import {
  normalizeAgentComplexityMode,
  type AgentComplexityMode,
  type AgentReportPreference,
} from '@/lib/agent-complexity'
import { runFeatureAnalysisStream, type FeatureKind } from '@/lib/feature-service'
import { CLASSIC_CHAT_APPLE_COST } from '@/lib/apple-costs'
import { BUBU_EMPTY_RESPONSE } from '@/lib/bubu-copy'
import { refundApples } from '@/lib/quota'
import { createServiceClient } from '@/lib/supabase/client'
import { sanitizeReplacementChars } from '@/lib/text-sanitize'
import { estimateTokensForText } from '@/lib/token-estimator'
import type { AgentParticipant } from '@/lib/agent-workflow-types'

export type LlmRunKind = 'classic_chat' | 'agent_chat' | 'feature_analyze'
export type LlmRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled'

const STREAM_FLUSH_CHARS = 120
const STREAM_FLUSH_INTERVAL_MS = 120
const OUTPUT_CHECKPOINT_CHARS = 1200
const OUTPUT_CHECKPOINT_INTERVAL_MS = 1500

function isMissingModeColumn(error: any) {
  return String(error?.message || '').toLowerCase().includes('mode')
}

function isMissingMessageMetadataColumn(error: any) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('model') || message.includes('tokens_used')
}

interface LlmRunRow {
  id: string
  user_id: string
  session_id: string
  kind: LlmRunKind
  status: LlmRunStatus
  payload: Record<string, any>
  output_text: string
  assistant_message_id: string | null
  apple_cost: number
}

interface ClassicPayload {
  messages: any[]
  baziAnalysisResult?: string | null
  useUltraMode?: boolean
  participants?: ChatParticipant[]
  featureContext?: ChatFeatureContext
}

interface AgentPayload {
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
}

interface FeaturePayload {
  kind: FeatureKind
  params: any
  chatMode?: 'classic' | 'agent'
  complexity?: AgentComplexityMode
  summary?: string
  featureContext?: Record<string, any>
}

type RunControllerEntry = {
  controller: AbortController
}

const activeRunControllers = new Map<string, RunControllerEntry>()

export function abortActiveLlmRun(runId: string) {
  const active = activeRunControllers.get(runId)
  if (active && !active.controller.signal.aborted) {
    active.controller.abort()
  }
}

export async function startLlmRun(runId: string): Promise<void> {
  if (activeRunControllers.has(runId)) return

  const supabase = createServiceClient()
  const { data: loaded, error: loadError } = await supabase
    .from('llm_runs')
    .select('*')
    .eq('id', runId)
    .single()

  if (loadError || !loaded) {
    console.error('[llm-runner] run not found', { runId, error: loadError })
    return
  }

  const run = loaded as LlmRunRow
  if (run.status !== 'queued') return

  const { data: claimed, error: claimError } = await supabase
    .from('llm_runs')
    .update({ status: 'running', started_at: new Date().toISOString(), error_message: null })
    .eq('id', runId)
    .eq('status', 'queued')
    .select('*')
    .single()

  if (claimError || !claimed) {
    console.error('[llm-runner] failed to claim run', { runId, error: claimError })
    return
  }

  const claimedRun = claimed as LlmRunRow
  const controller = new AbortController()
  activeRunControllers.set(runId, { controller })

  let nextSeq = await getNextEventSeq(supabase, runId)
  let outputText = claimedRun.output_text || ''
  let bufferedDelta = ''
  let lastFlushAt = Date.now()
  let lastOutputCheckpointAt = Date.now()
  let lastOutputCheckpointLength = outputText.length
  let model: string | null = null
  let task: string | null = null
  let inputTokens = 0
  const finalMetadata: Record<string, any> = {}
  let eventWriteChain: Promise<void> = Promise.resolve()

  const appendEvent = async (
    eventType: string,
    content?: string | null,
    payload: Record<string, any> = {},
  ) => {
    const seq = nextSeq++
    const write = eventWriteChain.then(async () => {
      const { error } = await supabase
        .from('llm_run_events')
        .insert({
          run_id: runId,
          seq,
          event_type: eventType,
          content: content ?? null,
          payload,
        })
      if (error) console.error('[llm-runner] event insert failed', { runId, error })
    })
    eventWriteChain = write.catch(() => undefined)
    await write
  }

  const queueDeltaPersistence = (delta: string, nextOutputText?: string | null) => {
    const seq = nextSeq++
    const write = eventWriteChain.then(async () => {
      const { error: eventError } = await supabase
        .from('llm_run_events')
        .insert({
          run_id: runId,
          seq,
          event_type: 'delta',
          content: delta,
          payload: {},
        })
      if (eventError) console.error('[llm-runner] event insert failed', { runId, error: eventError })

      if (nextOutputText !== undefined && nextOutputText !== null) {
        const { error: outputError } = await supabase
          .from('llm_runs')
          .update({ output_text: nextOutputText })
          .eq('id', runId)
        if (outputError) console.error('[llm-runner] output update failed', { runId, error: outputError })
      }
    })
    eventWriteChain = write.catch(() => undefined)
    return write
  }

  const flushDelta = async (force = false) => {
    if (!bufferedDelta) {
      if (force) await eventWriteChain
      return
    }
    const shouldFlush =
      force ||
      bufferedDelta.length >= STREAM_FLUSH_CHARS ||
      Date.now() - lastFlushAt >= STREAM_FLUSH_INTERVAL_MS
    if (!shouldFlush) return
    const delta = bufferedDelta
    bufferedDelta = ''
    lastFlushAt = Date.now()
    outputText += delta
    const shouldCheckpointOutput =
      force ||
      outputText.length - lastOutputCheckpointLength >= OUTPUT_CHECKPOINT_CHARS ||
      Date.now() - lastOutputCheckpointAt >= OUTPUT_CHECKPOINT_INTERVAL_MS
    const write = queueDeltaPersistence(delta, shouldCheckpointOutput ? outputText : null)
    if (shouldCheckpointOutput) {
      lastOutputCheckpointAt = Date.now()
      lastOutputCheckpointLength = outputText.length
    }
    if (force) await write
  }

  try {
    await appendEvent('status', null, { status: 'running', label: '后台推理已开始' })

    if (claimedRun.kind === 'classic_chat') {
      const payload = claimedRun.payload as ClassicPayload
      const cost = payload.useUltraMode ? CLASSIC_CHAT_APPLE_COST : 0
      if (cost > 0) {
        await supabase.from('llm_runs').update({ apple_cost: cost }).eq('id', runId)
      }
      const result = await runClassicChatStream(
        {
          userId: claimedRun.user_id,
          messages: payload.messages || [],
          baziAnalysisResult: payload.baziAnalysisResult,
          useUltraMode: payload.useUltraMode,
          participants: payload.participants,
          featureContext: payload.featureContext,
        },
        { signal: controller.signal },
      )
      model = result.model
      task = result.task
      inputTokens = result.inputTokens
      await consumeTextStream(result.stream, chunk => {
        bufferedDelta += chunk
        return flushDelta()
      })
    } else if (claimedRun.kind === 'feature_analyze') {
      const payload = claimedRun.payload as FeaturePayload
      const result = await runFeatureAnalysisStream(
        {
          userId: claimedRun.user_id,
          kind: payload.kind,
          params: payload.params,
          source: payload.chatMode === 'agent' ? 'agent_tool' : 'feature_page',
          chargeApples: true,
          complexity: payload.complexity
            ? normalizeAgentComplexityMode(payload.complexity)
            : undefined,
        },
        { signal: controller.signal },
      )
      model = result.model
      task = result.task
      inputTokens = result.inputTokens
      await consumeTextStream(result.stream, chunk => {
        bufferedDelta += chunk
        return flushDelta()
      })
      if (payload.featureContext) {
        finalMetadata.featureContext = payload.featureContext
      }
      if (payload.summary) {
        finalMetadata.sessionSummary = payload.summary
      }
    } else {
      const payload = claimedRun.payload as AgentPayload
      const stream = createAgentEventStream({
        userId: claimedRun.user_id,
        messages: payload.messages || [],
        baziAnalysisResult: payload.baziAnalysisResult,
        selectedProfile: payload.selectedProfile,
        participants: payload.participants,
        timeRanges: payload.timeRanges,
        reportPreference: payload.reportPreference,
        sessionSummary: payload.sessionSummary,
        pendingConfirmation: payload.pendingConfirmation,
        featureContext: payload.featureContext,
        complexity: normalizeAgentComplexityMode(payload.complexity),
        maxSteps: payload.maxSteps,
        timeoutMs: payload.timeoutMs,
        signal: controller.signal,
      })
      await consumeAgentEventStream(stream, async event => {
        if (event.type === 'delta') {
          const content = sanitizeReplacementChars(event.content)
          if (content) {
            bufferedDelta += content
            await flushDelta()
          }
          return
        }
        if (event.type === 'progress') {
          await appendEvent('progress', null, { progress: event.progress })
          return
        }
        if (event.type === 'trace') {
          await appendEvent('trace', null, { trace: event.trace })
          return
        }
        if (event.type === 'ui') {
          finalMetadata.agentUi = event.ui
          await appendEvent('ui', null, { ui: event.ui })
          return
        }
        if (event.type === 'done') {
          finalMetadata.pendingConfirmation = event.pendingConfirmation || null
          finalMetadata.featureContext = event.featureContext || null
          await appendEvent('done', null, {
            pendingConfirmation: finalMetadata.pendingConfirmation,
            featureContext: finalMetadata.featureContext,
          })
          return
        }
        if (event.type === 'error') {
          throw new Error(event.message || 'Agent stream error')
        }
      })
    }

    await flushDelta(true)
    await completeRun({
      supabase,
      runId,
      userId: claimedRun.user_id,
      sessionId: claimedRun.session_id,
      kind: claimedRun.kind,
      outputText,
      finalMetadata,
      model,
      task,
      inputTokens,
      appendEvent,
    })
  } catch (error) {
    await flushDelta(true).catch(() => undefined)
    const current = await getRunStatus(supabase, runId)
    if (controller.signal.aborted || current === 'canceled') {
      await markRunCanceled(supabase, claimedRun, outputText, appendEvent)
      return
    }

    if (
      claimedRun.kind === 'classic_chat' &&
      (claimedRun.payload as ClassicPayload).useUltraMode &&
      !outputText.trim()
    ) {
      await refundApples(claimedRun.user_id, CLASSIC_CHAT_APPLE_COST).catch(refundError => {
        console.error('[llm-runner] classic refund failed', refundError)
      })
    }

    const message = error instanceof ServiceHttpError
      ? String(error.body.message || error.message)
      : error instanceof Error
      ? error.message
      : String(error)
    console.error('[llm-runner] run failed', { runId, message, error })
    await supabase
      .from('llm_runs')
      .update({
        status: 'failed',
        error_message: message,
        output_text: outputText,
        model,
        task,
        input_tokens: inputTokens,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId)
    await appendEvent('error', null, { message })
  } finally {
    activeRunControllers.delete(runId)
  }
}

async function completeRun(input: {
  supabase: ReturnType<typeof createServiceClient>
  runId: string
  userId: string
  sessionId: string
  kind: LlmRunKind
  outputText: string
  finalMetadata: Record<string, any>
  model: string | null
  task: string | null
  inputTokens: number
  appendEvent: (eventType: string, content?: string | null, payload?: Record<string, any>) => Promise<void>
}) {
  const {
    supabase,
    runId,
    sessionId,
    kind,
    outputText,
    finalMetadata,
    model,
    inputTokens,
    appendEvent,
  } = input

  const status = await getRunStatus(supabase, runId)
  if (status === 'canceled') {
    await markRunCanceled(supabase, {
      id: runId,
      user_id: input.userId,
      kind,
      payload: {},
    }, outputText, appendEvent)
    return
  }

  const finalContent = normalizeFinalContent(kind, outputText)
  let assistantMessageId: string | null = null

  if (finalContent.trim()) {
    const mode = kind === 'classic_chat' ? 'classic' : 'agent'
    const insertPayload = {
      session_id: sessionId,
      role: 'assistant',
      content: finalContent,
      mode,
      model,
      tokens_used: inputTokens + estimateTokensForText(finalContent),
    } as any
    let { data: inserted, error: insertError } = await supabase
      .from('chat_messages')
      .insert(insertPayload)
      .select('id')
      .single()
    if (insertError && (isMissingModeColumn(insertError) || isMissingMessageMetadataColumn(insertError))) {
      const retryPayload = {
        session_id: sessionId,
        role: 'assistant',
        content: finalContent,
        ...(isMissingModeColumn(insertError) ? {} : { mode }),
      } as any
      const retry = await supabase
        .from('chat_messages')
        .insert(retryPayload)
        .select('id')
        .single()
      inserted = retry.data
      insertError = retry.error
    }
    if (insertError) throw insertError
    assistantMessageId = inserted?.id || null
  }

  const sessionUpdate: Record<string, any> = {
    updated_at: new Date().toISOString(),
    last_message_at: new Date().toISOString(),
  }
  const summary = finalMetadata.sessionSummary || finalMetadata.featureContext?.summary
  if (summary) sessionUpdate.summary = summary
  await supabase.from('chat_sessions').update(sessionUpdate).eq('id', sessionId)

  await supabase
    .from('llm_runs')
    .update({
      status: 'completed',
      output_text: finalContent,
      final_metadata: finalMetadata,
      assistant_message_id: assistantMessageId,
      model,
      task: input.task,
      input_tokens: inputTokens,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId)
    .neq('status', 'canceled')
  await appendEvent('status', null, { status: 'completed', assistantMessageId })
}

async function markRunCanceled(
  supabase: ReturnType<typeof createServiceClient>,
  run: Pick<LlmRunRow, 'id' | 'user_id' | 'kind' | 'payload'>,
  outputText: string,
  appendEvent: (eventType: string, content?: string | null, payload?: Record<string, any>) => Promise<void>,
) {
  if (
    run.kind === 'classic_chat' &&
    (run.payload as ClassicPayload).useUltraMode &&
    !outputText.trim()
  ) {
    await refundApples(run.user_id, CLASSIC_CHAT_APPLE_COST).catch(error => {
      console.error('[llm-runner] cancel refund failed', error)
    })
  }
  await supabase
    .from('llm_runs')
    .update({
      status: 'canceled',
      output_text: outputText,
      canceled_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    .eq('id', run.id)
  await appendEvent('status', null, { status: 'canceled' })
}

async function consumeTextStream(
  stream: ReadableStream,
  onChunk: (chunk: string) => Promise<void>,
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = sanitizeReplacementChars(decoder.decode(value, { stream: true }))
    if (chunk) await onChunk(chunk)
  }
  const tail = sanitizeReplacementChars(decoder.decode())
  if (tail) await onChunk(tail)
}

async function consumeAgentEventStream(
  stream: ReadableStream,
  onEvent: (event: AgentStreamEvent) => Promise<void>,
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const consumeLine = async (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
    await onEvent(JSON.parse(trimmed) as AgentStreamEvent)
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += sanitizeReplacementChars(decoder.decode(value, { stream: true }))
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      await consumeLine(line)
      newlineIndex = buffer.indexOf('\n')
    }
  }
  buffer += sanitizeReplacementChars(decoder.decode())
  if (buffer.trim()) await consumeLine(buffer)
}

function normalizeFinalContent(kind: LlmRunKind, outputText: string): string {
  const content = sanitizeReplacementChars(outputText).trim()
  if (content) return content
  if (kind === 'agent_chat') return BUBU_EMPTY_RESPONSE.agent
  if (kind === 'feature_analyze') return BUBU_EMPTY_RESPONSE.feature
  return BUBU_EMPTY_RESPONSE.classic
}

async function getRunStatus(
  supabase: ReturnType<typeof createServiceClient>,
  runId: string,
): Promise<LlmRunStatus | null> {
  const { data } = await supabase
    .from('llm_runs')
    .select('status')
    .eq('id', runId)
    .single()
  return (data as { status?: LlmRunStatus } | null)?.status || null
}

async function getNextEventSeq(
  supabase: ReturnType<typeof createServiceClient>,
  runId: string,
): Promise<number> {
  const { data } = await supabase
    .from('llm_run_events')
    .select('seq')
    .eq('run_id', runId)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle()
  const lastSeq = Number((data as { seq?: number } | null)?.seq || 0)
  return Number.isFinite(lastSeq) ? lastSeq + 1 : 1
}
