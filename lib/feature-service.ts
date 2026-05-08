// Shared service for the four structured analysis features.

import {
  consumeApples,
  refundApples,
  getOrResetQuota,
} from '@/lib/quota'
import {
  FEATURE_COSTS,
  FEATURE_SENTINELS,
  getFeaturePrompt,
  type FeatureKind,
} from '@/lib/feature-prompts'
import {
  getAgentReportPreferenceInstruction,
  getAgentReportPreferenceMaxTokens,
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
}

export interface FortuneParams {
  profile: Participant
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD
  granularity: Granularity
  focus: string[]
}

export interface AvatarParams {
  imageDataUrl: string // data:image/...;base64,...
  combineBazi: boolean
  profile?: Participant | null
}

export interface LifePathParams {
  profile: Participant
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

function truncate(text: string | null | undefined, max = 1200): string {
  if (!text) return '（暂无完整命盘文本）'
  return text.length > max ? text.slice(0, max) + '\n...（已截断）' : text
}

function describeParticipant(p: Participant, idx?: number): string {
  const head = idx !== undefined ? `### 人物${idx + 1}：${p.name || '未命名'}` : `### ${p.name || '未命名'}`
  const pillars = p.pillars ? `\n四柱：${p.pillars}` : ''
  const bazi = p.baziText ? `\n命盘信息：\n${truncate(p.baziText)}` : ''
  return `${head}${pillars}${bazi}`
}

export function buildHepanUserMessage(params: HepanParams): string {
  const subtypeLabel =
    params.subtype === 'pair'
      ? '双人合盘'
      : params.subtype === 'multi'
      ? '多人合盘'
      : '应事分析'

  const blocks = params.participants
    .map((p, i) => describeParticipant(p, i))
    .join('\n\n')

  const relation = params.relationLabel
    ? `\n\n【关系类型】${params.relationLabel}`
    : ''
  const event = params.eventDesc
    ? `\n\n【应事 / 关注事件描述】${params.eventDesc}`
    : ''

  return `${FEATURE_SENTINELS.hepan}（${subtypeLabel}）

请基于以下 ${params.participants.length} 位参与者的八字信息进行合盘分析。

${blocks}${relation}${event}

请按系统提示中要求的结构输出。`
}

export function buildFortuneUserMessage(params: FortuneParams): string {
  const startDate = new Date(params.start)
  const endDate = new Date(params.end)
  const calendarTable = buildGanZhiTable(startDate, endDate, params.granularity)
  const focusLabel =
    params.focus.length > 0 ? params.focus.join('、') : '整体运势'
  const depthInstruction = buildFortuneDepthInstruction(params)

  return `${FEATURE_SENTINELS.fortune}（${params.granularity === 'day' ? '逐日' : '逐月'}）

【命主信息】
${describeParticipant(params.profile)}

【时间范围】${params.start} ~ ${params.end}
【关注方向】${focusLabel}

${calendarTable}

请基于命主八字 + 上方时间表，按系统提示中要求的结构进行近期运势推演。每个关注方向独立成段。
${depthInstruction}`
}

function monthSpan(start: string, end: string): number {
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0
  return (
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth()) +
    1
  )
}

function buildFortuneDepthInstruction(params: FortuneParams): string {
  if (params.granularity !== 'month') {
    return `
【输出深度要求】
- 如果用户只问短期几天，可以保持精炼；如果范围超过 14 天，请按周或关键阶段展开，不要只给笼统结论。
- 每个关注方向都要给出命局依据、时间窗口和行动建议。`
  }

  const months = monthSpan(params.start, params.end)
  if (months > 18) {
    return `
【长篇报告要求：多年财运研究报告】
- 这是多年跨度，请写成完整长篇财运报告，但不要把每一个月都写成等长大章，避免信息过载。
- 先给执行摘要和财富主线，再按年份展开：每一年至少 5-8 个自然段，说明财富主题、大运/流年关系、收入机会、风险支出、人际合作、资产配置倾向和行动策略。
- 每一年内标出 2-4 个关键月份或季度窗口，说明这些窗口为什么值得关注；逐月表没有具体日柱时，用月份/季度/交节前后表达，不要编造具体日期。
- 对跨大运或关键流年转换要单独成段说明，帮助用户理解财运节奏如何变化。
- 结尾给出长期财富节奏地图、风险清单、能力建设清单和可执行年度规划。`
  }

  const monthlyLength = months > 0 && months <= 8
    ? '每个月至少写 4-6 个自然段，约 450-700 中文字。'
    : '每个月至少写 3-5 个自然段，约 300-550 中文字，并在季度/阶段处做综合。'

  return `
【长篇报告要求：逐月 deep research 风格】
- 这不是短答复，请写成完整长篇报告：先给执行摘要，再给命盘基线，再逐月展开，最后给节奏地图和行动清单。
- 用户问“接下来几个月/未来几个月/半年/一年”时，每一个月份都必须成为独立章节，禁止只用“三行式”概括。
- ${monthlyLength}
- 每个月章节必须包含：本月主题、与原局/大运/流年的作用关系、事业/财富/关系/身心四个维度中的重点变化、上旬/中旬/下旬关键窗口、可执行建议。
- 如果关注方向只有“整体”，也要自然覆盖事业、财富、人际关系、情绪身心和学习成长；如果用户指定了 focus，则优先展开指定方向。
- 关键时间点只能基于给定月柱/日柱表推导。逐月表没有具体日柱时，用“上旬/中旬/下旬/交节前后”等窗口表达，不要编造具体日期。
- 用报告式标题、清晰层级和自然段落写作，内容要有密度、有解释、有行动价值，避免空泛鸡汤。`
}

export function buildAvatarUserText(params: AvatarParams): string {
  const profileBlock =
    params.combineBazi && params.profile
      ? `\n【命主信息（用于五行/风格倾向参考）】\n${describeParticipant(params.profile)}`
      : params.combineBazi
      ? `\n【提示】用户希望结合八字，但未提供命主信息，请略过五行风格段并提示用户补充。`
      : `\n【提示】用户未开启结合八字，请略过五行风格段。`

  return `${FEATURE_SENTINELS.avatar}

请分析下方上传的头像图片，并结合命理参考给出建议。
${profileBlock}

请按系统提示中要求的 6 段式结构输出。`
}

export function buildLifePathUserMessage(params: LifePathParams): string {
  return `${FEATURE_SENTINELS.lifepath}

【命主信息】
${describeParticipant(params.profile)}

请按系统提示中要求的结构，做一次贯穿一生的脉络梳理与总体分析。`
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
      missing.push('participants.baziText 或 pillars（请先使用 Bazi Analysis Results 创建人物）')
    }
    if (p.subtype === 'event' && !p.eventDesc) missing.push('eventDesc')
  } else if (kind === 'fortune') {
    const p = params as FortuneParams
    if (!hasParticipant(p.profile)) missing.push('profile')
    else if (!hasBaziInfo(p.profile)) missing.push('profile.baziText 或 pillars（请先使用 Bazi Analysis Results 创建人物）')
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
    else if (!hasBaziInfo(p.profile)) missing.push('profile.baziText 或 pillars（请先使用 Bazi Analysis Results 创建人物）')
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
  const systemPrompt =
    getFeaturePrompt(kind, useUltraPrompt) + complexityInstruction + reportInstruction

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
  if (!input.kind || !FEATURE_COSTS[input.kind]) {
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

  const cost = FEATURE_COSTS[input.kind]
  const preQuota = await getOrResetQuota(input.userId)
  const preUsedToday = preQuota.usedToday

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
    await refundApples(input.userId, cost)
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

function resolveFeatureMaxTokens(
  complexityMaxTokens?: number,
  reportPreference?: AgentReportPreference | null,
): number | undefined {
  const preferenceMaxTokens = getAgentReportPreferenceMaxTokens(reportPreference)
  if (preferenceMaxTokens && complexityMaxTokens) {
    return Math.min(preferenceMaxTokens, complexityMaxTokens)
  }
  return preferenceMaxTokens ?? complexityMaxTokens
}

async function refundFeatureInvocation(invocation: FeatureInvocation) {
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
    const complexityProfile = invocation.complexity
      ? getAgentComplexityProfile(invocation.complexity)
      : null
    const result = await callLLM(invocation.messagesWithSystem, invocation.task, {
      signal: opts.signal,
      maxTokens:
        opts.maxTokens ??
        resolveFeatureMaxTokens(
          complexityProfile?.featureMaxTokens,
          invocation.reportPreference,
        ),
      thinking: opts.thinking ?? complexityProfile?.thinking,
      reasoningEffort: opts.reasoningEffort ?? complexityProfile?.reasoningEffort,
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
    chunking: opts.drip ? 'character' : 'semantic',
    dripDelayMs: opts.dripDelayMs,
    semanticDelayMs: opts.dripDelayMs ?? 60,
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
    const complexityProfile = invocation.complexity
      ? getAgentComplexityProfile(invocation.complexity)
      : null
    const result = await callLLMTextWithUsage(
      invocation.messagesWithSystem,
      invocation.task,
      {
        signal: opts.signal,
        maxTokens: resolveFeatureMaxTokens(
          complexityProfile?.featureMaxTokens,
          invocation.reportPreference,
        ),
        thinking: complexityProfile?.thinking,
        reasoningEffort: complexityProfile?.reasoningEffort,
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
