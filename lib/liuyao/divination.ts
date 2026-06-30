import {
  COIN_RULE,
  type CoinFace,
  type DivinationSession,
  type LineCast,
  type LineIndex,
  type LineName,
  type LineTotal,
  type LineType,
  type PlotPayload,
} from '@/lib/liuyao/types'

export const LINE_NAMES: Record<LineIndex, LineName> = {
  1: '初爻',
  2: '二爻',
  3: '三爻',
  4: '四爻',
  5: '五爻',
  6: '上爻',
}

export const LINE_HINTS: Record<LineIndex, string> = {
  1: '请定住问题的起点。',
  2: '继续保持同一念头。',
  3: '不要更换问题。',
  4: '让问题自然落定。',
  5: '继续完成第五次起爻。',
  6: '最后一次，完成此卦。',
}

export const LINE_BUTTON_LABELS: Record<LineIndex, string> = {
  1: '长按起初爻',
  2: '长按起二爻',
  3: '长按起三爻',
  4: '长按起四爻',
  5: '长按起五爻',
  6: '长按起上爻',
}

export function makeLiuYaoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function totalToLineType(total: LineTotal): LineType {
  if (total === 6) return '老阴'
  if (total === 7) return '少阳'
  if (total === 8) return '少阴'
  return '老阳'
}

export function isMovingLine(total: LineTotal): boolean {
  return total === 6 || total === 9
}

export function castLiuYaoLine(lineIndex: LineIndex): LineCast {
  const random = new Uint8Array(3)
  crypto.getRandomValues(random)

  const coins: CoinFace[] = []
  const coinValues: number[] = []
  for (let index = 0; index < 3; index += 1) {
    const face: CoinFace = (random[index] & 1) === 1 ? 'yang' : 'yin'
    coins.push(face)
    coinValues.push(COIN_RULE[face])
  }

  const total = (coinValues[0] + coinValues[1] + coinValues[2]) as LineTotal
  return Object.freeze({
    lineIndex,
    lineName: LINE_NAMES[lineIndex],
    castTime: new Date().toISOString(),
    triggerEventId: makeLiuYaoId(),
    coins,
    coinValues,
    total,
    lineType: totalToLineType(total),
    moving: isMovingLine(total),
    locked: true,
  }) as LineCast
}

export function buildPlotPayload(session: DivinationSession): PlotPayload {
  const ordered = [...session.lines].sort((left, right) => left.lineIndex - right.lineIndex)
  return {
    sessionId: session.sessionId,
    question: session.question,
    linesBottomToTop: ordered.map(line => line.total),
    movingLines: ordered.filter(line => line.moving).map(line => line.lineIndex),
    rawLineRecords: ordered,
  }
}

export function coinLabel(face: CoinFace): string {
  return face === 'yang' ? '阳' : '阴'
}

export function formatOffsetTime(iso: string, offsetMinutes: number): string {
  const shifted = new Date(new Date(iso).getTime() + offsetMinutes * 60_000)
  const pad = (value: number) => value.toString().padStart(2, '0')
  return [
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`,
  ].join(' ')
}
