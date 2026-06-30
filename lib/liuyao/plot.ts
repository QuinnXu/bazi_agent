import {
  EarthlyBranch,
  castDivination,
  toDivinationView,
  type DateTimeOffsetInput,
  type SixLineDivination,
} from 'liuyao-typescript'
import { buildPlotPayload, formatOffsetTime } from '@/lib/liuyao/divination'
import type { DivinationSession, LiuYaoCalendarInfo, LiuYaoPlotResult } from '@/lib/liuyao/types'

export function buildLiuYaoPlotResult(
  session: DivinationSession,
  offsetMinutes: number,
): LiuYaoPlotResult {
  if (session.lines.length !== 6) {
    throw new Error('必须完成六次起爻后才能排盘。')
  }

  const payload = buildPlotPayload(session)
  const lastLine = [...session.lines].sort((left, right) => left.lineIndex - right.lineIndex).at(-1)
  if (!lastLine) throw new Error('缺少上爻落定时间。')

  const castingTime = dateToOffsetInput(new Date(lastLine.castTime), offsetMinutes)
  const divination = castDivination({
    mode: 'symbols',
    castingTime,
    values: payload.linesBottomToTop,
  })

  return {
    payload,
    time: {
      choice: 'last_line',
      label: '用上爻落定时间',
      iso: lastLine.castTime,
      offsetMinutes,
      display: formatOffsetTime(lastLine.castTime, offsetMinutes),
    },
    view: toDivinationView(divination, 'zh-Hans'),
    calendar: buildCalendarInfo(divination),
  }
}

function buildCalendarInfo(divination: SixLineDivination): LiuYaoCalendarInfo {
  const culture = 'zh-Hans'
  const { stemBranch } = divination.castingTime
  const monthBranch = stemBranch.month.branch
  const dayBranch = stemBranch.day.branch
  const monthBreak = EarthlyBranch.getAll()
    .find(branch => monthBranch.isClashing(branch))
    ?.toString(culture) || '_'
  const dayEmptiness = stemBranch.day.emptyBranchesMemory
    .map(branch => branch.toString(culture))
    .join('、') || '_'

  return {
    stemBranchFull: stemBranch.toString(culture),
    yearPillar: stemBranch.year.toString(culture),
    monthPillar: stemBranch.month.toString(culture),
    dayPillar: stemBranch.day.toString(culture),
    hourPillar: stemBranch.hour.toString(culture),
    dayEmptiness,
    monthBranch: monthBranch.toString(culture),
    dayBranch: dayBranch.toString(culture),
    monthBreak,
  }
}

function dateToOffsetInput(date: Date, offsetMinutes: number): DateTimeOffsetInput {
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    millisecond: shifted.getUTCMilliseconds(),
    offsetMinutes,
  }
}
