import type {
  AgentAnalysisSlots,
  AgentAskedTime,
  AgentMatter,
  AgentMatterCategory,
  AgentMessage,
  AgentOutputDepth,
  AgentTimeRangeContext,
  AgentWorkflowCorrection,
} from '@/lib/agent-workflow-types'
import { BUBU_PROMPTS } from '@/lib/bubu-content'

const SELF_NAMES = new Set(['我', '本人', '自己', '当前命主', '用户', '命主'])

const WEALTH_INTENT_RE = /财运|财富|财库|偏财|正财|钱|收入|投资|副业|生意|赚钱|挣钱|搞钱|暴富|发财|发达|进账|现金流|资产|资源|财富跃迁|收入跃迁/
const LIFETIME_CUE_RE = /此生|这一生|这辈子|一辈子|一生|终身|人生|几岁|哪步大运|什么大运|什么时候|何时|哪年|哪几年/
const PARTNER_ARCHETYPE_RE = /和谁|跟谁|与谁|谁一起|哪类人|什么样的人|什么人|哪种人|合伙人|搭子|伙伴|贵人|合作对象|搭档/

function uniqueFocus(focus: string[]): string[] {
  return Array.from(new Set(focus.filter(Boolean)))
}

export function isWealthIntent(text: string): boolean {
  return WEALTH_INTENT_RE.test(text)
}

export function isLifetimeWealthQuestion(text: string): boolean {
  const compact = text.replace(/\s+/g, '')
  if (!isWealthIntent(compact)) return false
  if (LIFETIME_CUE_RE.test(compact)) return true
  return /(?:暴富|发财|财富跃迁|收入跃迁).{0,8}(?:窗口|节点|阶段|机会)|(?:什么时候|何时|哪年|哪几年).{0,10}(?:暴富|发财|财运|财富|赚钱|搞钱)/.test(compact)
}

export function isSpecificCounterpartyQuestion(text: string): boolean {
  if (/@[^\s@#]+/.test(text)) return true
  return extractMentionedNames(text).length > 0
}

export function isPartnerArchetypeQuestion(text: string): boolean {
  const compact = text.replace(/\s+/g, '')
  if (!isWealthIntent(compact)) return false
  if (!PARTNER_ARCHETYPE_RE.test(compact)) return false
  if (/和谁|跟谁|与谁|谁一起|哪类人|什么样的人|什么人|哪种人|合伙人|搭子|伙伴|贵人|合作对象|搭档/.test(compact)) {
    return true
  }
  return !isSpecificCounterpartyQuestion(text)
}

export function hasClearFocusIntent(text: string): boolean {
  return inferFocus(text).length > 0 || isLifetimeWealthQuestion(text) || isPartnerArchetypeQuestion(text)
}

export type AgentPersonCorrection = Extract<AgentWorkflowCorrection, { scope: 'person' }>

export function latestUserText(messages: AgentMessage[]): string {
  return [...messages].reverse().find(message => message.role === 'user')?.content || ''
}

export function recentUserText(messages: AgentMessage[], count = 4): string {
  return messages
    .filter(message => message.role === 'user')
    .slice(-count)
    .map(message => message.content)
    .join('\n')
}

export function recentConversationText(messages: AgentMessage[], count = 10): string {
  return messages
    .slice(-count)
    .map(message => `${message.role}: ${message.content}`)
    .join('\n')
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function todayInShanghai(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value || 1)
  return new Date(get('year'), get('month') - 1, get('day'), 12, 0, 0)
}

function endOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0, 12, 0, 0)
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

function buildRelativeTime(
  today: Date,
  label: string,
  months: number,
  confidence: AgentAskedTime['confidence'] = 'medium',
): AgentAskedTime {
  return {
    start: formatDate(today),
    end: formatDate(addDays(addMonths(today, months), -1)),
    label,
    granularity: months > 2 ? 'month' : 'day',
    confidence,
    source: 'relative_default',
  }
}

function buildRestOfYearTime(today: Date, confidence: AgentAskedTime['confidence'] = 'medium'): AgentAskedTime {
  return {
    start: formatDate(today),
    end: formatDate(new Date(today.getFullYear(), 11, 31, 12, 0, 0)),
    label: '今年剩余时间',
    granularity: 'month',
    confidence,
    source: 'relative_default',
  }
}

function monthSpan(start: string, end: string): number {
  const s = new Date(start)
  const e = new Date(end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1
}

function granularityFor(start: string, end: string): 'day' | 'month' {
  return monthSpan(start, end) > 2 ? 'month' : 'day'
}

function chineseNumberToInt(text: string): number | null {
  const compact = text.trim()
  if (/^\d+$/.test(compact)) return Number(compact)
  const digits: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  }
  if (compact === '十') return 10
  const tenIndex = compact.indexOf('十')
  if (tenIndex >= 0) {
    const left = compact.slice(0, tenIndex)
    const right = compact.slice(tenIndex + 1)
    const tens = left ? digits[left] ?? 0 : 1
    const ones = right ? digits[right] ?? 0 : 0
    return tens * 10 + ones
  }
  return digits[compact] ?? null
}

function coerceDate(year: string, month?: string, day?: string, boundary: 'start' | 'end' = 'start'): string {
  const y = Number(year)
  const m = Number(month || (boundary === 'start' ? 1 : 12))
  const d = day
    ? Number(day)
    : boundary === 'start'
      ? 1
      : endOfMonth(y, m).getDate()
  return formatDate(new Date(y, m - 1, d, 12, 0, 0))
}

function buildDayTime(label: string, date: Date, source: AgentAskedTime['source'] = 'relative_default'): AgentAskedTime {
  const dateText = formatDate(date)
  return {
    start: dateText,
    end: dateText,
    label,
    granularity: 'day',
    confidence: 'high',
    source,
  }
}

function parseWeekdayTime(text: string, today: Date): AgentAskedTime | null {
  const weekendMatch = text.match(/(?:本周|这周|这个)?周末|(?:本|这)个周末/)
  if (weekendMatch) {
    const day = today.getDay()
    const startOffset = day === 0 ? 0 : day === 6 ? 0 : 6 - day
    const endOffset = day === 0 ? 0 : day === 6 ? 1 : 7 - day
    const start = formatDate(addDays(today, startOffset))
    const end = formatDate(addDays(today, endOffset))
    return {
      start,
      end,
      label: '本周末',
      granularity: 'day',
      confidence: 'high',
      source: 'relative_default',
    }
  }

  const match = text.match(/(下周|下星期|本周|这周|这星期|周|星期)([一二三四五六日天])/)
  if (!match) return null
  const weekdayMap: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    日: 7,
    天: 7,
  }
  const target = weekdayMap[match[2]]
  if (!target) return null
  const current = today.getDay() === 0 ? 7 : today.getDay()
  const baseOffset = target - current
  const offset = /^下/.test(match[1]) ? baseOffset + 7 : baseOffset
  const label = `${match[1].startsWith('下') ? '下周' : '本周'}${match[2]}`
  return buildDayTime(label, addDays(today, offset))
}

function parseExplicitDay(text: string): AgentAskedTime | null {
  const today = todayInShanghai()

  const isoDay = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/)
  if (isoDay) {
    return buildDayTime(
      `${isoDay[1]}年${Number(isoDay[2])}月${Number(isoDay[3])}日`,
      new Date(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3]), 12, 0, 0),
      'explicit',
    )
  }

  const monthDay = text.match(/(?:^|[^\d])(\d{1,2})月(\d{1,2})日/)
  if (monthDay) {
    const month = Number(monthDay[1])
    const day = Number(monthDay[2])
    return buildDayTime(
      `${month}月${day}日`,
      new Date(today.getFullYear(), month - 1, day, 12, 0, 0),
      'explicit',
    )
  }

  if (/今天|今日|今早|今晚|今天上午|今天下午|今天晚上|今儿/.test(text)) {
    return buildDayTime(/今晚|今天晚上/.test(text) ? '今晚' : '今天', today)
  }
  if (/明天|明日|明早|明晚|明天上午|明天下午|明天晚上/.test(text)) {
    return buildDayTime(/明晚|明天晚上/.test(text) ? '明晚' : '明天', addDays(today, 1))
  }
  if (/后天|后日/.test(text)) {
    return buildDayTime('后天', addDays(today, 2))
  }

  return parseWeekdayTime(text, today)
}

function parseExplicitRange(text: string): AgentAskedTime | null {
  const isoRange = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?\s*(?:到|至|~|～|-|—)\s*(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/)
  if (isoRange) {
    const start = coerceDate(isoRange[1], isoRange[2], isoRange[3], 'start')
    const end = coerceDate(isoRange[4], isoRange[5], isoRange[6], 'end')
    return {
      start,
      end,
      label: `${start} ~ ${end}`,
      granularity: granularityFor(start, end),
      confidence: 'high',
      source: 'explicit',
    }
  }

  const explicitDay = parseExplicitDay(text)
  if (explicitDay) return explicitDay

  const yearRange = text.match(/(20\d{2})\s*(?:到|至|~|～|-|—)\s*(20\d{2})\s*年?/)
  if (yearRange) {
    const start = coerceDate(yearRange[1], undefined, undefined, 'start')
    const end = coerceDate(yearRange[2], undefined, undefined, 'end')
    return {
      start,
      end,
      label: `${yearRange[1]}-${yearRange[2]} 年`,
      granularity: 'month',
      confidence: 'high',
      source: 'explicit',
    }
  }

  const monthOnly = text.match(/(20\d{2})[-/.年](\d{1,2})月?/)
  if (monthOnly) {
    const start = coerceDate(monthOnly[1], monthOnly[2], undefined, 'start')
    const end = coerceDate(monthOnly[1], monthOnly[2], undefined, 'end')
    return {
      start,
      end,
      label: `${monthOnly[1]}年${Number(monthOnly[2])}月`,
      granularity: 'day',
      confidence: 'high',
      source: 'explicit',
    }
  }

  const yearOnly = text.match(/(20\d{2})\s*年/)
  if (yearOnly) {
    const start = coerceDate(yearOnly[1], undefined, undefined, 'start')
    const end = coerceDate(yearOnly[1], undefined, undefined, 'end')
    return {
      start,
      end,
      label: `${yearOnly[1]} 年`,
      granularity: 'month',
      confidence: 'high',
      source: 'explicit',
    }
  }

  return null
}

function contextualDefaultTime(
  text: string,
  category: AgentMatterCategory | null | undefined,
): AgentAskedTime | null {
  const today = todayInShanghai()
  const currentYear = today.getFullYear()

  if (category === 'relationship' && /未来|以后|后面|往后|接下来/.test(text)) {
    return buildRelativeTime(today, '接下来一个关系阶段', 3)
  }

  if (category === 'event') {
    if (/最近|近期|短期|这几天|这周|马上|很快|决定|决策|要不要|能不能|适不适合/.test(text)) {
      return buildRelativeTime(today, '近期决策窗口', 1)
    }
    if (/未来|以后|后续|后面|往后|接下来/.test(text)) {
      return buildRelativeTime(today, '后续发展阶段', 3)
    }
  }

  if (category === 'lifepath' && /未来|以后|长期|往后|接下来|后面/.test(text)) {
    return {
      start: formatDate(today),
      end: formatDate(new Date(currentYear + 2, 11, 31, 12, 0, 0)),
      label: '接下来几年',
      granularity: 'month',
      confidence: 'medium',
      source: 'relative_default',
    }
  }

  if ((category === 'fortune' || category === 'general') && /未来|以后|后面|往后|接下来/.test(text)) {
    return buildRelativeTime(today, '接下来一个阶段', 3)
  }

  return null
}

function parseRelativeRange(
  text: string,
  category?: AgentMatterCategory | null,
): AgentAskedTime | null {
  const today = todayInShanghai()
  const currentYear = today.getFullYear()

  const yearCountMatch = text.match(/未来\s*([一二两三四五六七八九十\d]+)\s*年|接下来\s*([一二两三四五六七八九十\d]+)\s*年|近\s*([一二两三四五六七八九十\d]+)\s*年/)
  if (yearCountMatch) {
    const years = chineseNumberToInt(yearCountMatch[1] || yearCountMatch[2] || yearCountMatch[3] || '') || 3
    const start = formatDate(today)
    const end = formatDate(new Date(currentYear + years - 1, 11, 31, 12, 0, 0))
    return {
      start,
      end,
      label: `未来 ${years} 年`,
      granularity: 'month',
      confidence: years === 3 ? 'medium' : 'high',
      source: 'relative_default',
    }
  }

  if (/未来几年|这几年|近几年|后面几年/.test(text)) {
    const start = formatDate(today)
    const end = formatDate(new Date(currentYear + 2, 11, 31, 12, 0, 0))
    return {
      start,
      end,
      label: '未来 3 年',
      granularity: 'month',
      confidence: 'medium',
      source: 'relative_default',
    }
  }

  const monthCountMatch = text.match(/未来\s*([一二两三四五六七八九十\d]+)\s*个?月|接下来\s*([一二两三四五六七八九十\d]+)\s*个?月|近\s*([一二两三四五六七八九十\d]+)\s*个?月|([一二两三四五六七八九十\d]+)\s*个?月内/)
  if (monthCountMatch) {
    const months = chineseNumberToInt(monthCountMatch[1] || monthCountMatch[2] || monthCountMatch[3] || monthCountMatch[4] || '') || 3
    const start = formatDate(today)
    const end = formatDate(addDays(addMonths(today, months), -1))
    return {
      start,
      end,
      label: `未来 ${months} 个月`,
      granularity: months > 2 ? 'month' : 'day',
      confidence: months === 3 ? 'medium' : 'high',
      source: 'relative_default',
    }
  }

  if (/半年|半年度/.test(text)) {
    return buildRelativeTime(today, '未来 6 个月', 6)
  }

  if (/未来几个月|接下来几个月|后面几个月/.test(text)) {
    const start = formatDate(today)
    const end = formatDate(addDays(addMonths(today, 3), -1))
    return {
      start,
      end,
      label: '未来 3 个月',
      granularity: 'month',
      confidence: 'medium',
      source: 'relative_default',
    }
  }

  if (/年底|年末|今年底/.test(text)) {
    return buildRestOfYearTime(today)
  }

  const contextual = contextualDefaultTime(text, category)
  if (contextual) return contextual

  if (/最近|近期|这段时间/.test(text)) {
    const start = formatDate(today)
    const end = formatDate(addDays(today, 29))
    return {
      start,
      end,
      label: '近期状态',
      granularity: 'day',
      confidence: 'medium',
      source: 'relative_default',
    }
  }

  if (/今年|本年/.test(text)) {
    const start = formatDate(new Date(currentYear, 0, 1, 12, 0, 0))
    const end = formatDate(new Date(currentYear, 11, 31, 12, 0, 0))
    return {
      start,
      end,
      label: '今年全年',
      granularity: 'month',
      confidence: 'medium',
      source: 'relative_default',
    }
  }

  return null
}

export function parseAskedTime(
  text: string,
  selectedTimeRanges?: AgentTimeRangeContext[],
  category?: AgentMatterCategory | null,
): AgentAskedTime | null {
  if (isLifetimeWealthQuestion(text) || isPartnerArchetypeQuestion(text)) return null

  const explicit = parseExplicitRange(text)
  if (explicit) return explicit

  const selected = selectedTimeRanges?.find(range => range.start && range.end)
  if (selected) {
    return {
      start: selected.start,
      end: selected.end,
      label: selected.label || '自定义时间段',
      granularity: granularityFor(selected.start, selected.end),
      confidence: 'high',
      source: 'selected',
    }
  }

  return parseRelativeRange(text, category)
}

export function hasExplicitDayReference(text: string): boolean {
  return !!parseExplicitDay(text)
}

export function isDetailedAnalysisRequest(text: string): boolean {
  return /报告|分析|详细|深度|推演|完整|展开|研究|长一点|细一点|全面/.test(text)
}

export function isDateChoiceQuestion(text: string): boolean {
  const compact = text.replace(/\s+/g, '')
  const decisionCue = /适合|合适|要不要|能不能|可不可以|行不行|好不好|宜不宜|择日|哪天|哪一天|什么时候|何时/.test(compact)
  const eventCue = /出门|出行|远行|旅行|动身|搬家|签约|签合同|开业|开张|面试|见客户|谈判|表白|约会|考试|提交|发布|上线|买房|卖房|投资|动工|开工|手术|复诊/.test(compact)
  return decisionCue && eventCue
}

export function isLightweightDailyDecisionQuestion(text: string): boolean {
  return isDateChoiceQuestion(text) && hasExplicitDayReference(text) && !isDetailedAnalysisRequest(text)
}

export function inferFocus(text: string): string[] {
  const focus: string[] = []
  if (/事业|工作|职业|项目|职场|创业|升职|跳槽/.test(text)) focus.push('事业')
  if (isWealthIntent(text)) focus.push('财富')
  if (isPartnerArchetypeQuestion(text) || /合作|合伙|搭档|伙伴|贵人|搭子/.test(text)) focus.push('合作对象')
  if (/感情|恋爱|婚姻|桃花|关系|伴侣|对象/.test(text)) focus.push('感情')
  if (/健康|身体|睡眠|压力|情绪|状态/.test(text)) focus.push('身心状态')
  if (/学业|学习|考试|成长/.test(text)) focus.push('学习成长')
  if (/出门|出行|远行|旅行|动身/.test(text)) focus.push('出行')
  if (/搬家|签约|签合同|开业|开张|面试|见客户|谈判|表白|约会|考试|提交|发布|上线|买房|卖房|投资|动工|开工|手术|复诊/.test(text)) focus.push('应事择日')
  return uniqueFocus(focus)
}

export function inferDepth(text: string): AgentOutputDepth | null {
  const compact = text.replace(/\s+/g, '')
  if (/简单|简洁|短一点|短些|一句话|只要重点|快速|大概/.test(compact)) return 'concise'
  if (/详细|深度|展开|完整|长报告|细一点|全面|研究报告/.test(compact)) return 'detailed'
  if (/均衡|适中|标准|正常/.test(compact)) return 'balanced'
  return null
}

function inferCategory(text: string): AgentMatterCategory {
  if (/头像|照片|形象|自拍|职业照/.test(text)) return 'avatar'
  if (isLifetimeWealthQuestion(text) || isPartnerArchetypeQuestion(text)) return 'lifepath'
  if (
    /合盘|关系|缘分|相处|伴侣|情侣|夫妻|合作|同事|朋友/.test(text) ||
    /(?:我|本人|自己|当前命主)\s*(?:和|跟|与)/.test(text) ||
    /(?:和|跟|与).{1,18}(?:适合|合适|匹配|般配|合不合|配不配|关系|缘分)/.test(text)
  ) return 'relationship'
  if (/应事|事件|这件事|选择|决策|要不要|适不适合|能不能/.test(text)) return 'event'
  if (/人生脉络|人生总览|一生|大运|格局|命格|长期趋势/.test(text)) return 'lifepath'
  if (/运势|流年|财运|事业运|感情运|桃花|健康运|这段时间|最近|近期|接下来|未来|今年|怎么样|如何/.test(text)) return 'fortune'
  return 'general'
}

export function isPlainChatRequest(text: string): boolean {
  const compact = text.replace(/[\s。！？!?,，～~.]/g, '').toLowerCase()
  if (/^(你好|您好|嗨|hi|hello|在吗|早上好|下午好|晚上好|谢谢|感谢|多谢|thx|thanks)$/.test(compact)) {
    return true
  }
  return /(不用|不要|不需要|先别|别).{0,8}(报告|结构化|推演)|简单(说|聊|讲)|大概说|随便聊|像聊天|直接聊/.test(text)
}

export function hasAnalysisIntent(text: string): boolean {
  if (isPlainChatRequest(text)) return false
  return /(分析|报告|推演|看看|看下|看一下|测|算|问|如何|怎么样|什么时候|何时|几岁|哪年|哪几年|适合|合适|合不合适|配不配|般配|匹配|运势|流年|合盘|关系|人生|此生|一生|大运|财运|财富|暴富|发财|搞钱|赚钱|财库|事业|感情|健康|选择|应事)/.test(text)
}

function cleanName(raw: string): string | null {
  const name = raw
    .replace(/^[@#]/, '')
    .replace(/(今年|本年|明年|后年|未来|接下来|最近|近期|这段时间|那段时间|谁更|谁比较|哪个更|哪一个更|更适合|更合适|更匹配|更般配|一起|一块|关系|合盘|相处|合作|搞事情|搞事|做事|创业|缘分|感情|怎么样|如何|好不好|适不适合|合不合适|合不合|配不配|适合|合适|匹配|般配|要不要|能不能|可不可以|好吗|吗|呢|呀).*$/u, '')
    .replace(/[，,。！？!?.、：:；;（）()【】\[\]{}"'“”‘’\s]/g, '')
    .trim()
  if (!name || SELF_NAMES.has(name)) return null
  if (name.length < 2 || name.length > 18) return null
  return name
}

function cleanCorrectionName(raw: string): string | null {
  return cleanName(
    raw
      .replace(/^(?:不是|并不是|而是|是|叫|应该是|应该叫|改成|换成|新人物|新人)/u, '')
      .replace(/(?:是|叫)$/u, '')
      .replace(/(?:是)?(?:新人物|新人|新的(?:人物|人)?|另一个(?:人物|人)?|不是同一个(?:人物|人)?).*$/u, ''),
  )
}

function buildPersonCorrection(
  intendedRaw: string,
  rejectedRaw: string | undefined,
  text: string,
  confidence: 'medium' | 'high' = 'high',
): AgentPersonCorrection | null {
  const intendedName = cleanCorrectionName(intendedRaw)
  const rejectedName = rejectedRaw ? cleanCorrectionName(rejectedRaw) : null
  if (!intendedName || SELF_NAMES.has(intendedName)) return null
  if (rejectedName && intendedName === rejectedName) return null
  return {
    intent: 'correction',
    scope: 'person',
    intendedName,
    rejectedName: rejectedName || undefined,
    createNew: /新人物|新人|新的(?:人物|人)?|另一个(?:人物|人)?|不是同一个/.test(text),
    confidence,
    source: 'rule',
  }
}

export function extractPersonCorrection(text: string): AgentPersonCorrection | null {
  const normalized = text.replace(/\s+/g, '')
  if (!/(不是|并不是|改成|换成|应该是|应该叫|说错|搞错|新人物|新人|另一个)/.test(normalized)) {
    return null
  }

  const newPersonMatch = normalized.match(/([^，,。！？!?；;]{2,18}?)(?:是|算是|属于)?(?:新人物|新人|新的(?:人物|人)?|另一个(?:人物|人)?)[，,。；;]?(?:不是|并不是)([^，,。！？!?；;]{2,18})/u)
  if (newPersonMatch) {
    return buildPersonCorrection(newPersonMatch[1], newPersonMatch[2], normalized, 'high')
  }

  const rejectedThenIntended = normalized.match(/(?:不是|并不是)([^，,。！？!?；;]{2,18}?)(?:，|,|。|；|;)?(?:而是|是|应该是|应该叫|改成|换成|叫)([^，,。！？!?；;]{2,18})/u)
  if (rejectedThenIntended) {
    return buildPersonCorrection(rejectedThenIntended[2], rejectedThenIntended[1], normalized, 'high')
  }

  const intendedThenRejected = normalized.match(/(?:刚才|之前|上面)?(?:说的|问的|提到的)?(?:是)?([^，,。！？!?；;]{2,18}?)(?:不是|并不是)([^，,。！？!?；;]{2,18})/u)
  if (intendedThenRejected) {
    return buildPersonCorrection(intendedThenRejected[1], intendedThenRejected[2], normalized, 'medium')
  }

  return null
}

function splitMentionedNameCandidates(raw: string): string[] {
  const stripped = raw
    .replace(/(今年|本年|明年|后年|未来|接下来|最近|近期|这段时间|那段时间|谁更|谁比较|哪个更|哪一个更|更适合|更合适|更匹配|更般配|一起|一块|关系|合盘|相处|合作|搞事情|搞事|做事|创业|缘分|感情|怎么样|如何|好不好|适不适合|合不合适|合不合|配不配|适合|合适|匹配|般配|要不要|能不能|可不可以|好吗|吗|呢|呀).*$/u, '')
  return stripped
    .split(/(?:和|跟|与|、|,|，|;|；)/u)
    .map(part => cleanName(part))
    .filter((name): name is string => !!name)
}

export function hasAgentCorrectionSignal(text: string): boolean {
  if (extractPersonCorrection(text)) return true
  return /(刚才|上面|之前|前面).{0,12}(错|不对|搞错|搞混)|(?:不是|并不是).{1,24}(而是|是|应该是|改成|换成)|(?:改成|换成|应该是|应该叫|新人物|新人|另一个|我说的是|我问的是|你搞混|搞混了)/.test(text)
}

export function extractMentionedNames(text: string): string[] {
  const names: string[] = []
  const addName = (name: string | null) => {
    const normalized = name?.trim()
    if (normalized && !names.includes(normalized)) names.push(normalized)
  }
  const patterns = [
    /((?:我|本人|自己|当前命主|[^，,。！？!?\s]{2,18})(?:(?:和|跟|与|、|,|，)[^，,。！？!?\s]{2,18})+)\s*(?:适合|合适|一起|一块|合作|搞事情|搞事|做事|创业|合盘|关系|相处|缘分|怎么样|如何|好不好|吗|呢|吧)/gu,
    /(?:我|本人|自己|当前命主)\s*(?:和|跟|与)\s*([^，,。！？!?\s]{2,18})/gu,
    /(?:谁更|谁比较|哪个更|哪一个更)(?:适合|合适|匹配|般配)\s*([^，,。！？!?\s]{2,18})/gu,
    /(?:和|跟|与)\s*([^，,。！？!?\s]{2,18})\s*(?:合盘|关系|相处|合作|缘分|感情|怎么样|如何|适合|合适|匹配|般配|合不合|配不配)/gu,
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const candidates = splitMentionedNameCandidates(match[1] || '')
      if (candidates.length > 0) {
        candidates.forEach(addName)
      } else {
        addName(cleanName(match[1] || ''))
      }
    }
  }
  return names
}

export function buildInitialSlots(input: {
  messages: AgentMessage[]
  timeRanges?: AgentTimeRangeContext[]
  sessionSummary?: string | null
}): AgentAnalysisSlots {
  const latest = latestUserText(input.messages)
  const combined = `${input.sessionSummary || ''}\n${recentConversationText(input.messages)}`
  const category = inferCategory(latest)
  const focus = inferFocus(latest)
  const depth = inferDepth(latest)
  const askedTime = parseAskedTime(latest, input.timeRanges, category) || (
    /这段时间|那段时间|上面|上述|刚才|之前/.test(latest)
      ? parseAskedTime(combined, input.timeRanges, category)
      : null
  )
  const analysisIntent = hasAnalysisIntent(latest)
  const supplements = input.sessionSummary ? [input.sessionSummary] : []
  if (isLifetimeWealthQuestion(latest)) {
    supplements.push('用户在问人生尺度的财富突破/财富窗口，应结合命盘底色与大运阶段分析，不需要再追问短期时间范围。')
  }
  if (isPartnerArchetypeQuestion(latest)) {
    supplements.push(BUBU_PROMPTS.agent.supplements.partnerArchetype)
  }
  const matter: AgentMatter | null = analysisIntent
    ? {
        raw: latest,
        category,
        focus,
        analysisMode: 'analysis',
        confidence: category === 'general' && focus.length === 0 ? 'low' : 'high',
      }
    : {
        raw: latest,
        category: 'general',
        focus,
        analysisMode: 'chat',
        confidence: 'high',
      }

  return {
    people: [],
    mentionedNames: extractMentionedNames(latest),
    askedTime,
    matter,
    supplements,
    outputDepth: depth,
    confidence: {
      people: 'none',
      time: askedTime?.confidence || 'none',
      matter: matter?.confidence || 'none',
      depth: depth ? 'high' : 'none',
    },
    missingSlot: null,
  }
}
