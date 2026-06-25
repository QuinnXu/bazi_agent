export interface TokenEstimateMessage {
  role?: string
  content?: unknown
}

const CJK_PATTERN =
  /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g
const LATIN_PATTERN = /[A-Za-z0-9_]+(?:[-'][A-Za-z0-9_]+)*/g

function estimatePlainTextTokens(text: string): number {
  if (!text) return 0

  const cjkCount = text.match(CJK_PATTERN)?.length ?? 0
  const withoutCjk = text.replace(CJK_PATTERN, ' ')
  const latinTokens =
    withoutCjk.match(LATIN_PATTERN)?.reduce((sum, word) => {
      return sum + Math.max(1, Math.ceil(word.length / 4))
    }, 0) ?? 0
  const punctuationTokens = Math.ceil(
    withoutCjk.replace(LATIN_PATTERN, '').replace(/\s+/g, '').length / 3,
  )

  return Math.max(1, cjkCount + latinTokens + punctuationTokens)
}

export function estimateTokensForContent(content: unknown): number {
  if (typeof content === 'string') return estimatePlainTextTokens(content)
  if (content === null || content === undefined) return 0

  if (Array.isArray(content)) {
    return content.reduce((sum, part) => {
      if (typeof part === 'string') return sum + estimatePlainTextTokens(part)
      if (part && typeof part === 'object') {
        const typed = part as {
          type?: string
          text?: unknown
          image_url?: unknown
        }
        if (typed.type === 'text') {
          return sum + estimateTokensForContent(typed.text)
        }
        if (typed.type === 'image_url') {
          // Gemini / OpenAI-compatible vision models charge image inputs as
          // internal image tokens. Keep this conservative and stable.
          return sum + 1120
        }
      }
      return sum + estimatePlainTextTokens(JSON.stringify(part))
    }, 0)
  }

  return estimatePlainTextTokens(JSON.stringify(content))
}

export function estimateTokensForText(text: string | null | undefined): number {
  return estimatePlainTextTokens(text || '')
}

export function estimateTokensForMessages(
  messages: TokenEstimateMessage[],
): number {
  const contentTokens = messages.reduce((sum, message) => {
    return (
      sum +
      estimatePlainTextTokens(message.role || '') +
      estimateTokensForContent(message.content)
    )
  }, 0)

  // OpenAI-compatible chat formats have per-message framing tokens. The exact
  // tokenizer differs per provider, so this is an operational estimate.
  return Math.max(1, contentTokens + messages.length * 4 + 2)
}
