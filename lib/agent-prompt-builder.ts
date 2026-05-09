import { getCurrentDateString } from '@/lib/chat-service'
import {
  getDailyGanZhiRange,
  getMonthlyGanZhiRange,
} from '@/lib/calendar'
import { BBX_PERSONA } from '@/lib/feature-prompts'
import type {
  AgentAnalysisRequest,
  AgentAnalysisSlots,
  AgentCalendarContext,
  AgentOutputDepth,
  AgentResolvedPerson,
} from '@/lib/agent-workflow-types'

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}\n...（已截断）` : text
}

function dayunFromText(text?: string | null): string {
  if (!text) return ''
  const lines = text.split('\n')
  const direct = lines.filter(line => /岁大运|大运\s+\d{4}/.test(line)).join('\n')
  if (direct.trim()) return truncate(direct, 1600)
  const idx = lines.findIndex(line => /年龄\s*大运\s*年份|大运/.test(line))
  if (idx >= 0) return truncate(lines.slice(idx, idx + 18).join('\n'), 1600)
  return ''
}

function personDayunBlock(person: AgentResolvedPerson): string {
  if (person.dayun?.length) {
    return person.dayun
      .map(item => `${item.ageStart}-${item.ageEnd}岁 ${item.ganZhi} ${item.yearStart}-${item.yearEnd}`)
      .join('\n')
  }
  return dayunFromText(person.baziText)
}

function personBlock(person: AgentResolvedPerson, index: number): string {
  const pillars = person.pillars ? `\n四柱：${person.pillars}` : ''
  const bazi = person.baziText ? `\n命盘文本：\n${truncate(person.baziText, 2200)}` : ''
  const dayun = personDayunBlock(person)
  const dayunText = dayun ? `\n大运信息：\n${dayun}` : '\n大运信息：（未在资料中找到结构化大运，按现有命盘文本谨慎参考）'
  return `### 人物 ${index + 1}：${person.name || '未命名'}${pillars}${dayunText}${bazi}`
}

function depthInstruction(depth: AgentOutputDepth): string {
  if (depth === 'concise') {
    return '输出 500-900 中文字。先给结论，再给关键依据、时间/风险提醒和 3-5 条行动建议。'
  }
  if (depth === 'detailed') {
    return '输出深度报告。结构完整，展开命局/大运/流年流月作用、关键时间窗口、风险点和行动地图；避免重复堆字。'
  }
  return '输出 1200-2600 中文字。保留清晰层级，兼顾命理依据、阶段节奏、重点方向和可执行建议。'
}

function structureInstruction(slots: AgentAnalysisSlots): string {
  const category = slots.matter?.category
  if (category === 'relationship') {
    return '结构按：关系总览、双方能量互动、大运/流年里的关系节奏、关键磨合点、行动建议。'
  }
  if (category === 'lifepath') {
    return '结构按：格局底色、核心性格与能力、大运分段、关键人生窗口、当下行动建议。'
  }
  if (category === 'event') {
    return '结构按：问题背景复述、命理倾向、时机与风险、可选路径比较、行动建议。'
  }
  if (category === 'fortune') {
    return '结构按：执行摘要、命盘与周期基线、所问时间走势、分重点解读、行动清单。'
  }
  return '结构按：核心结论、命理依据、相关时间/人物因素、行动建议、小象提醒。'
}

function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function todayInShanghai(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value || 1)
  return formatDate(new Date(get('year'), get('month') - 1, get('day'), 12, 0, 0))
}

export function buildCalendarContext(slots: AgentAnalysisSlots): AgentCalendarContext {
  const askedTime = slots.askedTime
  let tableText = '【所问时间】用户没有指定明确时间范围；如需要时间推演，只能围绕当下和问题语境做参考。'
  if (askedTime) {
    const start = new Date(`${askedTime.start}T12:00:00`)
    const end = new Date(`${askedTime.end}T12:00:00`)
    if (askedTime.granularity === 'day') {
      const points = getDailyGanZhiRange(start, end, 45)
      const lines = points.map(point => `- ${point.label}`)
      tableText = `【所问时间（公历，逐日/关键日）】${askedTime.label}：${askedTime.start} ~ ${askedTime.end}\n${lines.join('\n')}`
    } else {
      const points = getMonthlyGanZhiRange(start, end, 48)
      const lines = points.map(point => `- ${point.label}`)
      tableText = `【所问时间（公历，逐月/阶段）】${askedTime.label}：${askedTime.start} ~ ${askedTime.end}\n${lines.join('\n')}`
    }
  }
  return {
    nowText: getCurrentDateString(),
    today: todayInShanghai(),
    timezone: 'Asia/Shanghai',
    askedTime,
    tableText,
  }
}

export function buildAgentAnalysisMessages(request: AgentAnalysisRequest): any[] {
  const slots = request.slots
  const people = slots.people.length
    ? slots.people.map(personBlock).join('\n\n')
    : '（本次没有可验证人物命盘，禁止编造八字信息）'
  const focus = slots.matter?.focus?.length
    ? slots.matter.focus.join('、')
    : '用户未指定，围绕问题自然提炼重点'
  const supplements = slots.supplements.length
    ? slots.supplements.map(item => `- ${truncate(item, 500)}`).join('\n')
    : '（无额外补充）'

  const system = `${BBX_PERSONA}

你现在不是四项工具之一，而是卜卜象统一分析引擎。请基于已确认的“人物、所问时间、所问事宜、补充信息”生成回答。

【当前时间锚点】
- 现在是：${request.calendar.nowText}
- 时区：${request.calendar.timezone}

【硬性规则】
- 不编造人物、出生信息、四柱、图片观察、具体日期或专业结论。
- 命理表达必须使用“趋势 / 倾向 / 参考 / 建议”，避免“必然、注定、绝对”。
- 涉及医疗、法律、投资等高风险事项，只能给趋势参考，并建议咨询专业人士。
- 用户的主动选择永远比命理更重要。
- 不要输出内部字段名、JSON 或工具调用痕迹。

【本次结构】
${structureInstruction(slots)}

【本次篇幅】
${depthInstruction(request.depth)}
${request.promptStyleHint ? `\n【用户风格补充】\n${request.promptStyleHint}` : ''}`

  const user = `【用户原问题】
${request.userQuestion}

【当前公历信息】
现在是：${request.calendar.nowText}
时区：${request.calendar.timezone}

${request.calendar.tableText}

【相关人物八字与大运】
${people}

【所问事宜】
类型：${slots.matter?.category || 'general'}
重点：${focus}
原话：${slots.matter?.raw || request.userQuestion}

【补充信息】
${supplements}

请直接给用户最终分析。`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
