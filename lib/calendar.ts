/**
 * Calendar / GanZhi helpers for the 近期运势 feature.
 *
 * Wraps the existing `tool/paipan.js` GetGZ() to compute year/month/day GanZhi
 * for arbitrary solar dates, and produces ranges for prompt injection.
 *
 * The paipan module is CommonJS, so we require() it lazily.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { paipan: PaipanClass } = require('@/tool/paipan')

export interface GanZhiPoint {
  date: string // YYYY-MM-DD (solar)
  yearGZ: string // 年干支
  monthGZ: string // 月干支
  dayGZ: string // 日干支
  label: string // human-friendly label, e.g. "2026年5月4日 甲辰年戊辰月癸丑日"
}

export interface GanZhiMonthPoint {
  yearMonth: string // YYYY-MM
  yearGZ: string
  monthGZ: string
  label: string // e.g. "2026年5月 甲辰年戊辰月"
}

export type Granularity = 'day' | 'month'

// ==================== Internal: paipan instance ====================

let _paipan: any = null
function getPaipan() {
  if (!_paipan) {
    _paipan = new PaipanClass()
  }
  return _paipan
}

// ==================== Date helpers ====================

function pad2(n: number) {
  return n.toString().padStart(2, '0')
}

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function fmtMonth(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

function startOfDay(d: Date) {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function addMonths(d: Date, n: number) {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}

/**
 * Difference in **calendar days** (not 24h units), inclusive count requires +1 from caller.
 */
export function diffDays(start: Date, end: Date) {
  const a = startOfDay(start).getTime()
  const b = startOfDay(end).getTime()
  return Math.round((b - a) / 86400000)
}

/**
 * Returns true if [start, end] spans more than `maxDays` calendar days.
 */
export function isRangeTooLong(
  start: Date,
  end: Date,
  maxDays = 92,
): boolean {
  return diffDays(start, end) + 1 > maxDays
}

// ==================== Single-date GanZhi ====================

/**
 * Get the year/month/day GanZhi for a solar date (using local noon for stability).
 * Returns null if paipan rejects the date.
 */
export function getGanZhiForDate(d: Date): GanZhiPoint | null {
  const p = getPaipan()
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const day = d.getDate()

  try {
    const result = p.GetGZ(year, month, day, 12, 0, 0)
    if (!result) return null

    const [tg, dz] = result
    const yearGZ = p.ctg[tg[0]] + p.cdz[dz[0]]
    const monthGZ = p.ctg[tg[1]] + p.cdz[dz[1]]
    const dayGZ = p.ctg[tg[2]] + p.cdz[dz[2]]
    const label = `${year}年${month}月${day}日 ${yearGZ}年${monthGZ}月${dayGZ}日`

    return {
      date: fmtDate(d),
      yearGZ,
      monthGZ,
      dayGZ,
      label,
    }
  } catch (e) {
    console.error('[calendar] GetGZ failed for', fmtDate(d), e)
    return null
  }
}

// ==================== Ranges ====================

/**
 * Daily granularity: produce one GanZhi point for every day in [start, end] inclusive.
 * Caps the output at `maxPoints` to keep prompts manageable.
 */
export function getDailyGanZhiRange(
  start: Date,
  end: Date,
  maxPoints = 100,
): GanZhiPoint[] {
  const points: GanZhiPoint[] = []
  const startD = startOfDay(start)
  const endD = startOfDay(end)
  if (endD < startD) return points

  let cur = startD
  while (cur <= endD && points.length < maxPoints) {
    const pt = getGanZhiForDate(cur)
    if (pt) points.push(pt)
    cur = addDays(cur, 1)
  }
  return points
}

/**
 * Monthly granularity: one GanZhi point per calendar month in [start, end].
 * Uses the 15th of each month as the sample date (avoids the 立春/节气 boundary
 * effect on the year/month pillar swapping at the very start of a month).
 */
export function getMonthlyGanZhiRange(
  start: Date,
  end: Date,
  maxPoints = 12,
): GanZhiMonthPoint[] {
  const points: GanZhiMonthPoint[] = []
  let cur = new Date(start.getFullYear(), start.getMonth(), 15)
  const endMark = new Date(end.getFullYear(), end.getMonth(), 15)
  if (endMark < cur) return points

  while (cur <= endMark && points.length < maxPoints) {
    const sampled = getGanZhiForDate(cur)
    if (sampled) {
      points.push({
        yearMonth: fmtMonth(cur),
        yearGZ: sampled.yearGZ,
        monthGZ: sampled.monthGZ,
        label: `${cur.getFullYear()}年${cur.getMonth() + 1}月 ${sampled.yearGZ}年${sampled.monthGZ}月`,
      })
    }
    cur = addMonths(cur, 1)
  }
  return points
}

/**
 * Build a prompt-ready text block from a date range.
 * Automatically picks daily or monthly granularity and degrades gracefully
 * when the daily list would be too long.
 */
export function buildGanZhiTable(
  start: Date,
  end: Date,
  granularity: Granularity,
): string {
  if (granularity === 'month') {
    const pts = getMonthlyGanZhiRange(start, end, 12)
    if (pts.length === 0) return '【时间表】无法解析，请检查日期范围。'
    const lines = pts.map(p => `- ${p.label}`)
    return `【时间表（粒度=月）】\n${lines.join('\n')}`
  }

  const pts = getDailyGanZhiRange(start, end, 100)
  if (pts.length === 0) return '【时间表】无法解析，请检查日期范围。'
  const lines = pts.map(p => `- ${p.label}`)
  return `【时间表（粒度=日）】\n${lines.join('\n')}`
}
