// Shared service for the four structured analysis features.

import {
  consumeApples,
  refundApples,
  getOrResetQuota,
} from '@/lib/quota'
import {
  getFeaturePrompt,
  type FeatureKind,
} from '@/lib/feature-prompts'
import { getScenarioPrompt, inferFeatureScenario } from '@/lib/agent-scenario-prompts'
import { FEATURE_APPLE_COSTS, getFeatureAppleCost } from '@/lib/apple-costs'
import {
  getAgentReportPreferenceInstruction,
  getAgentComplexityProfile,
  getFeatureComplexityInstruction,
  normalizeAgentReportPreference,
  normalizeAgentComplexityMode,
  type AgentComplexityMode,
  type AgentReportPreference,
} from '@/lib/agent-complexity'
import { buildGanZhiTable, type Granularity } from '@/lib/calendar'
import {
  callLLM,
  callLLMTextWithUsage,
  createUnifiedStreamProcessor,
  pickLlmTask,
  type LlmTaskKind,
} from '@/lib/llm'
import { ServiceHttpError } from '@/lib/chat-service'
import {
  createUsageTrackedStream,
  recordLlmUsage,
  type LlmUsageSource,
} from '@/lib/token-usage'
import {
  buildBubuAvatarUserText,
  buildBubuFortuneUserMessage,
  buildBubuHepanUserMessage,
  buildBubuLifePathUserMessage,
} from '@/lib/bubu-content'

// ==================== Types ====================

export type { FeatureKind }

export interface Participant {
  name: string
  baziText?: string | null
  pillars?: string | null
}

export interface HepanParams {
  subtype: 'pair' | 'multi' | 'event'
  relationLabel?: string
  eventDesc?: string
  participants: Participant[]
  analysisAngle?: string
}

export interface FortuneParams {
  profile: Participant
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD
  granularity: Granularity
  focus: string[]
  analysisAngle?: string
}

export interface AvatarParams {
  imageDataUrl: string // data:image/...;base64,...
  combineBazi: boolean
  profile?: Participant | null
  analysisAngle?: string
}

export interface LifePathParams {
  profile: Participant
  analysisAngle?: string
}

export type FeatureParams =
  | HepanParams
  | FortuneParams
  | AvatarParams
  | LifePathParams

export interface FeatureAnalyzeInput {
  userId: string
  kind: FeatureKind
  params: any
  source?: LlmUsageSource
  complexity?: AgentComplexityMode
  reportPreference?: AgentReportPreference | null
  chargeApples?: boolean
}

export interface FeatureInvocation {
  userId: string
  kind: FeatureKind
  cost: number
  task: LlmTaskKind
  source: LlmUsageSource
  complexity: AgentComplexityMode | null
  reportPreference: AgentReportPreference | null
  messagesWithSystem: any[]
}

export interface FeatureAnalysisStreamResult {
  stream: ReadableStream
  task: LlmTaskKind
  model: string
  inputTokens: number
}

// ==================== Build user message text ====================

export function buildHepanUserMessage(params: HepanParams): string {
  return buildBubuHepanUserMessage(params)
}

export function buildFortuneUserMessage(params: FortuneParams): string {
  const startDate = new Date(params.start)
  const endDate = new Date(params.end)
  const calendarTable = buildGanZhiTable(startDate, endDate, params.granularity)
  return buildBubuFortuneUserMessage(params, calendarTable)
}

export function buildAvatarUserText(params: AvatarParams): string {
  return buildBubuAvatarUserText(params)
}

export function buildLifePathUserMessage(params: LifePathParams): string {
  return buildBubuLifePathUserMessage(params)
}

// ==================== Validation ====================

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function hasParticipant(value: unknown): value is Participant {
  const p = value as Participant | undefined
  return !!p && typeof p.name === 'string' && p.name.trim().length > 0
}

function hasBaziInfo(value: unknown): value is Participant {
  const p = value as Participant | undefined
  return hasParticipant(p) && !!(p.baziText?.trim() || p.pillars?.trim())
}

export function validateFeatureParams(
  kind: FeatureKind,
  params: any,
): string[] {
  const missing: string[] = []

  if (!params || typeof params !== 'object') {
    return ['params']
  }

  if (kind === 'hepan') {
    const p = params as HepanParams
    if (!['pair', 'multi', 'event'].includes(p.subtype)) missing.push('subtype')
    if (!Array.isArray(p.participants) || p.participants.length < 2) {
      missing.push('participants（至少 2 位人物）')
    } else if (!p.participants.every(hasParticipant)) {
      missing.push('participants.name')
    } else if (!p.participants.every(hasBaziInfo)) {
      missing.push('participants.baziText 或 pillars（请先在人物册里让小象排盘）')
    }
    if (p.subtype === 'event' && !p.eventDesc) missing.push('eventDesc')
  } else if (kind === 'fortune') {
    const p = params as FortuneParams
    if (!hasParticipant(p.profile)) missing.push('profile')
    else if (!hasBaziInfo(p.profile)) missing.push('profile.baziText 或 pillars（请先在人物册里让小象排盘）')
    if (!isDateString(p.start)) missing.push('start')
    if (!isDateString(p.end)) missing.push('end')
    if (!['day', 'month'].includes(p.granularity)) missing.push('granularity')
    if (!Array.isArray(p.focus)) missing.push('focus')
  } else if (kind === 'avatar') {
    const p = params as AvatarParams
    if (typeof p.imageDataUrl !== 'string' || !p.imageDataUrl.startsWith('data:')) {
      missing.push('imageDataUrl')
    }
  } else if (kind === 'lifepath') {
    const p = params as LifePathParams
    if (!hasParticipant(p.profile)) missing.push('profile')
    else if (!hasBaziInfo(p.profile)) missing.push('profile.baziText 或 pillars（请先在人物册里让小象排盘）')
  }

  return missing
}

// ==================== Message builder ====================

export function buildFeatureMessages(
  kind: FeatureKind,
  params: any,
  useUltraPrompt: boolean,
  complexity?: AgentComplexityMode | null,
  reportPreference?: AgentReportPreference | null,
): any[] {
  const complexityInstruction = complexity
    ? `\n\n${getFeatureComplexityInstruction(complexity, kind)}`
    : ''
  const reportPreferenceInstruction = getAgentReportPreferenceInstruction(reportPreference)
  const reportInstruction = reportPreferenceInstruction
    ? `\n\n${reportPreferenceInstruction}`
    : ''
  const scenario = inferFeatureScenario(kind, params)
  const scenarioInstruction = `\n\n${getScenarioPrompt(scenario, { reportPreference })}`
  const systemPrompt =
    getFeaturePrompt(kind, useUltraPrompt) + complexityInstruction + reportInstruction + scenarioInstruction

  if (kind === 'avatar') {
    const avatarParams = params as AvatarParams
    return [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: buildAvatarUserText(avatarParams) },
          { type: 'image_url', image_url: { url: avatarParams.imageDataUrl } },
        ],
      },
    ]
  }

  let userMessageText = ''
  if (kind === 'hepan') {
    userMessageText = buildHepanUserMessage(params as HepanParams)
  } else if (kind === 'fortune') {
    userMessageText = buildFortuneUserMessage(params as FortuneParams)
  } else {
    userMessageText = buildLifePathUserMessage(params as LifePathParams)
  }

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessageText },
  ]
}

// ==================== Refundable stream wrapper ====================

function createRefundableStream(
  upstream: ReadableStream,
  refundOnFail: () => Promise<void>,
): ReadableStream {
  let receivedAnyChars = false
  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value && value.length > 0) receivedAnyChars = true
          controller.enqueue(value)
        }
        if (!receivedAnyChars) {
          await refundOnFail()
        }
        controller.close()
      } catch (err) {
        const isAbort = !!(
          err &&
          typeof err === 'object' &&
          'name' in err &&
          String((err as any).name) === 'AbortError'
        )
        if (isAbort) {
          console.warn('[feature-analyze] stream aborted', { receivedAnyChars })
        } else {
          console.error('[feature-analyze] stream error, refunding:', err)
        }
        if (!isAbort || !receivedAnyChars) {
          try {
            await refundOnFail()
          } catch {
            /* ignore */
          }
        }
        try {
          controller.error(err)
        } catch {
          /* ignore */
        }
      }
    },
  })
}

// ==================== Invocation lifecycle ====================

async function prepareFeatureInvocation(
  input: FeatureAnalyzeInput,
): Promise<FeatureInvocation> {
  if (!input.kind || !(input.kind in FEATURE_APPLE_COSTS)) {
    throw new ServiceHttpError(400, {
      error: 'invalid_request',
      message: '功能类型无效',
    })
  }

  const missing = validateFeatureParams(input.kind, input.params)
  if (missing.length > 0) {
    const message =
      input.kind === 'avatar' && missing.includes('imageDataUrl')
        ? '头像图片缺失或格式错误'
        : `功能参数不完整：${missing.join('、')}`
    throw new ServiceHttpError(400, {
      error: 'invalid_request',
      message,
      missing,
    })
  }

  const chargeApples = input.chargeApples !== false
  const cost = chargeApples ? getFeatureAppleCost(input.kind) : 0
  let preUsedToday = 0

  if (chargeApples && cost > 0) {
    const preQuota = await getOrResetQuota(input.userId)
    preUsedToday = preQuota.usedToday

    const { success, quota } = await consumeApples(input.userId, cost)
    if (!success) {
      throw new ServiceHttpError(403, {
        error: 'quota_exceeded',
        message: `这个功能需要 ${cost} 个苹果🍎，今天的库存不太够啦~ 明天再来或者给卜卜象投喂一下吧`,
        required: cost,
        remaining: quota.remaining,
        dailyLimit: quota.dailyLimit,
      })
    }
  }

  const isReportKind = input.kind === 'fortune' || input.kind === 'hepan' || input.kind === 'lifepath'
  const rawTask = pickLlmTask({
    consumesApple: true,
    preUsedToday,
    isAvatar: input.kind === 'avatar',
  })
  // Report features get a dedicated high-limit DeepSeek config
  const task = isReportKind && rawTask !== 'apple_avatar' ? 'apple_report' : rawTask
  const useUltraPrompt = task === 'apple_first' || task === 'apple_avatar'
  const complexity = input.complexity
    ? normalizeAgentComplexityMode(input.complexity)
    : null
  const reportPreference = normalizeAgentReportPreference(input.reportPreference)
  let messagesWithSystem: any[]
  try {
    messagesWithSystem = buildFeatureMessages(
      input.kind,
      input.params,
      useUltraPrompt,
      complexity,
      reportPreference,
    )
  } catch (err) {
    if (cost > 0) await refundApples(input.userId, cost)
    throw err
  }

  return {
    userId: input.userId,
    kind: input.kind,
    cost,
    task,
    source: input.source || 'feature_page',
    complexity,
    reportPreference,
    messagesWithSystem,
  }
}

async function refundFeatureInvocation(invocation: FeatureInvocation) {
  if (invocation.cost <= 0) return
  try {
    await refundApples(invocation.userId, invocation.cost)
  } catch (e) {
    console.error('[feature-analyze] refund failed', e)
  }
}

export async function runFeatureAnalysisStream(
  input: FeatureAnalyzeInput,
  opts: {
    signal?: AbortSignal
    drip?: boolean
    dripDelayMs?: number
    maxTokens?: number
    thinking?: 'enabled' | 'disabled'
    reasoningEffort?: 'none' | 'high' | 'max'
  } = {},
): Promise<FeatureAnalysisStreamResult> {
  const invocation = await prepareFeatureInvocation(input)

  let upstreamResponse: Response
  let model = ''
  let inputTokens = 0
  try {
    const complexityProfile = getAgentComplexityProfile(invocation.complexity)
    const result = await callLLM(invocation.messagesWithSystem, invocation.task, {
      signal: opts.signal,
      maxTokens: opts.maxTokens ?? complexityProfile.featureMaxTokens,
      thinking: opts.thinking ?? complexityProfile.thinking,
      reasoningEffort: opts.reasoningEffort ?? complexityProfile.reasoningEffort,
    })
    upstreamResponse = result.response
    model = result.config.model
    inputTokens = result.inputTokens
  } catch (err) {
    console.error('[feature-analyze] upstream call failed', err)
    await refundFeatureInvocation(invocation)
    throw new ServiceHttpError(502, {
      error: 'analyze_failed',
      message: '分析服务暂时不可用，已退还苹果',
    })
  }

  const baseStream = createUnifiedStreamProcessor(upstreamResponse, {
    chunking: opts.drip ? 'character' : 'immediate',
    dripDelayMs: opts.dripDelayMs,
  })
  const refundableStream = createRefundableStream(
    baseStream,
    () => refundFeatureInvocation(invocation),
  )
  const stream = createUsageTrackedStream(refundableStream, {
    userId: invocation.userId,
    source: invocation.source,
    mode: invocation.source === 'agent_tool' ? 'agent' : 'feature',
    model,
    task: invocation.task,
    inputTokens,
    featureKind: invocation.kind,
  })

  return {
    stream,
    task: invocation.task,
    model,
    inputTokens,
  }
}

export async function runFeatureAnalysisText(
  input: FeatureAnalyzeInput,
  opts: { signal?: AbortSignal } = {},
): Promise<string> {
  const invocation = await prepareFeatureInvocation(input)

  try {
    const complexityProfile = getAgentComplexityProfile(invocation.complexity)
    const result = await callLLMTextWithUsage(
      invocation.messagesWithSystem,
      invocation.task,
      {
        signal: opts.signal,
        maxTokens: complexityProfile.featureMaxTokens,
        thinking: complexityProfile.thinking,
        reasoningEffort: complexityProfile.reasoningEffort,
      },
    )
    const content = result.text
    if (!content.trim()) {
      await refundFeatureInvocation(invocation)
      throw new ServiceHttpError(502, {
        error: 'analyze_failed',
        message: '分析服务返回为空，已退还苹果',
      })
    }
    // Text mode is rarely used, but keep it accounted for.
    await recordLlmUsage({
      userId: invocation.userId,
      source: invocation.source,
      mode: invocation.source === 'agent_tool' ? 'agent' : 'feature',
      model: result.config.model,
      task: invocation.task,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      featureKind: invocation.kind,
    })
    return content
  } catch (err) {
    if (err instanceof ServiceHttpError) throw err
    console.error('[feature-analyze] text upstream failed', err)
    await refundFeatureInvocation(invocation)
    throw new ServiceHttpError(502, {
      error: 'analyze_failed',
      message: '分析服务暂时不可用，已退还苹果',
    })
  }
}
