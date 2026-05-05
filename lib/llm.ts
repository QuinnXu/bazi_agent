/**
 * Unified LLM router for the BuBuXiang chatbot.
 *
 * Routing rules (production):
 *   - Free chat (no apple)              → glm-5 via DashScope
 *   - First apple-consuming call of day → google/gemini-3.1-pro-preview via OpenRouter
 *   - Subsequent apple, avatar (multimodal) → google/gemini-3.1-flash-lite-preview via OpenRouter
 *   - Subsequent apple, text             → deepseek-v4-pro via DeepSeek
 *
 * Routing rules (local dev, NODE_ENV=development OR LLM_DEV_PROXY=1):
 *   - Free chat                          → glm-5 via DashScope (same as prod)
 *   - Any apple-consuming call           → gemini-3.1-pro-preview via local proxy
 *
 * The "first of day" detection is done by peeking the user's quota usage BEFORE consumption.
 */

// ==================== Types ====================

export type LlmTaskKind =
  | 'free'         // free chat (no apple)
  | 'apple_first'  // first apple-consuming call of the day
  | 'apple_avatar' // subsequent apple call, avatar (needs multimodal)
  | 'apple_other'  // subsequent apple call, text-only

export interface LlmRouteContext {
  consumesApple: boolean
  // pre-consumption usedToday count (used to detect first-of-day)
  preUsedToday: number
  isAvatar: boolean
}

export interface LlmConfig {
  endpoint: string  // full URL, ends with /chat/completions
  apiKey: string
  model: string
  isOpenRouter: boolean
  isReasoning: boolean // adds reasoning.effort if supported
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

// ==================== Helpers ====================

function isLocalDev(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.LLM_DEV_PROXY === '1'
  )
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '')
  const p = path.replace(/^\/+/, '')
  return `${b}/${p}`
}

// ==================== Task selection ====================

export function pickLlmTask(ctx: LlmRouteContext): LlmTaskKind {
  if (!ctx.consumesApple) return 'free'
  if (ctx.preUsedToday === 0) return 'apple_first'
  if (ctx.isAvatar) return 'apple_avatar'
  return 'apple_other'
}

// ==================== Config ====================

export function selectLlmConfig(task: LlmTaskKind): LlmConfig {
  // Free task: glm-5 via DashScope (same in dev and prod)
  if (task === 'free') {
    const base =
      process.env.DASHSCOPE_BASE_URL ||
      'https://coding.dashscope.aliyuncs.com/v1'
    return {
      endpoint: joinUrl(base, 'chat/completions'),
      apiKey: process.env.DASHSCOPE_API_KEY || '',
      model: 'glm-5',
      isOpenRouter: false,
      isReasoning: false,
      multimodal: false,
      providerHint: null,
      temperature: 0.8,
      maxTokens: 4000,
      label: 'glm-5 @ DashScope',
    }
  }

  // Apple-consuming tasks: in dev, all go through local proxy
  if (isLocalDev()) {
    const base =
      process.env.LOCAL_LLM_BASE_URL || 'http://127.0.0.1:12345/v1'
    return {
      endpoint: joinUrl(base, 'chat/completions'),
      apiKey: process.env.LOCAL_LLM_API_KEY || 'local-dev',
      model: 'gemini-3.1-pro-preview',
      isOpenRouter: false,
      isReasoning: true,
      multimodal: true,
      providerHint: null,
      temperature: 1,
      maxTokens: 16000,
      label: 'gemini-3.1-pro-preview @ local-proxy (dev)',
    }
  }

  // Production apple-consuming tasks
  if (task === 'apple_first') {
    return {
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: process.env.OPENROUTER_API_KEY || '',
      model: 'google/gemini-3.1-pro-preview',
      isOpenRouter: true,
      isReasoning: true,
      multimodal: true,
      providerHint: { order: ['Google'] },
      temperature: 1,
      maxTokens: 16000,
      label: 'gemini-3.1-pro-preview @ OpenRouter',
    }
  }

  if (task === 'apple_avatar') {
    return {
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: process.env.OPENROUTER_API_KEY || '',
      model: 'google/gemini-3.1-flash-lite-preview',
      isOpenRouter: true,
      isReasoning: true,
      multimodal: true,
      providerHint: { order: ['Google'] },
      temperature: 1,
      maxTokens: 12000,
      label: 'gemini-3.1-flash-lite-preview @ OpenRouter',
    }
  }

  // apple_other → deepseek-v4-pro
  const base =
    process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'
  return {
    endpoint: joinUrl(base, 'chat/completions'),
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    model: 'deepseek-v4-pro',
    isOpenRouter: false,
    isReasoning: false,
    multimodal: false,
    providerHint: null,
    temperature: 0.7,
    maxTokens: 8000,
    label: 'deepseek-v4-pro @ DeepSeek',
  }
}

// ==================== Caller ====================

/**
 * Issue a streaming chat completion request to the configured upstream.
 * Returns the raw fetch Response (caller wraps the body with a stream processor).
 */
export async function callLLM(
  messagesWithSystem: any[],
  task: LlmTaskKind,
): Promise<{ response: Response; config: LlmConfig }> {
  const config = selectLlmConfig(task)

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
  if (config.isReasoning && config.isOpenRouter) {
    // OpenRouter-specific reasoning hint; safe to omit on local proxy
    body.reasoning = { effort: 'high' }
  }

  console.log(`[LLM] Calling ${config.label} (task=${task})`)
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[LLM] ${config.label} error:`, errorText.slice(0, 500))
    throw new Error(
      `LLM upstream error: ${response.status} (model=${config.model})`,
    )
  }

  return { response, config }
}

// ==================== Stream processor ====================

interface StreamOptions {
  /**
   * Drip output character-by-character for smooth UI. Default true.
   * Reasoning models like Gemini benefit from this; deepseek-v4-pro is also fine with drip.
   */
  drip?: boolean
  /**
   * Drip delay in ms. Default 12 (~80 ch/s for Chinese).
   */
  dripDelayMs?: number
}

/**
 * OpenAI-compatible SSE → text stream processor with optional <thinking>...</thinking>
 * stripping (no-op if absent) and optional character-level drip.
 *
 * Works with: glm-5, deepseek-v4-pro, OpenRouter Gemini, local proxy Gemini.
 */
export function createUnifiedStreamProcessor(
  response: Response,
  opts: StreamOptions = {},
): ReadableStream {
  const drip = opts.drip ?? true
  const dripDelayMs = opts.dripDelayMs ?? 12

  return new ReadableStream({
    async start(controller) {
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      const encoder = new TextEncoder()
      let buffer = ''
      let isInThinking = false
      let charQueue = ''
      let dripping = false

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

      const dripChars = async () => {
        if (dripping) return
        dripping = true
        while (charQueue.length > 0) {
          const cs = Math.min(
            charQueue.length,
            charQueue.charCodeAt(0) > 127 ? 1 : 3,
          )
          const chars = charQueue.slice(0, cs)
          charQueue = charQueue.slice(cs)
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
          const cs = Math.min(
            charQueue.length,
            charQueue.charCodeAt(0) > 127 ? 1 : 3,
          )
          const chars = charQueue.slice(0, cs)
          charQueue = charQueue.slice(cs)
          try {
            controller.enqueue(encoder.encode(chars))
          } catch {
            break
          }
          await new Promise(r => setTimeout(r, dripDelayMs))
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
          const content = parsed.choices?.[0]?.delta?.content || ''
          if (!content) return 'continue'
          const visible = stripThinking(content)
          if (!visible) return 'continue'
          if (drip) {
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
              controller.close()
              return
            }
          }
        }
      } catch (err) {
        console.error('[LLM] stream error', err)
        controller.error(err)
      }
    },
  })
}

// ==================== Default generation params ====================

export const DEFAULT_TEMPERATURE = 0.8
export const DEFAULT_MAX_TOKENS = 4000
