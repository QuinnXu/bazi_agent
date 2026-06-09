import { callLLMTextWithUsage } from '@/lib/llm'
import { recordLlmUsage, type LlmUsageMode } from '@/lib/token-usage'
import {
  buildFollowUpSuggestionsPrompt,
  isTemplateFollowUpSuggestion,
} from '@/lib/bubu-content'

export interface FollowUpSuggestionMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface FollowUpSuggestionContext {
  kind?: string | null
  summary?: string | null
  people?: Array<{ name?: string | null }>
  participants?: Array<{ name?: string | null }>
  timeRange?: { label?: string | null; start?: string | null; end?: string | null } | null
  matter?: string | null
}

export interface GenerateFollowUpSuggestionsInput {
  userId: string
  assistantContent: string
  previousUserContent?: string | null
  recentMessages?: FollowUpSuggestionMessage[]
  mode?: LlmUsageMode
  reportType?: string | null
  featureContext?: FollowUpSuggestionContext | null
  participants?: Array<{ name?: string | null }>
  pendingKind?: string | null
}

const FOLLOW_UP_LIMIT = 3
const DEFAULT_TIMEOUT_MS = 2500

function limitText(value: unknown, max: number): string {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function createTimeoutSignal(parent?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const abortFromParent = () => controller.abort(parent?.reason)
  if (parent?.aborted) controller.abort(parent.reason)
  parent?.addEventListener('abort', abortFromParent, { once: true })
  const timer = setTimeout(() => controller.abort(new Error('follow-up suggestions timeout')), DEFAULT_TIMEOUT_MS)
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      parent?.removeEventListener('abort', abortFromParent)
    },
  }
}

function compactJson(value: unknown, max = 2400): string {
  const text = JSON.stringify(value || null)
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function extractJsonObject(text: string): any | null {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
}

function normalizeSuggestion(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw
    .replace(/^[-*\d.、)）\s]+/, '')
    .replace(/[。.!！]+$/u, '')
    .replace(/\s+/g, '')
    .trim()
  if (!text || text.length < 4 || text.length > 36) return null
  if (isTemplateFollowUpSuggestion(text)) return null
  return /[？?]$/u.test(text) ? text : `${text}？`
}

function normalizeSuggestions(raw: any): string[] {
  const values = Array.isArray(raw?.suggestions) ? raw.suggestions : Array.isArray(raw) ? raw : []
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const text = normalizeSuggestion(value)
    if (!text) continue
    const key = text.replace(/[？?]/g, '')
    if (seen.has(key)) continue
    seen.add(key)
    result.push(text)
    if (result.length >= FOLLOW_UP_LIMIT) break
  }
  return result
}

function summarizeParticipants(input: GenerateFollowUpSuggestionsInput): string[] {
  const names = new Set<string>()
  const add = (name?: string | null) => {
    const trimmed = name?.trim()
    if (trimmed) names.add(trimmed)
  }
  input.participants?.forEach(person => add(person.name))
  input.featureContext?.participants?.forEach(person => add(person.name))
  input.featureContext?.people?.forEach(person => add(person.name))
  return Array.from(names).slice(0, 6)
}

function buildMessages(input: GenerateFollowUpSuggestionsInput) {
  const recentMessages = (input.recentMessages || [])
    .slice(-6)
    .map(message => ({
      role: message.role,
      content: limitText(message.content, 420),
    }))

  const context = {
    mode: input.mode || 'classic',
    reportType: input.reportType || null,
    pendingKind: input.pendingKind || null,
    previousUserContent: limitText(input.previousUserContent, 360),
    participants: summarizeParticipants(input),
    featureContext: input.featureContext
      ? {
          kind: input.featureContext.kind || null,
          summary: limitText(input.featureContext.summary, 420),
          timeRange: input.featureContext.timeRange || null,
          matter: limitText(input.featureContext.matter, 260),
        }
      : null,
    recentMessages,
    assistantContent: limitText(input.assistantContent, 1800),
  }

  return [
    {
      role: 'system',
      content: buildFollowUpSuggestionsPrompt(),
    },
    {
      role: 'user',
      content: compactJson(context),
    },
  ]
}

export async function generateFollowUpSuggestions(
  input: GenerateFollowUpSuggestionsInput,
  opts: { signal?: AbortSignal } = {},
): Promise<string[]> {
  if (!process.env.DEEPSEEK_API_KEY) return []
  if (!input.assistantContent?.trim()) return []
  if (input.pendingKind && input.pendingKind !== 'ready_to_analyze') return []

  const timeout = createTimeoutSignal(opts.signal)
  try {
    const result = await callLLMTextWithUsage(buildMessages(input), 'follow_up_suggestions', {
      signal: timeout.signal,
      maxTokens: 500,
      temperature: 0.4,
      thinking: 'disabled',
      reasoningEffort: 'none',
    })
    await recordLlmUsage({
      userId: input.userId,
      source: 'agent_tool',
      mode: input.mode || 'classic',
      model: result.config.model,
      task: 'follow_up_suggestions',
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      featureKind: input.reportType || input.featureContext?.kind || null,
    })
    return normalizeSuggestions(extractJsonObject(result.text))
  } catch (error) {
    console.warn('[follow-up-suggestions] fallback to local suggestions', error)
    return []
  } finally {
    timeout.cleanup()
  }
}
