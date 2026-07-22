// Shared chat service used by the classic chat route and the Agent orchestrator.

const { paipan: PaipanClass } = require('@/tool/paipan')

import { consumeApples, getOrResetQuota, refundApples } from '@/lib/quota'
import { createChargeSettledStream } from '@/lib/quota-stream'
import { getClassicChatAppleCost, resolveBillingPlan } from '@/lib/apple-costs'
import {
  getAgentComplexityProfile,
  type AgentComplexityMode,
} from '@/lib/agent-complexity'
import {
  callLLM,
  createUnifiedStreamProcessor,
  pickLlmTask,
  type LlmTaskKind,
} from '@/lib/llm'
import { createUsageTrackedStream } from '@/lib/token-usage'
import { buildChatSystemPrompt as buildBubuChatSystemPrompt } from '@/lib/bubu-content'

export { BASE_PROMPT, BAZI_INSTRUCTIONS } from '@/lib/bubu-content'

let sharedPaipan: any = null

function getPaipan() {
  if (!sharedPaipan) {
    sharedPaipan = new PaipanClass()
  }
  return sharedPaipan
}

// ==================== Types ====================

export interface ChatParticipant {
  name: string
  baziText?: string | null
  pillars?: string | null
}

export interface ChatFeatureContext {
  kind: 'hepan' | 'fortune' | 'avatar' | 'lifepath' | 'agent_analysis'
  summary?: string
  people?: ChatParticipant[]
  timeRange?: { label?: string; start: string; end: string } | null
  matter?: string | null
}

export interface ClassicChatInput {
  userId: string
  messages: any[]
  baziAnalysisResult?: string | null
  useUltraMode?: boolean
  participants?: ChatParticipant[]
  featureContext?: ChatFeatureContext
  complexity?: AgentComplexityMode | null
  guestTrial?: boolean
  skipUsageTracking?: boolean
}

export interface ClassicChatOptions {
  signal?: AbortSignal
}

export interface ClassicChatResult {
  stream: ReadableStream
  task: LlmTaskKind
  model: string
  inputTokens: number
  appleCost: number
}

export class ServiceHttpError extends Error {
  status: number
  body: Record<string, unknown>

  constructor(status: number, body: Record<string, unknown>, message?: string) {
    super(message || String(body.message || body.error || 'Service error'))
    this.name = 'ServiceHttpError'
    this.status = status
    this.body = body
  }
}

// ==================== System Prompts ====================

// Helper function to get current date string with Chinese calendar GanZhi
export function getCurrentDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const day = now.getDate()

  let ganzhiStr = ''
  try {
    const p = getPaipan()
    const result = p.GetGZ(year, month, day, 12, 0, 0)
    if (result) {
      const [tg, dz] = result
      const yearGZ = p.ctg[tg[0]] + p.cdz[dz[0]]
      const monthGZ = p.ctg[tg[1]] + p.cdz[dz[1]]
      const dayGZ = p.ctg[tg[2]] + p.cdz[dz[2]]
      ganzhiStr = `(${yearGZ}年${monthGZ}月${dayGZ}日)`
    }
  } catch (e) {
    console.error('GanZhi calculation error:', e)
  }

  return `${year}年${month}月${day}日${ganzhiStr}`
}

export function buildChatSystemPrompt(
  baziAnalysisResult: string | null,
  participants?: ChatParticipant[],
  featureContext?: ChatFeatureContext,
): string {
  return buildBubuChatSystemPrompt({
    currentDateString: getCurrentDateString(),
    baziAnalysisResult,
    participants,
    featureContext,
  })
}

export function buildClassicMessages(input: {
  messages: any[]
  baziAnalysisResult?: string | null
  participants?: ChatParticipant[]
  featureContext?: ChatFeatureContext
}): any[] {
  const systemPrompt = buildChatSystemPrompt(
    input.baziAnalysisResult ?? null,
    input.participants,
    input.featureContext,
  )
  return [
    { role: 'system', content: systemPrompt },
    ...input.messages,
  ]
}

export async function runClassicChatStream(
  input: ClassicChatInput,
  opts: ClassicChatOptions = {},
): Promise<ClassicChatResult> {
  const useUltraMode = input.useUltraMode ?? false

  // Peek quota before consuming so first-of-day routing stays unchanged.
  const preQuota = input.guestTrial
    ? null
    : await getOrResetQuota(input.userId)
  const preUsedToday = preQuota?.usedToday ?? 0
  const appleCost = input.guestTrial || !useUltraMode
    ? 0
    : getClassicChatAppleCost(resolveBillingPlan(preQuota?.tier))
  let chargeId: string | null = null

  if (!input.guestTrial && (useUltraMode || preQuota?.tier === 'ultra')) {
    const charge = await consumeApples(input.userId, appleCost, { enforceFairUse: true })
    const { success, quota } = charge
    if (!success) {
      if (charge.fairUseLimited) {
        throw new ServiceHttpError(429, {
          error: 'fair_use_limited',
          message: '当前账号的生成任务过于频繁，请稍后再试。',
          retryAfterSeconds: charge.retryAfterSeconds,
        })
      }
      throw new ServiceHttpError(403, {
        error: 'quota_exceeded',
        message: `这次经典投喂需要 ${appleCost} 个苹果🍎，今天的库存不太够啦。`,
        required: appleCost,
        remaining: quota.remaining,
        dailyLimit: quota.dailyLimit,
      })
    }
    chargeId = charge.chargeId
  }

  const task = pickLlmTask({
    consumesApple: useUltraMode,
    preUsedToday,
    isAvatar: false,
  })
  const complexityProfile = getAgentComplexityProfile(input.complexity)

  const messagesWithSystem = buildClassicMessages(input)
  let llmResult: Awaited<ReturnType<typeof callLLM>>
  try {
    llmResult = await callLLM(messagesWithSystem, task, {
      signal: opts.signal,
      maxTokens: complexityProfile.answerMaxTokens,
      thinking: complexityProfile.thinking,
      reasoningEffort: complexityProfile.reasoningEffort,
    })
  } catch (error) {
    if (chargeId) await refundApples(input.userId, chargeId)
    throw error
  }
  const { response, config, inputTokens } = llmResult
  const baseStream = createUnifiedStreamProcessor(response, {
    chunking: 'immediate',
  })
  const billableStream = chargeId
    ? createChargeSettledStream(baseStream, { userId: input.userId, chargeId })
    : baseStream
  const stream = input.skipUsageTracking
    ? billableStream
    : createUsageTrackedStream(billableStream, {
        userId: input.userId,
        source: 'classic_chat',
        mode: 'classic',
        model: config.model,
        task,
        inputTokens,
      })

  return { stream, task, model: config.model, inputTokens, appleCost }
}
