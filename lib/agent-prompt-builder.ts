import { getCurrentDateString } from '@/lib/chat-service'
import {
  getDailyGanZhiRange,
  getMonthlyGanZhiRange,
} from '@/lib/calendar'
import { BBX_PERSONA } from '@/lib/feature-prompts'
import { isLifetimeWealthQuestion, isPartnerArchetypeQuestion } from '@/lib/agent-slot-extractor'
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

function depthInstruction(depth: AgentOutputDepth, slots: AgentAnalysisSlots): string {
  if (depth === 'concise') {
    return '输出 500-900 中文字。先给结论，再给关键依据、时间/风险提醒和 3-5 条行动建议。'
  }
  if (depth === 'detailed') {
    const raw = slots.matter?.raw || ''
    const longHorizon = isLifetimeWealthQuestion(raw) || slots.matter?.category === 'lifepath'
    const target = longHorizon
      ? '目标 12000-22000 中文字；如果资料足够，请按人生阶段/大运窗口充分展开。'
      : '目标 9000-16000 中文字；如果所问时间跨度较长，请按阶段或月份充分展开。'
    return `输出长篇深度报告，${target}
- 不要在 3000-5000 字左右提前收尾；max_tokens 已为长文预留，请把空间用于具体推演。
- 至少包含 7 个以上清晰一级章节，每个核心章节至少 4-7 个自然段。
- 充分展开命局底色、大运/流年/流月作用、关键时间窗口、条件触发、风险点、反例提醒和行动地图。
- 可以用表格或分段清单帮助扫描，但每个结论后必须给出命理依据和现实行动含义。
- 不要用重复话水字数；用具体阶段、窗口、条件、风险和建议填充篇幅。`
  }
  return '输出 1200-2600 中文字。保留清晰层级，兼顾命理依据、阶段节奏、重点方向和可执行建议。'
}

function structureInstruction(slots: AgentAnalysisSlots): string {
  const category = slots.matter?.category
  const raw = slots.matter?.raw || ''
  if (isLifetimeWealthQuestion(raw)) {
    return '结构按：财富格局底色、人生/大运财富窗口、当下阶段与未来关键节点、风险与现金流提醒、可执行行动建议。必须把“暴富/发财”处理为机会窗口与风险概率，不能承诺必然结果。'
  }
  if (isPartnerArchetypeQuestion(raw)) {
    return '结构按：命主赚钱方式、适合的合作对象画像、互补资源与分工方式、合作雷区、如何筛选真实候选人、行动建议。不要假设有具体第二个人命盘。'
  }
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
  const intentNote = isLifetimeWealthQuestion(slots.matter?.raw || request.userQuestion)
    ? '人生财富窗口：用户在问财富突破/发财暴富的阶段性机会。请结合命盘与大运看窗口、条件和风险，不要把它降级为短期运势，也不要保证结果。'
    : isPartnerArchetypeQuestion(slots.matter?.raw || request.userQuestion)
      ? '合作对象画像：用户在问适合哪类人一起赚钱/搞钱。请基于当前命主分析互补人群、合作方式和筛选标准，不要要求或假设一个具体第二人。'
      : ''
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
${depthInstruction(request.depth, slots)}
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
${intentNote ? `意图策略：${intentNote}` : ''}

【补充信息】
${supplements}

请直接给用户最终分析。`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
