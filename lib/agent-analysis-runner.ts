import { ServiceHttpError } from '@/lib/chat-service'
import { callLLM, createUnifiedStreamProcessor, type LlmTaskKind } from '@/lib/llm'
import { consumeApples, refundApples } from '@/lib/quota'
import { createUsageTrackedStream } from '@/lib/token-usage'
import { buildAgentAnalysisMessages } from '@/lib/agent-prompt-builder'
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
  if (depth === 'concise') return 1
  if (depth === 'detailed') return 4
  return 2
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

function createRefundableAgentStream(
  upstream: ReadableStream,
  refundOnFail: () => Promise<void>,
): ReadableStream {
  let receivedAnyBytes = false
  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value && value.length > 0) receivedAnyBytes = true
          controller.enqueue(value)
        }
        if (!receivedAnyBytes) await refundOnFail()
        controller.close()
      } catch (error) {
        const isAbort = !!(
          error &&
          typeof error === 'object' &&
          'name' in error &&
          String((error as any).name) === 'AbortError'
        )
        if (!isAbort || !receivedAnyBytes) {
          try {
            await refundOnFail()
          } catch {
            /* ignore */
          }
        }
        try {
          controller.error(error)
        } catch {
          /* stream already closed */
        }
      }
    },
  })
}

export async function runAgentAnalysisStream(
  input: {
    userId: string
    request: AgentAnalysisRequest
    complexity?: AgentComplexityMode | null
  },
  opts: {
    signal?: AbortSignal
  } = {},
): Promise<AgentAnalysisStreamResult> {
  const depth = input.request.depth
  const appleCost = getAgentAnalysisDepthCost(depth)
  const preQuota = await consumeApples(input.userId, appleCost)
  if (!preQuota.success) {
    throw new ServiceHttpError(403, {
      error: 'quota_exceeded',
      message: `这次分析需要 ${appleCost} 个苹果🍎，今天的库存不太够啦。可以选简洁版，或者明天再来。`,
      required: appleCost,
      remaining: preQuota.quota.remaining,
      dailyLimit: preQuota.quota.dailyLimit,
    })
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
    await refundApples(input.userId, appleCost)
    throw error
  }

  const baseStream = createUnifiedStreamProcessor(llmResult.response, {
    chunking: 'immediate',
    logLabel: `agent_analysis:${depth}`,
  })
  const refundableStream = createRefundableAgentStream(
    baseStream,
    async () => {
      await refundApples(input.userId, appleCost)
    },
  )
  const trackedStream = createUsageTrackedStream(refundableStream, {
    userId: input.userId,
    source: 'agent_analysis',
    mode: 'agent',
    model: llmResult.config.model,
    task,
    inputTokens: llmResult.inputTokens,
    featureKind: 'agent_analysis',
  })

  return {
    stream: trackedStream,
    model: llmResult.config.model,
    task,
    inputTokens: llmResult.inputTokens,
    appleCost,
  }
}
