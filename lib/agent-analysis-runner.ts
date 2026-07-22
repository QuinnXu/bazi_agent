import { ServiceHttpError } from '@/lib/chat-service'
import { callLLM, createUnifiedStreamProcessor, type LlmTaskKind } from '@/lib/llm'
import { consumeApples, getOrResetQuota, refundApples } from '@/lib/quota'
import { createChargeSettledStream } from '@/lib/quota-stream'
import { createUsageTrackedStream } from '@/lib/token-usage'
import { buildAgentAnalysisMessages } from '@/lib/agent-prompt-builder'
import { getAgentReportAppleCost, resolveBillingPlan } from '@/lib/apple-costs'
import {
  getAgentComplexityProfile,
  type AgentComplexityMode,
} from '@/lib/agent-complexity'
import type { AgentAnalysisRequest, AgentOutputDepth } from '@/lib/agent-workflow-types'

export interface AgentAnalysisStreamResult {
  stream: ReadableStream
  model: string
  task: LlmTaskKind
  inputTokens: number
  appleCost: number
}

export function getAgentAnalysisDepthCost(depth: Exclude<AgentOutputDepth, 'chat'>): number {
  return getAgentReportAppleCost(depth)
}

export function getAgentAnalysisMaxTokens(
  depth: Exclude<AgentOutputDepth, 'chat'>,
  request: AgentAnalysisRequest,
): number {
  if (depth === 'concise') return 6_000
  if (depth === 'detailed') return 128_000
  return 24_000
}

export function getAgentAnalysisGenerationOptions(
  request: AgentAnalysisRequest,
  complexity?: AgentComplexityMode | null,
): {
  maxTokens: number
  thinking: ReturnType<typeof getAgentComplexityProfile>['thinking']
  reasoningEffort: ReturnType<typeof getAgentComplexityProfile>['reasoningEffort']
} {
  const complexityProfile = getAgentComplexityProfile(complexity)
  return {
    maxTokens: getAgentAnalysisMaxTokens(request.depth, request),
    thinking: complexityProfile.thinking,
    reasoningEffort: complexityProfile.reasoningEffort,
  }
}

export async function runAgentAnalysisStream(
  input: {
    userId: string
    request: AgentAnalysisRequest
    complexity?: AgentComplexityMode | null
    chargeApples?: boolean
    skipUsageTracking?: boolean
  },
  opts: {
    signal?: AbortSignal
  } = {},
): Promise<AgentAnalysisStreamResult> {
  const depth = input.request.depth
  const chargeApples = input.chargeApples !== false
  const quota = chargeApples ? await getOrResetQuota(input.userId) : null
  const appleCost = chargeApples
    ? getAgentReportAppleCost(depth, resolveBillingPlan(quota?.tier))
    : 0
  let chargeId: string | null = null

  if (chargeApples) {
    const preQuota = await consumeApples(input.userId, appleCost, { enforceFairUse: true })
    if (!preQuota.success) {
      if (preQuota.fairUseLimited) {
        throw new ServiceHttpError(429, {
          error: 'fair_use_limited',
          message: '当前账号的生成任务过于频繁，请稍后再试。',
          retryAfterSeconds: preQuota.retryAfterSeconds,
        })
      }
      throw new ServiceHttpError(403, {
        error: 'quota_exceeded',
        message: `这次分析需要 ${appleCost} 个苹果🍎，今天的库存不太够啦。`,
        required: appleCost,
        remaining: preQuota.quota.remaining,
        dailyLimit: preQuota.quota.dailyLimit,
      })
    }
    chargeId = preQuota.chargeId
  }

  const messages = buildAgentAnalysisMessages(input.request)
  const task: LlmTaskKind = 'apple_report'
  const generationOptions = getAgentAnalysisGenerationOptions(input.request, input.complexity)
  let llmResult: Awaited<ReturnType<typeof callLLM>>
  try {
    llmResult = await callLLM(messages, task, {
      signal: opts.signal,
      maxTokens: generationOptions.maxTokens,
      thinking: generationOptions.thinking,
      reasoningEffort: generationOptions.reasoningEffort,
    })
  } catch (error) {
    if (chargeId) await refundApples(input.userId, chargeId)
    throw error
  }

  const baseStream = createUnifiedStreamProcessor(llmResult.response, {
    chunking: 'immediate',
    logLabel: `agent_analysis:${depth}`,
  })
  const billableStream = chargeId
    ? createChargeSettledStream(baseStream, { userId: input.userId, chargeId })
    : baseStream
  const trackedStream = input.skipUsageTracking
    ? billableStream
    : createUsageTrackedStream(billableStream, {
        userId: input.userId,
        source: 'agent_analysis',
        mode: 'agent',
        model: llmResult.config.model,
        task,
        inputTokens: llmResult.inputTokens,
        featureKind: null,
      })

  return {
    stream: trackedStream,
    model: llmResult.config.model,
    task,
    inputTokens: llmResult.inputTokens,
    appleCost,
  }
}
