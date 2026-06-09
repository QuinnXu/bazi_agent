import { getCurrentDateString } from '@/lib/chat-service'
import {
  getDailyGanZhiRange,
  getMonthlyGanZhiRange,
} from '@/lib/calendar'
import { isLifetimeWealthQuestion, isPartnerArchetypeQuestion } from '@/lib/agent-slot-extractor'
import {
  getScenarioLabel,
  getScenarioPrompt,
  getScenarioStructure,
  inferAgentScenario,
  type AgentScenarioKind,
} from '@/lib/agent-scenario-prompts'
import type {
  AgentAnalysisRequest,
  AgentAnalysisSlots,
  AgentCalendarContext,
  AgentOutputDepth,
  AgentResolvedPerson,
} from '@/lib/agent-workflow-types'
import {
  BUBU_PROMPTS,
  buildAgentAnalysisDepthInstruction,
  buildAgentAnalysisSystemPrompt,
  buildAgentAnalysisUserPrompt,
} from '@/lib/bubu-content'

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

function depthInstruction(depth: Exclude<AgentOutputDepth, 'chat'>, slots: AgentAnalysisSlots): string {
  const raw = slots.matter?.raw || ''
  const longHorizon = isLifetimeWealthQuestion(raw) || slots.matter?.category === 'lifepath'
  return buildAgentAnalysisDepthInstruction(depth, longHorizon)
}

function structureInstruction(scenario: AgentScenarioKind): string {
  return getScenarioStructure(scenario)
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
  const scenario = inferAgentScenario(slots, request.userQuestion)
  const scenarioLabel = getScenarioLabel(scenario)
  const intentNote = isLifetimeWealthQuestion(slots.matter?.raw || request.userQuestion)
    ? BUBU_PROMPTS.agent.intentNotes.lifetimeWealth
    : isPartnerArchetypeQuestion(slots.matter?.raw || request.userQuestion)
      ? BUBU_PROMPTS.agent.intentNotes.partnerArchetype
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

  const system = buildAgentAnalysisSystemPrompt({
    nowText: request.calendar.nowText,
    timezone: request.calendar.timezone,
    structureInstruction: structureInstruction(scenario),
    scenarioPrompt: getScenarioPrompt(scenario, { depth: request.depth }),
    depthInstruction: depthInstruction(request.depth, slots),
    promptStyleHint: request.promptStyleHint,
  })

  const user = buildAgentAnalysisUserPrompt({
    userQuestion: request.userQuestion,
    nowText: request.calendar.nowText,
    timezone: request.calendar.timezone,
    calendarTableText: request.calendar.tableText,
    peopleText: people,
    matterCategory: slots.matter?.category || 'general',
    scenarioLabel,
    focusText: focus,
    rawMatter: slots.matter?.raw || request.userQuestion,
    intentNote,
    supplementsText: supplements,
  })

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
