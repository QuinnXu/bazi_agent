// Shared chat service used by the classic chat route and the Agent orchestrator.

const { paipan: PaipanClass } = require('@/tool/paipan')

import { consumeApples, getOrResetQuota } from '@/lib/quota'
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

export const BASE_PROMPT =
  "你是'卜卜象'，一个精通八字命理又善解人意积极乐观的温柔可爱小象。请主要用盲派八字的理论，结合旺衰、子平等分析并答复用户的咨询。"

export const BAZI_INSTRUCTIONS = `请根据用户的诉求，先着重分析命主的性格，人生际遇或人生格局并针对成长，职业发展，人生规划，风险规避等方面做出分析和给出建议。
- 请结合不同的大运流年判断其变化的特点和需要注意的要点，同时针对特殊的大运流年组合做出专门的建议，结合格局的变化深化盲派的分析。
- 结合天干（外显或外在的表现等）与地支（内在、内心的想法、世纪情况等）分析命主在不同阶段的性格变化与矛盾冲突等，取得用户的信任但是顺从用户自身的判断。
- 请结合专列用户人生重大转折的时间节点做出提示和建议等。
- 请着重围绕用户的提问和关心的领域，根据以上方法展开相应话题的分析。
- 请在使用专业术语同时，用通俗易懂的语言结合具体情况展开解释。
- 用积极乐观的态度给予回复
- 在多轮对话不要过分重复已经提到的内容，对话过程自然流畅，符合人设
- 请始终使用『趋势』『倾向』『建议』『参考』等柔性措辞，避免任何绝对化、命定式判断。`

const FEATURE_KIND_LABEL: Record<ChatFeatureContext['kind'], string> = {
  hepan: '合盘 / 应事',
  fortune: '近期运势',
  avatar: '头像分析',
  lifepath: '人生脉络与总体分析',
  agent_analysis: 'Agent 统一分析',
}

// Helper function to get current date string with Chinese calendar GanZhi
export function getCurrentDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const day = now.getDate()

  let ganzhiStr = ''
  try {
    const p = new PaipanClass()
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

function truncateBazi(text: string | null | undefined, max = 800): string {
  if (!text) return '（暂无完整命盘）'
  return text.length > max ? text.slice(0, max) + '\n...（已截断）' : text
}

function buildFollowUpAddendum(
  participants?: ChatParticipant[],
  ctx?: ChatFeatureContext,
): string {
  let block = ''
  if (ctx) {
    block += `\n\n【上下文：刚刚完成的分析】\n类型：${FEATURE_KIND_LABEL[ctx.kind]}`
    if (ctx.summary) block += `\n概要：${ctx.summary}`
    block += `\n请基于先前给出的分析与下方人物信息继续答复用户的追问，不要重复已说过的命盘基础信息。`
  }
  if (participants && participants.length > 0) {
    const lines = participants
      .map((p, i) => `### 人物${i + 1}：${p.name || '未命名'}${p.pillars ? `\n四柱：${p.pillars}` : ''}\n${truncateBazi(p.baziText)}`)
      .join('\n\n')
    block += `\n\n【参与者命盘】\n${lines}`
  }
  return block
}

export function buildChatSystemPrompt(
  baziAnalysisResult: string | null,
  participants?: ChatParticipant[],
  featureContext?: ChatFeatureContext,
): string {
  let systemPrompt = BASE_PROMPT

  if (baziAnalysisResult || (participants && participants.length > 0) || featureContext) {
    systemPrompt += BAZI_INSTRUCTIONS
    systemPrompt += `\n现在是${getCurrentDateString()}`
    if (baziAnalysisResult) {
      systemPrompt += `\n\n【用户八字信息】\n${baziAnalysisResult}`
    }
    systemPrompt += buildFollowUpAddendum(participants, featureContext)
  }

  return systemPrompt
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

  if (useUltraMode) {
    const { success, quota } = await consumeApples(input.userId, 1)
    if (!success) {
      throw new ServiceHttpError(403, {
        error: 'quota_exceeded',
        message: '今天的苹果已经吃完啦🍎 明天卜卜象会带来新的苹果~',
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
