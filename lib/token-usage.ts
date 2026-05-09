import { createServiceClient } from '@/lib/supabase/client'
import {
  estimateTokensForText,
} from '@/lib/token-estimator'
import type { LlmTaskKind } from '@/lib/llm'

export type LlmUsageSource =
  | 'classic_chat'
  | 'agent_planner'
  | 'agent_analysis'
  | 'feature_page'
  | 'agent_tool'

export type LlmUsageMode = 'classic' | 'agent' | 'feature'
export type LlmUsageStatus = 'completed' | 'empty' | 'aborted' | 'failed'

export interface LlmUsageRecord {
  userId: string
  source: LlmUsageSource
  mode: LlmUsageMode
  model: string
  task: LlmTaskKind
  inputTokens: number
  outputTokens: number
  featureKind?: string | null
  status?: LlmUsageStatus
}

function safeTokenCount(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

export async function recordLlmUsage(record: LlmUsageRecord): Promise<void> {
  const inputTokens = safeTokenCount(record.inputTokens)
  const outputTokens = safeTokenCount(record.outputTokens)
  const totalTokens = inputTokens + outputTokens

  try {
    const supabase = createServiceClient()
    const { error } = await supabase
      .from('llm_usage_events')
      .insert({
        user_id: record.userId,
        source: record.source,
        mode: record.mode,
        feature_kind: record.featureKind || null,
        model: record.model,
        task: record.task,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        status: record.status || 'completed',
      } as any)

    if (error) {
      console.warn('[token-usage] record failed:', error.message)
    }
  } catch (error) {
    console.warn(
      '[token-usage] record skipped:',
      error instanceof Error ? error.message : String(error),
    )
  }
}

export interface UsageTrackedStreamOptions {
  userId: string
  source: LlmUsageSource
  mode: LlmUsageMode
  model: string
  task: LlmTaskKind
  inputTokens: number
  featureKind?: string | null
}

export function createUsageTrackedStream(
  upstream: ReadableStream,
  usage: UsageTrackedStreamOptions,
): ReadableStream {
  const decoder = new TextDecoder()
  let output = ''
  let receivedAnyBytes = false
  let recorded = false

  const finalize = async (status: LlmUsageStatus) => {
    if (recorded) return
    recorded = true
    await recordLlmUsage({
      ...usage,
      outputTokens: estimateTokensForText(output),
      status,
    })
  }

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value && value.length > 0) {
            receivedAnyBytes = true
            output += decoder.decode(value, { stream: true })
          }
          controller.enqueue(value)
        }

        output += decoder.decode()
        await finalize(receivedAnyBytes ? 'completed' : 'empty')
        controller.close()
      } catch (error) {
        output += decoder.decode()
        const isAbort = !!(
          error &&
          typeof error === 'object' &&
          'name' in error &&
          String((error as any).name) === 'AbortError'
        )
        await finalize(isAbort ? 'aborted' : 'failed')
        try {
          controller.error(error)
        } catch {
          /* stream already closed */
        }
      }
    },
  })
}
