/**
 * Unified LLM router for the BuBuXiang chatbot.
 *
 * Routing rules (production):
 *   - Main text answers / reports       → DeepSeek V4 Pro
 *   - Agent planning / extractor calls  → DeepSeek V4 Flash
 *   - Apple-consuming avatar (multimodal) → google/gemini-3.1-flash-lite-preview via OpenRouter
 *
 * Routing rules (local dev):
 *   - Same as production by default.
 *   - Set LLM_DEV_PROXY=1 to force avatar/multimodal calls through local proxy.
 *
 * Model ids are environment-configurable so production can track provider naming changes:
 *   - DEEPSEEK_V4_FLASH_MODEL
 *   - DEEPSEEK_V4_PRO_MODEL
 *   - GEMINI_3_1_IMAGE_MODEL
 */

import { estimateTokensForMessages, estimateTokensForText } from '@/lib/token-estimator'
import {
  sanitizeReplacementChars,
  takeSemanticStreamChunk,
  takeUnicodeStreamChunk,
} from '@/lib/text-sanitize'

const VERBOSE_LLM_LOGS =
  process.env.NODE_ENV !== 'production' ||
  process.env.LLM_DEBUG_LOGS === '1' ||
  process.env.LLM_DEBUG_LOGS === 'true'

// ==================== Types ====================

export type LlmTaskKind =
  | 'free'          // free chat (no apple)
  | 'agent_planner' // Agent planner / middle orchestration call
  | 'agent_extractor' // low-latency Agent correction/slot extractor
  | 'follow_up_suggestions' // low-latency contextual follow-up suggestions
  | 'apple_first'   // reserved compatibility name; text now prefers DeepSeek
  | 'apple_avatar'  // subsequent apple call, avatar (needs multimodal)
  | 'apple_report'  // subsequent apple call, long report (fortune/hepan/lifepath)
  | 'apple_other'   // subsequent apple call, text-only

export interface LlmRouteContext {
  consumesApple: boolean
  // Kept for compatibility with older quota-aware callers.
  preUsedToday: number
  isAvatar: boolean
}

export interface LlmConfig {
  endpoint: string  // full URL, ends with /chat/completions
  apiKey: string
  model: string
  isOpenRouter: boolean
  isReasoning: boolean // adds reasoning.effort if supported
  thinking?: 'enabled' | 'disabled'
  reasoningEffort?: 'high' | 'max'
  multimodal: boolean
  /**
   * `null` means model itself supports JSON role messages without provider hints
   */
  providerHint: { order: string[] } | null
  // Suggested generation params
  temperature: number
  maxTokens: number
  // Display label for logging
  label: string
}

export type LlmRequestReasoningEffort = 'none' | 'high' | 'max'

export interface LlmRequestOverrides {
  signal?: AbortSignal
  maxTokens?: number
  temperature?: number
  thinking?: 'enabled' | 'disabled'
  reasoningEffort?: LlmRequestReasoningEffort
}

export type LlmToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } }

export interface LlmToolDefinition {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

export interface LlmToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface LlmToolRequestOptions extends LlmRequestOverrides {
  tools: LlmToolDefinition[]
  toolChoice?: LlmToolChoice
  parallelToolCalls?: boolean
}

// ==================== Helpers ====================

function shouldUseLocalProxy(): boolean {
  return process.env.LLM_DEV_PROXY === '1'
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '')
  const p = path.replace(/^\/+/, '')
  return `${b}/${p}`
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function truncateForLog(text: string, max = 600): string {
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function summarizeContentForLog(content: any): string {
  if (typeof content === 'string') return truncateForLog(content)
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return truncateForLog(part, 160)
        if (part?.type === 'text') return `text:${truncateForLog(String(part.text || ''), 160)}`
        if (part?.type === 'image_url') return 'image_url:[omitted]'
        return String(part?.type || 'unknown')
      })
      .join(' | ')
  }
  return truncateForLog(JSON.stringify(content || ''), 300)
}

function summarizeMessagesForLog(messages: any[]) {
  return messages.slice(-6).map((message, index) => ({
    index: Math.max(0, messages.length - 6) + index,
    role: message?.role,
    content: summarizeContentForLog(message?.content),
  }))
}

// ==================== Task selection ====================

export function pickLlmTask(ctx: LlmRouteContext): LlmTaskKind {
  if (!ctx.consumesApple) return 'free'
  if (ctx.isAvatar) return 'apple_avatar'
  return 'apple_other'
}

// ==================== Config ====================

function deepseekV4Config(overrides: Partial<LlmConfig> = {}): LlmConfig {
  const base =
    process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'
  const model = overrides.model || process.env.DEEPSEEK_V4_PRO_MODEL || 'deepseek-v4-pro'
  return {
    endpoint: joinUrl(base, 'chat/completions'),
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    model,
    isOpenRouter: false,
    isReasoning: true,
    thinking: 'enabled',
    reasoningEffort: 'high',
    multimodal: false,
    providerHint: null,
    temperature: 0.7,
    maxTokens: readPositiveInt('DEEPSEEK_V4_PRO_MAX_TOKENS', 64000),
    label: `${model} @ DeepSeek`,
    ...overrides,
  }
}

function deepseekV4FlashConfig(overrides: Partial<LlmConfig> = {}): LlmConfig {
  const model = process.env.DEEPSEEK_V4_FLASH_MODEL || 'deepseek-v4-flash'
  return deepseekV4Config({
    model,
    isReasoning: false,
    thinking: 'disabled',
    reasoningEffort: undefined,
    temperature: 0.75,
    maxTokens: 4000,
    label: `${model} @ DeepSeek`,
    ...overrides,
  })
}

export function selectLlmConfig(task: LlmTaskKind): LlmConfig {
  if (task === 'agent_extractor') {
    return deepseekV4FlashConfig({
      temperature: 0,
      maxTokens: 700,
      label: `${process.env.DEEPSEEK_V4_FLASH_MODEL || 'deepseek-v4-flash'} @ DeepSeek (agent-extractor)`,
    })
  }

  if (task === 'agent_planner') {
    return deepseekV4FlashConfig({
      temperature: 0.2,
      maxTokens: 3000,
      label: `${process.env.DEEPSEEK_V4_FLASH_MODEL || 'deepseek-v4-flash'} @ DeepSeek (agent-planner)`,
    })
  }

  if (task === 'follow_up_suggestions') {
    return deepseekV4FlashConfig({
      temperature: 0.4,
      maxTokens: 500,
      label: `${process.env.DEEPSEEK_V4_FLASH_MODEL || 'deepseek-v4-flash'} @ DeepSeek (follow-up-suggestions)`,
    })
  }

  // Free/ordinary chat is still a main answer, so it uses DeepSeek V4 Pro.
  if (task === 'free') {
    const model = process.env.DEEPSEEK_V4_PRO_MODEL || 'deepseek-v4-pro'
    return deepseekV4Config({
      label: `${model} @ DeepSeek (free-main)`,
    })
  }

  // Optional local proxy for explicit avatar/multimodal dev testing only.
  if (task === 'apple_avatar' && shouldUseLocalProxy()) {
    const base =
      process.env.LOCAL_LLM_BASE_URL || 'http://127.0.0.1:12345/v1'
    return {
      endpoint: joinUrl(base, 'chat/completions'),
      apiKey: process.env.LOCAL_LLM_API_KEY || 'local-dev',
      model: 'gemini-3.1-pro-preview',
      isOpenRouter: false,
      isReasoning: false,
      multimodal: true,
      providerHint: null,
      temperature: 1,
      maxTokens: readPositiveInt('GEMINI_3_1_IMAGE_MAX_TOKENS', 16000),
      label: 'gemini-3.1-pro-preview @ local-proxy (dev)',
    }
  }

  // Production apple-consuming tasks. Text calls prefer DeepSeek v4.
  if (task === 'apple_first') {
    const model = process.env.DEEPSEEK_V4_PRO_MODEL || 'deepseek-v4-pro'
    return deepseekV4Config({
      label: `${model} @ DeepSeek (first-apple-text)`,
    })
  }

  if (task === 'apple_avatar') {
    const model =
      process.env.GEMINI_3_1_IMAGE_MODEL ||
      'google/gemini-3.1-flash-lite-preview'
    return {
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: process.env.OPENROUTER_API_KEY || '',
      model,
      isOpenRouter: true,
      isReasoning: true,
      multimodal: true,
      providerHint: { order: ['Google'] },
      temperature: 1,
      maxTokens: readPositiveInt('GEMINI_3_1_IMAGE_MAX_TOKENS', 12000),
      label: `${model} @ OpenRouter`,
    }
  }

  // apple_report → deepseek-v4-pro. Complexity mode supplies thinking/max token limits.
  if (task === 'apple_report') {
    const model = process.env.DEEPSEEK_V4_PRO_MODEL || 'deepseek-v4-pro'
    return deepseekV4Config({
      label: `${model} @ DeepSeek (report)`,
    })
  }

  // apple_other → deepseek-v4-pro
  return deepseekV4Config()
}

function applyReasoningParams(body: any, config: LlmConfig) {
  if (config.isOpenRouter) {
    if (config.isReasoning) {
      body.reasoning = {
        effort: config.reasoningEffort === 'max' ? 'high' : (config.reasoningEffort || 'high'),
      }
    }
    return
  }

  if (config.thinking) {
    body.thinking = { type: config.thinking }
  }
  if (config.isReasoning) {
    body.reasoning_effort = config.reasoningEffort || 'high'
  }
}

function applyRequestOverrides(body: any, opts: LlmRequestOverrides) {
  if (opts.temperature !== undefined) body.temperature = opts.temperature
  if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens

  if (opts.thinking) {
    body.thinking = { type: opts.thinking }
  }
  if (opts.reasoningEffort === 'none') {
    delete body.reasoning_effort
    delete body.reasoning
    return
  }
  if (opts.reasoningEffort) {
    if (body.thinking?.type === 'disabled') {
      delete body.reasoning_effort
      delete body.reasoning
      return
    }
    if (body.reasoning) {
      body.reasoning.effort =
        opts.reasoningEffort === 'max' ? 'high' : opts.reasoningEffort
    } else {
      body.reasoning_effort = opts.reasoningEffort
    }
  }
}

function normalizeReasoningParams(body: any) {
  if (body.thinking?.type !== 'disabled') return
  delete body.reasoning_effort
  delete body.reasoning
}

function normalizeAssistantText(content: any): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (typeof part === 'string') return part
        if (typeof part?.text === 'string') return part.text
        return ''
      })
      .join('')
  }
  return ''
}

function normalizeToolArgumentText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function normalizeToolCalls(message: any): LlmToolCall[] {
  if (Array.isArray(message?.tool_calls)) {
    return message.tool_calls
      .filter((call: any) => call?.function?.name)
      .map((call: any, index: number) => ({
        id: String(call.id || `tool_call_${index}`),
        type: 'function' as const,
        function: {
          name: String(call.function.name),
          arguments: normalizeToolArgumentText(call.function.arguments),
        },
      }))
  }

  if (message?.function_call?.name) {
    return [{
      id: 'function_call_0',
      type: 'function',
      function: {
        name: String(message.function_call.name),
        arguments: normalizeToolArgumentText(message.function_call.arguments),
      },
    }]
  }

  return []
}

// ==================== Caller ====================

/**
 * Issue a streaming chat completion request to the configured upstream.
 * Returns the raw fetch Response (caller wraps the body with a stream processor).
 */
export async function callLLM(
  messagesWithSystem: any[],
  task: LlmTaskKind,
  opts: LlmRequestOverrides = {},
): Promise<{ response: Response; config: LlmConfig; inputTokens: number }> {
  const config = selectLlmConfig(task)
  const inputTokens = estimateTokensForMessages(messagesWithSystem)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  }
  if (config.isOpenRouter) {
    headers['HTTP-Referer'] =
      process.env.NEXT_PUBLIC_SITE_URL || 'https://www.xuzheran.cc'
    headers['X-Title'] = 'BuBuXiang AI Fortune Teller'
  }

  const body: any = {
    model: config.model,
    messages: messagesWithSystem,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: true,
  }
  if (config.isOpenRouter && config.providerHint) {
    body.provider = {
      order: config.providerHint.order,
      allow_fallbacks: false,
    }
  }
  applyReasoningParams(body, config)
  applyRequestOverrides(body, opts)
  normalizeReasoningParams(body)

  if (VERBOSE_LLM_LOGS) {
    console.log(`[LLM] Calling ${config.label} (task=${task})`)
    console.log('[LLM] request', JSON.stringify({
      task,
      model: config.model,
      stream: true,
      temperature: body.temperature,
      maxTokens: body.max_tokens,
      thinking: body.thinking,
      reasoningEffort: body.reasoning_effort || body.reasoning?.effort,
      estimatedInputTokens: inputTokens,
      messages: summarizeMessagesForLog(messagesWithSystem),
    }))
  }
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: opts.signal,
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[LLM] ${config.label} error:`, errorText.slice(0, 500))
    throw new Error(
      `LLM upstream error: ${response.status} (model=${config.model})`,
    )
  }

  if (VERBOSE_LLM_LOGS) {
    console.log(`[LLM] ${config.label} stream opened (status=${response.status})`)
  }
  return { response, config, inputTokens }
}

/**
 * Issue a non-streaming chat completion request to the configured upstream and
 * return the assistant text. Used for bounded Agent planning/tool synthesis.
 */
export async function callLLMText(
  messagesWithSystem: any[],
  task: LlmTaskKind,
  opts: LlmRequestOverrides = {},
): Promise<string> {
  const result = await callLLMTextWithUsage(messagesWithSystem, task, opts)
  return result.text
}

export async function callLLMWithTools(
  messagesWithSystem: any[],
  task: LlmTaskKind,
  opts: LlmToolRequestOptions,
): Promise<{
  content: string
  toolCalls: LlmToolCall[]
  rawMessage: any
  config: LlmConfig
  inputTokens: number
  outputTokens: number
  totalTokens: number
}> {
  const config = selectLlmConfig(task)
  const inputTokens = estimateTokensForMessages(messagesWithSystem)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  }
  if (config.isOpenRouter) {
    headers['HTTP-Referer'] =
      process.env.NEXT_PUBLIC_SITE_URL || 'https://www.xuzheran.cc'
    headers['X-Title'] = 'BuBuXiang AI Fortune Teller'
  }

  const body: any = {
    model: config.model,
    messages: messagesWithSystem,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: false,
    tools: opts.tools,
  }
  if (opts.toolChoice !== undefined) body.tool_choice = opts.toolChoice
  if (opts.parallelToolCalls !== undefined) body.parallel_tool_calls = opts.parallelToolCalls
  if (config.isOpenRouter && config.providerHint) {
    body.provider = {
      order: config.providerHint.order,
      allow_fallbacks: false,
    }
  }
  applyReasoningParams(body, config)
  applyRequestOverrides(body, opts)
  normalizeReasoningParams(body)

  if (VERBOSE_LLM_LOGS) {
    console.log(`[LLM] Calling ${config.label} tools (task=${task})`)
    console.log('[LLM] tool request', JSON.stringify({
      task,
      model: config.model,
      stream: false,
      temperature: body.temperature,
      maxTokens: body.max_tokens,
      thinking: body.thinking,
      reasoningEffort: body.reasoning_effort || body.reasoning?.effort,
      toolChoice: body.tool_choice || 'auto',
      tools: opts.tools.map(tool => tool.function.name),
      estimatedInputTokens: inputTokens,
      messages: summarizeMessagesForLog(messagesWithSystem),
    }))
  }

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: opts.signal,
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[LLM] ${config.label} tools error:`, errorText.slice(0, 500))
    throw new Error(
      `LLM upstream error: ${response.status} (model=${config.model})`,
    )
  }

  const json = await response.json()
  const message = json?.choices?.[0]?.message || {}
  const content = normalizeAssistantText(message.content)
  const toolCalls = normalizeToolCalls(message)
  const toolCallText = toolCalls
    .map(call => `${call.function.name} ${call.function.arguments}`)
    .join('\n')
  const outputTokens = estimateTokensForText(`${content}\n${toolCallText}`.trim())

  if (VERBOSE_LLM_LOGS) {
    console.log('[LLM] tool response', JSON.stringify({
      model: config.model,
      contentLength: content.length,
      toolCalls: toolCalls.map(call => call.function.name),
      preview: truncateForLog(content || toolCallText, 900),
    }))
  }

  return {
    content,
    toolCalls,
    rawMessage: message,
    config,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  }
}

export async function callLLMTextWithUsage(
  messagesWithSystem: any[],
  task: LlmTaskKind,
  opts: LlmRequestOverrides = {},
): Promise<{
  text: string
  config: LlmConfig
  inputTokens: number
  outputTokens: number
  totalTokens: number
}> {
  const config = selectLlmConfig(task)
  const inputTokens = estimateTokensForMessages(messagesWithSystem)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  }
  if (config.isOpenRouter) {
    headers['HTTP-Referer'] =
      process.env.NEXT_PUBLIC_SITE_URL || 'https://www.xuzheran.cc'
    headers['X-Title'] = 'BuBuXiang AI Fortune Teller'
  }

  const body: any = {
    model: config.model,
    messages: messagesWithSystem,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: false,
  }
  if (config.isOpenRouter && config.providerHint) {
    body.provider = {
      order: config.providerHint.order,
      allow_fallbacks: false,
    }
  }
  applyReasoningParams(body, config)
  applyRequestOverrides(body, opts)
  normalizeReasoningParams(body)

  if (VERBOSE_LLM_LOGS) {
    console.log(`[LLM] Calling ${config.label} text (task=${task})`)
    console.log('[LLM] request', JSON.stringify({
      task,
      model: config.model,
      stream: false,
      temperature: body.temperature,
      maxTokens: body.max_tokens,
      thinking: body.thinking,
      reasoningEffort: body.reasoning_effort || body.reasoning?.effort,
      estimatedInputTokens: inputTokens,
      messages: summarizeMessagesForLog(messagesWithSystem),
    }))
  }
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: opts.signal,
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[LLM] ${config.label} text error:`, errorText.slice(0, 500))
    throw new Error(
      `LLM upstream error: ${response.status} (model=${config.model})`,
    )
  }

  const json = await response.json()
  const content = json?.choices?.[0]?.message?.content
  const text = normalizeAssistantText(content)
  if (VERBOSE_LLM_LOGS) {
    if (text) {
      console.log('[LLM] text response', JSON.stringify({
        model: config.model,
        length: text.length,
        preview: truncateForLog(text, 900),
      }))
    } else {
      console.log('[LLM] text response empty', JSON.stringify({
        model: config.model,
        keys: Object.keys(json || {}),
      }))
    }
  }
  const outputTokens = estimateTokensForText(text)
  return {
    text,
    config,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  }
}

// ==================== Stream processor ====================

interface StreamOptions {
  /**
   * Drip output character-by-character for smooth UI. Default true.
   * Reasoning models like Gemini benefit from this; deepseek-v4-pro is also fine with drip.
   */
  drip?: boolean
  /**
   * Output pacing. Defaults to the legacy drip behavior unless explicitly set.
   */
  chunking?: 'character' | 'semantic' | 'immediate'
  /**
   * Drip delay in ms. Default 12 (~80 ch/s for Chinese).
   */
  dripDelayMs?: number
  /**
   * Semantic chunk delay in ms. Default 30.
   */
  semanticDelayMs?: number
  semanticMinChars?: number
  semanticMaxChars?: number
  logLabel?: string
}

/**
 * OpenAI-compatible SSE → text stream processor with optional <thinking>...</thinking>
 * stripping (no-op if absent) and optional character-level drip.
 *
 * Works with: DeepSeek V4 Flash/Pro, OpenRouter Gemini, local proxy Gemini.
 */
export function createUnifiedStreamProcessor(
  response: Response,
  opts: StreamOptions = {},
): ReadableStream {
  const mode = opts.chunking ?? (opts.drip === false ? 'immediate' : 'character')
  const drip = mode === 'character'
  const dripDelayMs = opts.dripDelayMs ?? 12
  const semanticDelayMs = opts.semanticDelayMs ?? opts.dripDelayMs ?? 30
  const semanticMinChars = opts.semanticMinChars ?? 8
  const semanticMaxChars = opts.semanticMaxChars ?? 90

  return new ReadableStream({
    async start(controller) {
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      const encoder = new TextEncoder()
      let buffer = ''
      let isInThinking = false
      let charQueue = ''
      let dripping = false
      let semanticQueue = ''
      let semanticFlushing = false
      let visibleChars = 0
      let lastFinishReason: string | null = null
      let loggedCompletion = false

      if (!reader) {
        controller.close()
        return
      }

      const flushImmediate = (text: string) => {
        if (!text) return
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          /* stream already closed */
        }
      }

      const logCompletion = (status: string) => {
        if (loggedCompletion || !opts.logLabel || !VERBOSE_LLM_LOGS) return
        loggedCompletion = true
        console.log('[LLM] stream completed', JSON.stringify({
          label: opts.logLabel,
          status,
          visibleChars,
          finishReason: lastFinishReason,
        }))
      }

      const dripChars = async () => {
        if (dripping) return
        dripping = true
        while (charQueue.length > 0) {
          const chars = takeUnicodeStreamChunk(charQueue)
          charQueue = charQueue.slice(chars.length)
          try {
            controller.enqueue(encoder.encode(chars))
          } catch {
            break
          }
          await new Promise(r => setTimeout(r, dripDelayMs))
        }
        dripping = false
      }

      const drainQueue = async () => {
        while (charQueue.length > 0) {
          const chars = takeUnicodeStreamChunk(charQueue)
          charQueue = charQueue.slice(chars.length)
          try {
            controller.enqueue(encoder.encode(chars))
          } catch {
            break
          }
          await new Promise(r => setTimeout(r, dripDelayMs))
        }
      }

      const flushSemantic = async (force = false) => {
        if (semanticFlushing) return
        semanticFlushing = true
        try {
          while (semanticQueue.length > 0) {
            const chunk = force
              ? (takeSemanticStreamChunk(semanticQueue, {
                  minChars: 1,
                  maxChars: semanticMaxChars,
                }) || semanticQueue)
              : takeSemanticStreamChunk(semanticQueue, {
                  minChars: semanticMinChars,
                  maxChars: semanticMaxChars,
                })
            if (!chunk) break
            semanticQueue = semanticQueue.slice(chunk.length)
            flushImmediate(chunk)
            if (semanticQueue.length > 0) {
              await new Promise(r => setTimeout(r, semanticDelayMs))
            }
          }
        } finally {
          semanticFlushing = false
        }
      }

      // Strip <thinking>...</thinking> from a chunk; returns visible text only.
      const stripThinking = (text: string): string => {
        let out = ''
        let temp = text
        while (temp.length > 0) {
          if (isInThinking) {
            const end = temp.indexOf('</thinking>')
            if (end !== -1) {
              isInThinking = false
              temp = temp.substring(end + '</thinking>'.length)
            } else {
              temp = ''
            }
          } else {
            const start = temp.indexOf('<thinking>')
            if (start !== -1) {
              out += temp.substring(0, start)
              isInThinking = true
              temp = temp.substring(start + '<thinking>'.length)
            } else {
              out += temp
              temp = ''
            }
          }
        }
        return out
      }

      const handleData = async (data: string) => {
        if (data === '[DONE]') return 'done'
        try {
          const parsed = JSON.parse(data)
          const choice = parsed.choices?.[0]
          if (choice?.finish_reason) lastFinishReason = String(choice.finish_reason)
          const content = choice?.delta?.content || ''
          if (!content) return 'continue'
          const visible = sanitizeReplacementChars(stripThinking(content))
          if (!visible) return 'continue'
          visibleChars += visible.length
          if (mode === 'semantic') {
            semanticQueue += visible
            await flushSemantic(false)
          } else if (drip) {
            charQueue += visible
            // Kick off the drip loop async; do not await to allow buffering
            dripChars()
          } else {
            flushImmediate(visible)
          }
        } catch {
          /* incomplete json, ignore */
        }
        return 'continue'
      }

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            // Process remaining buffer
            if (buffer.trim()) {
              const lines = buffer.split('\n')
              for (const line of lines) {
                if (!line.startsWith('data: ')) continue
                const result = await handleData(line.slice(6))
                if (result === 'done') break
              }
            }
            if (drip) await drainQueue()
            if (mode === 'semantic') await flushSemantic(true)
            logCompletion('reader_done')
            controller.close()
            break
          }

          const chunk = decoder.decode(value, { stream: true })
          buffer += chunk
          let nl: number
          while ((nl = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, nl)
            buffer = buffer.slice(nl + 1)
            if (!line.startsWith('data: ')) continue
            const result = await handleData(line.slice(6))
            if (result === 'done') {
              if (drip) await drainQueue()
              if (mode === 'semantic') await flushSemantic(true)
              logCompletion('done')
              controller.close()
              return
            }
          }
        }
      } catch (err) {
        const isAbort = !!(
          err &&
          typeof err === 'object' &&
          'name' in err &&
          String((err as any).name) === 'AbortError'
        )
        if (isAbort) {
          console.warn('[LLM] stream aborted')
        } else {
          console.error('[LLM] stream error', err)
        }
        controller.error(err)
      }
    },
  })
}

// ==================== Default generation params ====================

export const DEFAULT_TEMPERATURE = 0.8
export const DEFAULT_MAX_TOKENS = 4000
