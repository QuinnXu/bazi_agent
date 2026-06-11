export function sanitizeReplacementChars(text: string): string {
  if (!text) return text
  return text.replace(/\uFFFD+/g, '')
}

export function takeUnicodeStreamChunk(text: string, asciiChunkSize = 3): string {
  const first = text.codePointAt(0)
  if (first === undefined) return ''

  const firstCodeUnits = first > 0xffff ? 2 : 1
  if (first > 127) {
    return text.slice(0, firstCodeUnits)
  }

  let end = 0
  let count = 0
  while (end < text.length && count < asciiChunkSize) {
    const codePoint = text.codePointAt(end)
    if (codePoint === undefined || codePoint > 127) break
    end += codePoint > 0xffff ? 2 : 1
    count += 1
  }

  return text.slice(0, end || firstCodeUnits)
}

export interface SemanticStreamChunkOptions {
  minChars?: number
  maxChars?: number
}

function safeBoundary(text: string, index: number): number {
  if (index <= 0) return 0
  if (index >= text.length) return text.length
  const previous = text.charCodeAt(index - 1)
  const current = text.charCodeAt(index)
  if (previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff) {
    return index - 1
  }
  return index
}

function isSentenceBoundary(char: string): boolean {
  return char === '。' ||
    char === '！' ||
    char === '？' ||
    char === '!' ||
    char === '?' ||
    char === '；' ||
    char === ';'
}

function isSoftBoundary(char: string): boolean {
  return /\s|,|，|、|:|：/.test(char)
}

export function takeSemanticStreamChunk(
  text: string,
  options: SemanticStreamChunkOptions = {},
): string {
  if (!text) return ''

  const minChars = Math.max(8, options.minChars ?? 8)
  const maxChars = Math.max(minChars + 24, options.maxChars ?? 90)
  const scanLimit = Math.min(text.length, maxChars)

  const doubleBreak = text.indexOf('\n\n')
  if (doubleBreak !== -1 && doubleBreak + 2 >= 8 && doubleBreak + 2 <= maxChars) {
    return text.slice(0, safeBoundary(text, doubleBreak + 2))
  }

  for (let index = 0; index < scanLimit; index += 1) {
    const char = text[index]
    if (!isSentenceBoundary(char)) continue

    let end = index + 1
    while (end < text.length && /["'”’）)]/.test(text[end])) end += 1
    while (end < text.length && /\s/.test(text[end]) && text[end] !== '\n') end += 1

    if (end >= minChars || (end >= 10 && end === text.length)) {
      return text.slice(0, safeBoundary(text, end))
    }
  }

  const newline = text.indexOf('\n')
  if (newline !== -1 && newline + 1 >= minChars && newline + 1 <= maxChars) {
    return text.slice(0, safeBoundary(text, newline + 1))
  }

  if (text.length < maxChars) return ''

  for (let index = maxChars; index >= minChars; index -= 1) {
    if (isSoftBoundary(text[index - 1])) {
      return text.slice(0, safeBoundary(text, index))
    }
  }

  return text.slice(0, safeBoundary(text, maxChars))
}
