// Shared chat service used by the classic chat route and the Agent orchestrator.

const { paipan: PaipanClass } = require('@/tool/paipan')

import { consumeApples, getOrResetQuota } from '@/lib/quota'
import { CLASSIC_CHAT_APPLE_COST } from '@/lib/apple-costs'
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
}

export interface ClassicChatOptions {
  signal?: AbortSignal
}

export interface ClassicChatResult {
  stream: ReadableStream
  task: LlmTaskKind
  model: string
  inputTokens: number
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
  const preQuota = await getOrResetQuota(input.userId)
  const preUsedToday = preQuota.usedToday

  if (useUltraMode && CLASSIC_CHAT_APPLE_COST > 0) {
    const { success, quota } = await consumeApples(input.userId, CLASSIC_CHAT_APPLE_COST)
    if (!success) {
      throw new ServiceHttpError(403, {
        error: 'quota_exceeded',
        message: `这次经典投喂需要 ${CLASSIC_CHAT_APPLE_COST} 个苹果🍎，今天的库存不太够啦。`,
        required: CLASSIC_CHAT_APPLE_COST,
        remaining: quota.remaining,
        dailyLimit: quota.dailyLimit,
      })
    }
  }

  const task = pickLlmTask({
    consumesApple: useUltraMode,
    preUsedToday,
    isAvatar: false,
  })
  const complexityProfile = getAgentComplexityProfile(input.complexity)

  const messagesWithSystem = buildClassicMessages(input)
  const { response, config, inputTokens } = await callLLM(messagesWithSystem, task, {
    signal: opts.signal,
    maxTokens: complexityProfile.answerMaxTokens,
    thinking: complexityProfile.thinking,
    reasoningEffort: complexityProfile.reasoningEffort,
  })
  const baseStream = createUnifiedStreamProcessor(response, {
    chunking: 'immediate',
  })
  const stream = createUsageTrackedStream(baseStream, {
    userId: input.userId,
    source: 'classic_chat',
    mode: 'classic',
    model: config.model,
    task,
    inputTokens,
  })

  return { stream, task, model: config.model, inputTokens }
}
