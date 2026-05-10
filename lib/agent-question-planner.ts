import type {
  AgentAnalysisSlots,
  AgentAskedTime,
  AgentBaziFormData,
  AgentHumanInputField,
  AgentHumanInputRequestUiEvent,
  AgentOutputDepth,
  AgentWorkflowCorrection,
  PendingAgentStep,
  PendingAgentStepKind,
} from '@/lib/agent-workflow-types'
import type { AgentCardFamily, AgentCardPlan } from '@/lib/agent-card-planner'
import { getAgentReportAppleCost } from '@/lib/apple-costs'
import {
  extractPersonCorrection,
  isDateChoiceQuestion,
  isLifetimeWealthQuestion,
  isPartnerArchetypeQuestion,
  parseAskedTime,
} from '@/lib/agent-slot-extractor'

type AgentFieldOptions = NonNullable<AgentHumanInputField['options']>

const DEFAULT_BAZI_FORM_DATA: AgentBaziFormData = {
  profileName: '',
  year: '',
  month: '1',
  day: '1',
  hour: '',
  minute: '',
  isSolar: true,
  isFemale: false,
  longitude: '121.5',
  latitude: '31.2',
}

function newRequestId(kind: string): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function cloneSlots(slots: AgentAnalysisSlots): AgentAnalysisSlots {
  return JSON.parse(JSON.stringify(slots))
}

function baziDataToFields(data: AgentBaziFormData): AgentHumanInputField[] {
  return [
    { name: 'profileName', label: '人物名称', inputType: 'text', required: true, value: data.profileName || '' },
    { name: 'year', label: '出生年', inputType: 'number', required: true, value: data.year },
    { name: 'month', label: '出生月', inputType: 'select', required: true, value: data.month },
    { name: 'day', label: '出生日', inputType: 'number', required: true, value: data.day },
    { name: 'hour', label: '出生时', inputType: 'select', required: true, value: data.hour },
    { name: 'minute', label: '出生分', inputType: 'number', value: data.minute },
    {
      name: 'isSolar',
      label: '历法',
      inputType: 'select',
      required: true,
      value: data.isSolar ? 'solar' : 'lunar',
      options: [
        { label: '公历 / 阳历', value: 'solar' },
        { label: '农历 / 阴历', value: 'lunar' },
      ],
    },
    {
      name: 'gender',
      label: '性别',
      inputType: 'select',
      required: true,
      value: data.isFemale ? 'female' : 'male',
      options: [
        { label: '男', value: 'male' },
        { label: '女', value: 'female' },
      ],
    },
    { name: 'longitude', label: '出生地经度', inputType: 'number', required: true, value: data.longitude },
    { name: 'latitude', label: '出生地纬度', inputType: 'number', required: true, value: data.latitude },
  ]
}

function pad2(value: string): string {
  return value.padStart(2, '0')
}

export function buildBaziFormDataFromText(text: string, profileName = ''): AgentBaziFormData {
  const data = { ...DEFAULT_BAZI_FORM_DATA, profileName }
  const dateMatch = text.match(/(19\d{2}|20\d{2})[.\-/年](\d{1,2})[.\-/月](\d{1,2})日?/)
  if (dateMatch) {
    data.year = dateMatch[1]
    data.month = String(Number(dateMatch[2]))
    data.day = String(Number(dateMatch[3]))
  }
  const timeMatch = text.match(/(\d{1,2})[:：时点](\d{1,2})?/)
  if (timeMatch) {
    data.hour = pad2(timeMatch[1])
    data.minute = timeMatch[2] ? pad2(timeMatch[2]) : '0'
  }
  if (/农历|阴历/.test(text)) data.isSolar = false
  if (/公历|阳历/.test(text)) data.isSolar = true
  if (/女|女性|女生/.test(text)) data.isFemale = true
  if (/男|男性|男生/.test(text)) data.isFemale = false
  return data
}

export function buildBaziHumanInputRequest(
  content: string,
  initialData: AgentBaziFormData,
  resumeIntent: string,
): AgentHumanInputRequestUiEvent {
  const message = initialData.profileName
    ? `${content}\n如果名字识别不准，可以直接在卡片里改成正确人物名，卜卜象会按你填写的名字继续。`
    : content
  return {
    type: 'human_input_request',
    requestId: newRequestId('bazi_profile'),
    kind: 'bazi_profile',
    title: initialData.profileName
      ? `补全${initialData.profileName}的八字人物`
      : '新建八字人物',
    message,
    fields: baziDataToFields(initialData),
    submitLabel: initialData.profileName
      ? `生成${initialData.profileName}命盘并继续`
      : '生成命盘并继续',
    resumeIntent,
  }
}

function requestForField(
  kind: PendingAgentStepKind,
  title: string,
  message: string,
  field: AgentHumanInputField,
  submitLabel = '选好啦，继续',
): AgentHumanInputRequestUiEvent {
  return {
    type: 'human_input_request',
    requestId: newRequestId(kind),
    kind: 'feature_params',
    title,
    message,
    fields: [field],
    submitLabel,
    resumeIntent: message,
  }
}

function withTime(slots: AgentAnalysisSlots, askedTime: AgentAskedTime): AgentAnalysisSlots {
  const next = cloneSlots(slots)
  next.askedTime = askedTime
  next.confidence.time = 'high'
  return next
}

function withFocus(slots: AgentAnalysisSlots, focus: string[]): AgentAnalysisSlots {
  const next = cloneSlots(slots)
  if (next.matter) {
    next.matter.focus = focus
    next.matter.confidence = 'high'
  }
  next.confidence.matter = 'high'
  return next
}

function withDepth(slots: AgentAnalysisSlots, outputDepth: Exclude<AgentOutputDepth, 'chat'>): AgentAnalysisSlots {
  const next = cloneSlots(slots)
  next.outputDepth = outputDepth
  next.confidence.depth = 'high'
  return next
}

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

function readableTimeLabel(time: AgentAskedTime): string {
  const year = time.start.slice(0, 4)
  if (time.start === `${year}-01-01` && time.end === `${year}-12-31`) {
    return '今年全年'
  }
  return time.label
}

function extractTimeCue(text: string): string {
  const cues = [
    '未来几年',
    '接下来几年',
    '未来几个月',
    '接下来几个月',
    '未来',
    '以后',
    '后续',
    '后面',
    '往后',
    '接下来',
    '最近',
    '近期',
    '这段时间',
    '今年',
    '年底前',
    '到年底',
    '长期',
  ]
  return cues.find(cue => text.includes(cue)) || '这段时间'
}

function timeDescriptionFor(slots: AgentAnalysisSlots, label: string): string {
  const category = slots.matter?.category
  if (category === 'relationship') {
    if (/7 天|近期|短期/.test(label)) return '适合先看眼前互动和沟通节奏。'
    if (/年|长期|几年/.test(label)) return '适合看更长线的关系主题和阶段变化。'
    return '适合看关系走势、互动节奏和关键推进感。'
  }
  if (category === 'event') {
    if (/7 天|近期|决策/.test(label)) return '适合很快要做决定，先抓行动窗口。'
    return '适合看这件事后续如何展开，以及哪里要稳一点。'
  }
  if (category === 'lifepath') {
    return '适合看阶段主题、大运转折和长期节奏。'
  }
  if (/7 天|近期/.test(label)) return '适合看短期状态和马上能做的调整。'
  if (/年|长期|几/.test(label)) return '适合看阶段主题和比较大的节奏变化。'
  return '适合看阶段趋势和关键窗口。'
}

function customTimePlaceholder(slots: AgentAnalysisSlots): string {
  if (slots.matter?.category === 'relationship') {
    return '比如：先看三个月内 / 看到关系稳定前 / 看今年感情走向'
  }
  if (slots.matter?.category === 'event') {
    return '比如：这周能不能推进 / 到年底前 / 等结果出来前'
  }
  return '比如：先看三个月内 / 到年底前 / 接下来一个阶段'
}

function cardPlanMatches(plan: AgentCardPlan | null | undefined, families: AgentCardFamily[]): boolean {
  return !!plan && families.includes(plan.family)
}

function plannedText(
  plan: AgentCardPlan | null | undefined,
  families: AgentCardFamily[],
  field: 'title' | 'message' | 'submitLabel',
  fallback: string,
): string {
  if (!cardPlanMatches(plan, families)) return fallback
  return plan?.[field] || fallback
}

function optionHintMap(plan: AgentCardPlan | null | undefined): Map<string, { label?: string; description?: string; order: number }> {
  const map = new Map<string, { label?: string; description?: string; order: number }>()
  ;(plan?.optionHints || []).forEach((hint, order) => {
    map.set(hint.key, { label: hint.label, description: hint.description, order })
  })
  return map
}

function applyOptionHints(options: AgentFieldOptions, plan: AgentCardPlan | null | undefined): AgentFieldOptions {
  const hints = optionHintMap(plan)
  if (hints.size === 0) return options
  return options
    .map(option => {
      const hint = hints.get(String(option.value))
      if (!hint) return option
      return {
        ...option,
        label: hint.label || option.label,
        description: hint.description || option.description,
      }
    })
    .sort((left, right) => {
      const leftOrder = hints.get(String(left.value))?.order
      const rightOrder = hints.get(String(right.value))?.order
      if (leftOrder === undefined && rightOrder === undefined) return 0
      if (leftOrder === undefined) return 1
      if (rightOrder === undefined) return -1
      return leftOrder - rightOrder
    })
}

function optionFromTime(
  slots: AgentAnalysisSlots,
  value: string,
  label: string,
  description: string,
  askedTime: AgentAskedTime,
): AgentFieldOptions[number] {
  return {
    label,
    value,
    description,
    params: { draftSlots: withTime(slots, askedTime) },
  }
}

function weekendTime(today: Date): AgentAskedTime {
  const day = today.getDay()
  const startOffset = day === 0 ? 0 : day === 6 ? 0 : 6 - day
  const endOffset = day === 0 ? 0 : day === 6 ? 1 : 7 - day
  return {
    start: formatDate(addDays(today, startOffset)),
    end: formatDate(addDays(today, endOffset)),
    label: '本周末',
    granularity: 'day',
    confidence: 'high',
    source: 'relative_default',
  }
}

function singleDayTime(label: string, date: Date): AgentAskedTime {
  const dateText = formatDate(date)
  return {
    start: dateText,
    end: dateText,
    label,
    granularity: 'day',
    confidence: 'high',
    source: 'relative_default',
  }
}

function trendTime(label: string, start: string, end: string, granularity: AgentAskedTime['granularity']): AgentAskedTime {
  return {
    start,
    end,
    label,
    granularity,
    confidence: 'high',
    source: 'relative_default',
  }
}

function inferTimeCardFamily(
  slots: AgentAnalysisSlots,
  latestText: string,
  plan?: AgentCardPlan | null,
): Extract<AgentCardFamily, 'daily_decision' | 'short_trend' | 'long_trend'> {
  if (cardPlanMatches(plan, ['daily_decision', 'short_trend', 'long_trend'])) {
    return plan!.family as Extract<AgentCardFamily, 'daily_decision' | 'short_trend' | 'long_trend'>
  }
  const text = `${slots.matter?.raw || ''}\n${latestText}`
  if (isDateChoiceQuestion(text)) return 'daily_decision'
  if (/未来几年|接下来几年|长期|大运|人生|此生|一生|哪几年|几年|未来\s*[三四五六七八九十\d]+\s*年/.test(text)) {
    return 'long_trend'
  }
  return 'short_trend'
}

function timeOptionsForQuestion(
  slots: AgentAnalysisSlots,
  latestText: string,
  plan?: AgentCardPlan | null,
): AgentFieldOptions {
  const today = todayInShanghai()
  const todayText = formatDate(today)
  const family = inferTimeCardFamily(slots, latestText, plan)

  if (family === 'daily_decision') {
    return applyOptionHints([
      optionFromTime(slots, 'today', '就看今天', '适合马上要做决定，先看今天的宜忌和提醒。', singleDayTime('今天', today)),
      optionFromTime(slots, 'tomorrow', '看明天', '适合把行动往后放一天，对比明天的状态。', singleDayTime('明天', addDays(today, 1))),
      optionFromTime(slots, 'after_tomorrow', '看后天', '适合不急着定，先看后天是否更顺。', singleDayTime('后天', addDays(today, 2))),
      optionFromTime(slots, 'weekend', '看本周末', '适合出行、见面、搬动类安排。', weekendTime(today)),
    ], plan)
  }

  if (family === 'long_trend') {
    const options: AgentFieldOptions = []
    if (slots.askedTime) {
      options.push(optionFromTime(
        slots,
        'current_time',
        `就看「${readableTimeLabel(slots.askedTime)}」`,
        timeDescriptionFor(slots, slots.askedTime.label),
        { ...slots.askedTime, confidence: 'high' },
      ))
    }
    options.push(
      optionFromTime(slots, 'future_12_months', '看未来 12 个月', '适合看一个完整年度里的机会和波动。', trendTime('未来 12 个月', todayText, formatDate(addDays(addMonths(today, 12), -1)), 'month')),
      optionFromTime(slots, 'future_3_years', '看未来 3 年', '适合看阶段主题、机会窗口和节奏变化。', trendTime('未来 3 年', todayText, `${today.getFullYear() + 2}-12-31`, 'month')),
      optionFromTime(slots, 'future_5_years', '拉长看未来 5 年', '适合看更长线的大运和人生主题。', trendTime('未来 5 年', todayText, `${today.getFullYear() + 4}-12-31`, 'month')),
    )
    return applyOptionHints(options, plan)
  }

  return applyOptionHints([
    optionFromTime(slots, 'future_7_days', '先看未来 7 天', '适合很快要做决定，先抓短期状态。', trendTime('未来 7 天', todayText, formatDate(addDays(today, 6)), 'day')),
    optionFromTime(slots, 'future_30_days', '先看接下来 30 天', '适合看近期状态和短期行动。', trendTime('未来 30 天', todayText, formatDate(addDays(today, 29)), 'day')),
    optionFromTime(slots, 'future_3_months', '先看未来 3 个月', '适合看阶段趋势和关键窗口。', trendTime('未来 3 个月', todayText, formatDate(addDays(addMonths(today, 3), -1)), 'month')),
    optionFromTime(slots, 'rest_of_year', '看今年剩下的时间', '适合看今年后半程怎么收束。', trendTime('今年剩余时间', todayText, `${today.getFullYear()}-12-31`, 'month')),
  ], plan)
}

function timeCardCopy(
  slots: AgentAnalysisSlots,
  latestText: string,
  plan?: AgentCardPlan | null,
): { title: string; message: string; submitLabel: string; family: AgentCardFamily } {
  const family = inferTimeCardFamily(slots, latestText, plan)
  const fallback = family === 'daily_decision'
    ? {
        title: '确认择日范围',
        message: '这个问题更像在问哪一天更适合行动。你选一个日期，小象就按这一天来判断。',
        submitLabel: '按这个日期继续',
      }
    : family === 'long_trend'
      ? {
          title: '确认趋势时间线',
          message: '这个问题适合先定一个时间线宽度。你选长一点或短一点，小象就按这个范围展开。',
          submitLabel: '按这个时间线继续',
        }
      : {
          title: '确认时间范围',
          message: '这个问题要先定一个大概的观察范围。你可以选一个卜卜象先看，也可以直接写你心里的时间段。',
          submitLabel: '按这个范围继续',
        }

  return {
    family,
    title: plannedText(plan, [family], 'title', fallback.title),
    message: plannedText(plan, [family], 'message', fallback.message),
    submitLabel: plannedText(plan, [family], 'submitLabel', fallback.submitLabel),
  }
}

function buildAskedTime(
  label: string,
  start: string,
  end: string,
  granularity: AgentAskedTime['granularity'],
): AgentAskedTime {
  return {
    start,
    end,
    label,
    granularity,
    confidence: 'high',
    source: 'relative_default',
  }
}

function fallbackTimeForCustomAnswer(slots: AgentAnalysisSlots, rawText: string): AgentAskedTime {
  const today = todayInShanghai()
  const todayText = formatDate(today)
  const text = `${slots.matter?.raw || ''}\n${rawText}`
  const category = slots.matter?.category

  if (category === 'relationship') {
    return buildAskedTime(
      '接下来一个关系阶段',
      todayText,
      formatDate(addDays(addMonths(today, 3), -1)),
      'month',
    )
  }

  if (category === 'event') {
    if (/最近|近期|短期|这几天|这周|马上|很快|决定|决策|要不要|能不能|适不适合/.test(text)) {
      return buildAskedTime(
        '近期决策窗口',
        todayText,
        formatDate(addDays(addMonths(today, 1), -1)),
        'day',
      )
    }
    return buildAskedTime(
      '后续发展阶段',
      todayText,
      formatDate(addDays(addMonths(today, 3), -1)),
      'month',
    )
  }

  if (category === 'lifepath') {
    return buildAskedTime(
      '接下来几年',
      todayText,
      `${today.getFullYear() + 2}-12-31`,
      'month',
    )
  }

  if (/最近|近期|短期|这几天|这周|马上|很快/.test(text)) {
    return buildAskedTime(
      '近期状态',
      todayText,
      formatDate(addDays(today, 29)),
      'day',
    )
  }

  return buildAskedTime(
    '接下来一个阶段',
    todayText,
    formatDate(addDays(addMonths(today, 3), -1)),
    'month',
  )
}

function withCustomTime(slots: AgentAnalysisSlots, askedTime: AgentAskedTime, rawText: string): AgentAnalysisSlots {
  const next = withTime(slots, { ...askedTime, confidence: 'high' })
  if (rawText.trim()) {
    next.supplements = [
      ...next.supplements,
      `用户对时间语义的定义：${rawText.trim()}。内部按「${askedTime.label}」换算推演范围。`,
    ]
  }
  return next
}

function timeOptions(slots: AgentAnalysisSlots): AgentHumanInputField['options'] {
  const current = slots.askedTime
  if (!current) return []
  const today = todayInShanghai()
  const todayText = formatDate(today)
  const options: AgentHumanInputField['options'] = [
    {
      label: `就看「${readableTimeLabel(current)}」`,
      value: 'current_time',
      description: timeDescriptionFor(slots, current.label),
      params: { draftSlots: withTime(slots, { ...current, confidence: 'high' }) },
    },
  ]
  if (/年/.test(current.label)) {
    const future12Months: AgentAskedTime = {
      start: todayText,
      end: formatDate(addDays(addMonths(today, 12), -1)),
      label: '未来 12 个月',
      granularity: 'month',
      confidence: 'high',
      source: 'relative_default',
    }
    const future5Years: AgentAskedTime = {
      start: todayText,
      end: `${today.getFullYear() + 4}-12-31`,
      label: '未来 5 年',
      granularity: 'month',
      confidence: 'high',
      source: 'relative_default',
    }
    options.push(
      {
        label: '改成从今天往后 12 个月',
        value: 'future_12_months',
        description: '适合看一个完整阶段里的节奏变化。',
        params: { draftSlots: withTime(slots, future12Months) },
      },
      {
        label: '拉长看未来 5 年',
        value: 'future_5_years',
        description: '适合看更长线的大运和人生主题。',
        params: { draftSlots: withTime(slots, future5Years) },
      },
    )
    return options
  }
  options.push(
    {
      label: '拉长看未来 3 个月',
      value: 'future_3_months',
      description: '适合看阶段节奏和关键窗口。',
      params: {
        draftSlots: withTime(slots, {
          start: current.start,
          end: formatDate(addDays(addMonths(new Date(`${current.start}T12:00:00`), 3), -1)),
          label: '未来 3 个月',
          granularity: 'month',
          confidence: 'high',
          source: 'relative_default',
        }),
      },
    },
    {
      label: '缩短到未来 7 天',
      value: 'future_7_days',
      description: '适合很快要做决定，先抓短期状态。',
      params: {
        draftSlots: withTime(slots, {
          start: current.start,
          end: formatDate(addDays(new Date(`${current.start}T12:00:00`), 6)),
          label: '未来 7 天',
          granularity: 'day',
          confidence: 'high',
          source: 'relative_default',
        }),
      },
    },
  )
  return options
}

function focusOptions(slots: AgentAnalysisSlots, plan?: AgentCardPlan | null): AgentHumanInputField['options'] {
  const category = slots.matter?.category
  const base = category === 'relationship'
    ? [
        ['互动磨合', '看沟通方式、边界感和相处节奏。'],
        ['关系走向', '看关系未来更容易靠近还是拉扯。'],
        ['关键时间', '看哪些时间窗更适合推进或放缓。'],
      ]
    : category === 'lifepath'
      ? [
          ['事业财富', '先抓能力、机会和财富节奏。'],
          ['关系成长', '看亲密关系、家庭互动和内在课题。'],
          ['完整人生地图', '看格局底色、大运阶段和关键节点。'],
        ]
      : [
          ['事业', '看工作机会、节奏和行动建议。'],
          ['财富', '看收入机会、花费风险和资源配置。'],
          ['感情', '看关系氛围、桃花和相处建议。'],
          ['整体', '综合看事业、财富、关系和身心状态。'],
        ]

  return applyOptionHints(base.map(([label, description], index) => ({
    label,
    value: `focus_${index}`,
    description,
    params: { draftSlots: withFocus(slots, [label]) },
  })), plan)
}

function extractCreatedProfileName(text: string): string | null {
  const match = text.match(/已创建八字人物[：:]\s*([^\n。；;]+)/)
  const name = match?.[1]
    ?.replace(/人物名修正.*$/u, '')
    .replace(/[，,。！？!?.、：:；;（）()【】\[\]{}"'“”‘’\s]/g, '')
    .trim()
  return name || null
}

const SELF_NAMES = new Set(['我', '本人', '自己', '当前命主', '用户', '命主'])

function profileNameEquals(left?: string | null, right?: string | null): boolean {
  const a = left?.trim().toLowerCase()
  const b = right?.trim().toLowerCase()
  return !!a && !!b && a === b
}

function applyPersonCorrection(
  slots: AgentAnalysisSlots,
  latestText: string,
  explicitCorrection?: AgentWorkflowCorrection | null,
): AgentAnalysisSlots | null {
  const correction = explicitCorrection?.scope === 'person'
    ? explicitCorrection
    : extractPersonCorrection(latestText)
  if (!correction) return null

  const next = cloneSlots(slots)
  const rejectedName = correction.rejectedName
  next.people = next.people.filter(person => {
    if (SELF_NAMES.has(person.name?.trim())) return true
    return rejectedName ? !profileNameEquals(person.name, rejectedName) : false
  })
  next.mentionedNames = [correction.intendedName]
  next.unresolvedNames = [correction.intendedName]
  next.confidence.people = 'medium'
  next.supplements = [
    ...next.supplements,
    rejectedName
      ? `用户修正人物身份：这次说的是「${correction.intendedName}」，不是「${rejectedName}」。${correction.createNew ? '用户说明这是新人物，需要补全命盘后再继续。' : '后续以修正后的名字重新解析人物。'}`
      : `用户修正人物身份：这次说的是「${correction.intendedName}」。`,
  ]
  return next
}

function applyWorkflowCorrection(
  slots: AgentAnalysisSlots,
  latestText: string,
  correction?: AgentWorkflowCorrection | null,
): AgentAnalysisSlots | null {
  const personSlots = applyPersonCorrection(slots, latestText, correction)
  if (personSlots) return personSlots
  if (!correction || correction.intent !== 'correction') return null

  if (correction.scope === 'time') {
    const askedTime = parseAskedTime(correction.timeText, undefined, slots.matter?.category)
    if (!askedTime) return null
    return withTime(slots, { ...askedTime, confidence: correction.confidence === 'high' ? 'high' : 'medium' })
  }

  if (correction.scope === 'focus' && correction.focus.length > 0) {
    return withFocus(slots, correction.focus)
  }

  if (correction.scope === 'depth') {
    return withDepth(slots, correction.depth)
  }

  return null
}

function depthOptions(slots: AgentAnalysisSlots, plan?: AgentCardPlan | null): AgentHumanInputField['options'] {
  return applyOptionHints([
    {
      label: '简洁结论',
      value: 'concise',
      description: `${getAgentReportAppleCost('concise')} 个苹果，先给结论、依据和行动提醒。`,
      params: { draftSlots: withDepth(slots, 'concise') },
    },
    {
      label: '均衡分析',
      value: 'balanced',
      description: `${getAgentReportAppleCost('balanced')} 个苹果，适合多数问题，结构完整但不冗长。`,
      params: { draftSlots: withDepth(slots, 'balanced') },
    },
    {
      label: '深度报告',
      value: 'detailed',
      description: `${getAgentReportAppleCost('detailed')} 个苹果，展开大运、时间窗口和行动地图。`,
      params: { draftSlots: withDepth(slots, 'detailed') },
    },
  ], plan)
}

export interface PlannedAgentQuestion {
  content: string
  ui: AgentHumanInputRequestUiEvent
  pending: PendingAgentStep
}

export type AgentQuestionResponseMode = 'direct_answer' | 'report' | 'ask_more'

interface PlanNextQuestionOptions {
  responseMode?: AgentQuestionResponseMode
}

export function planNextQuestion(
  slots: AgentAnalysisSlots,
  latestText: string,
  cardPlan?: AgentCardPlan | null,
  options: PlanNextQuestionOptions = {},
): PlannedAgentQuestion | null {
  const responseMode = options.responseMode || 'report'
  const shouldCollectClarifyingCards = responseMode !== 'direct_answer'
  const shouldCollectReportCards = responseMode === 'report'
  const category = slots.matter?.category || 'general'
  const intentText = slots.matter?.raw || latestText
  const lifetimeWealth = isLifetimeWealthQuestion(intentText)
  const partnerArchetype = isPartnerArchetypeQuestion(intentText)
  const unresolvedNames = partnerArchetype ? [] : (slots.unresolvedNames || [])
  const needsPeople = slots.matter?.analysisMode === 'analysis' && category !== 'avatar'
  const needsConcreteCounterparty = category === 'relationship' && !partnerArchetype
  if (needsPeople && (unresolvedNames.length || slots.people.length === 0 || (needsConcreteCounterparty && slots.people.length < 2))) {
    const profileName = unresolvedNames[0] || (needsConcreteCounterparty ? '对方' : '')
    const content = profileName
      ? `我先理解你说的对方是「${profileName}」。如果要看两个人适不适合，需要先有对方的八字资料；你也可以在卡片里把名字改准。`
      : '我还没确定这次要看哪位命主。如果要做命盘分析，先补一个八字人物；如果只是想轻聊，也可以直接告诉我先简单聊。'
    const initialData = buildBaziFormDataFromText(latestText, profileName === '对方' ? '' : profileName)
    const ui = buildBaziHumanInputRequest(content, initialData, `继续分析：${intentText}`)
    return {
      content,
      ui,
      pending: {
        kind: 'create_profile',
        draftSlots: slots,
        field: ui.fields[0],
        resumeIntent: ui.resumeIntent || '补全八字人物后继续分析',
        sourceIntent: intentText,
        taskKind: 'bazi_profile',
      },
    }
  }

  if (shouldCollectClarifyingCards && (category === 'fortune' || category === 'event') && !slots.askedTime && !lifetimeWealth && !partnerArchetype) {
    const copy = timeCardCopy(slots, latestText, cardPlan)
    const field: AgentHumanInputField = {
      name: 'timeRangeChoice',
      label: '时间范围',
      inputType: 'choice',
      required: true,
      allowCustom: true,
      customPlaceholder: customTimePlaceholder(slots),
      options: timeOptionsForQuestion(slots, latestText, cardPlan),
    }
    const ui = requestForField('confirm_time', copy.title, copy.message, field, copy.submitLabel)
    return {
      content: copy.message,
      ui,
      pending: {
        kind: 'confirm_time',
        draftSlots: slots,
        field,
        resumeIntent: copy.message,
        sourceIntent: intentText,
      },
    }
  }

  if (shouldCollectClarifyingCards && slots.askedTime?.confidence === 'medium' && !lifetimeWealth && !partnerArchetype) {
    if (isDateChoiceQuestion(intentText)) {
      const copy = timeCardCopy(slots, latestText, cardPlan)
      const field: AgentHumanInputField = {
        name: 'timeRangeChoice',
        label: '时间范围',
        inputType: 'choice',
        required: true,
        allowCustom: true,
        customPlaceholder: customTimePlaceholder(slots),
        options: timeOptionsForQuestion(slots, latestText, cardPlan),
      }
      const ui = requestForField('confirm_time', copy.title, copy.message, field, copy.submitLabel)
      return {
        content: copy.message,
        ui,
        pending: {
          kind: 'confirm_time',
          draftSlots: slots,
          field,
          resumeIntent: copy.message,
          sourceIntent: intentText,
        },
      }
    }
    const cue = extractTimeCue(intentText)
    const fallbackContent = `我先把这里的「${cue}」理解成「${readableTimeLabel(slots.askedTime)}」。你看贴近你的意思吗？`
    const content = plannedText(cardPlan, ['short_trend', 'long_trend'], 'message', fallbackContent)
    const field: AgentHumanInputField = {
      name: 'timeRangeChoice',
      label: '时间范围',
      inputType: 'choice',
      required: true,
      allowCustom: true,
      customPlaceholder: customTimePlaceholder(slots),
      options: applyOptionHints(timeOptions(slots) || [], cardPlan),
    }
    const ui = requestForField(
      'confirm_time',
      plannedText(cardPlan, ['short_trend', 'long_trend'], 'title', '确认时间范围'),
      content,
      field,
      plannedText(cardPlan, ['short_trend', 'long_trend'], 'submitLabel', '选好啦，继续'),
    )
    return {
      content,
      ui,
      pending: {
        kind: 'confirm_time',
        draftSlots: slots,
        field,
        resumeIntent: content,
        sourceIntent: intentText,
      },
    }
  }

  if (shouldCollectReportCards && slots.matter?.analysisMode === 'analysis' && slots.matter.focus.length === 0 && category !== 'avatar' && !lifetimeWealth && !partnerArchetype) {
    const content = plannedText(cardPlan, ['focus'], 'message', '这次分析可以先抓一两个重点，会更清楚。你想让卜卜象优先看哪些话题？')
    const field: AgentHumanInputField = {
      name: 'focusChoice',
      label: '想看的话题',
      inputType: 'choice',
      required: true,
      multiple: true,
      allowCustom: true,
      customPlaceholder: '也可以写自己的重点',
      options: focusOptions(slots, cardPlan),
    }
    const ui = requestForField(
      'confirm_focus',
      plannedText(cardPlan, ['focus'], 'title', '确认分析重点'),
      content,
      field,
      plannedText(cardPlan, ['focus'], 'submitLabel', '选好啦，继续'),
    )
    return {
      content,
      ui,
      pending: {
        kind: 'confirm_focus',
        draftSlots: slots,
        field,
        resumeIntent: content,
        sourceIntent: intentText,
      },
    }
  }

  if (shouldCollectReportCards && slots.matter?.analysisMode === 'analysis' && !slots.outputDepth) {
    const content = plannedText(cardPlan, ['depth'], 'message', '最后选一下这次分析的展开程度。轻一点还是深一点，卜卜象按你选的来。')
    const field: AgentHumanInputField = {
      name: 'depthChoice',
      label: '报告长度',
      inputType: 'choice',
      required: true,
      options: depthOptions(slots, cardPlan),
    }
    const ui = requestForField(
      'select_depth',
      plannedText(cardPlan, ['depth'], 'title', '选择分析深度'),
      content,
      field,
      plannedText(cardPlan, ['depth'], 'submitLabel', '选好啦，继续'),
    )
    return {
      content,
      ui,
      pending: {
        kind: 'select_depth',
        draftSlots: slots,
        field,
        resumeIntent: content,
        sourceIntent: intentText,
      },
    }
  }

  return null
}

function extractSingleFieldAnswer(latestText: string, field?: AgentHumanInputField): string {
  if (!field) return ''
  const fieldLine = latestText
    .split('\n')
    .map(line => line.trim())
    .find(line => line.startsWith(`${field.label}：`) || line.startsWith(`${field.label}:`))
  if (!fieldLine) return ''
  return fieldLine.replace(new RegExp(`^${field.label}[：:]`), '').trim()
}

export function applyPendingAnswer(
  pending: PendingAgentStep | null | undefined,
  latestText: string,
  correction?: AgentWorkflowCorrection | null,
): AgentAnalysisSlots | null {
  if (!pending?.draftSlots) return null
  const slots = cloneSlots(pending.draftSlots)
  const field = pending.field
  const options = pending.field?.options || []

  const correctedSlots = applyWorkflowCorrection(slots, latestText, correction)
  if (correctedSlots) return correctedSlots

  if (pending.kind === 'create_profile') {
    const createdName = extractCreatedProfileName(latestText)
    if (createdName) {
      const originalName = slots.unresolvedNames?.[0]
      const mentionedNames = slots.mentionedNames || []
      slots.mentionedNames = mentionedNames.length > 0
        ? mentionedNames.map(name => name === originalName ? createdName : name)
        : [createdName]
      if (!slots.mentionedNames.includes(createdName)) {
        slots.mentionedNames.push(createdName)
      }
      slots.unresolvedNames = (slots.unresolvedNames || []).filter(name => name !== originalName && name !== createdName)
      if (originalName && originalName !== createdName) {
        slots.supplements = [
          ...slots.supplements,
          `用户将系统识别的人物「${originalName}」修正并保存为「${createdName}」，后续以「${createdName}」这份命盘承接该人物。`,
        ]
      }
    }
  }

  const pendingDraftSlots = pending.params?.draftSlots as AgentAnalysisSlots | undefined
  if (pendingDraftSlots) return pendingDraftSlots

  const selectedOptions = options.filter(option => {
    const label = String(option.label || '')
    const value = String(option.value || '')
    return (label && latestText.includes(label)) || (value && latestText.includes(value))
  })

  if (pending.kind === 'confirm_focus' && field?.multiple) {
    const optionLabels = new Map(options.map(option => [String(option.value), String(option.label)]))
    const fieldLine = latestText
      .split('\n')
      .map(line => line.trim())
      .find(line => line.startsWith(`${field.label}：`) || line.startsWith(`${field.label}:`))
    const fieldValues = fieldLine
      ? fieldLine
          .replace(new RegExp(`^${field.label}[：:]`), '')
          .split(/[、,，;；]/)
          .map(item => item.trim())
          .filter(Boolean)
      : []
    const focus = Array.from(new Set([
      ...selectedOptions.map(option => String(option.label)),
      ...fieldValues.map(item => optionLabels.get(item) || item),
    ].filter(Boolean)))
    if (focus.length > 0 && slots.matter) {
      slots.matter.focus = focus
      slots.matter.confidence = 'high'
      slots.confidence.matter = 'high'
      return slots
    }
  }

  const selected = options.find(option => {
    const label = String(option.label || '')
    const value = String(option.value || '')
    return (label && latestText.includes(label)) || (value && latestText.includes(value))
  })
  const draftSlots = selected?.params?.draftSlots as AgentAnalysisSlots | undefined
  if (draftSlots) return draftSlots

  if (pending.kind === 'confirm_time') {
    const custom = extractSingleFieldAnswer(latestText, field)
    if (custom) {
      const parsed = parseAskedTime(custom, undefined, slots.matter?.category)
      return withCustomTime(slots, parsed || fallbackTimeForCustomAnswer(slots, custom), custom)
    }
  }

  if (pending.kind === 'confirm_focus') {
    const custom = latestText
      .split('\n')
      .map(line => line.replace(/^.*?：/, '').trim())
      .find(Boolean)
    if (custom && slots.matter) {
      slots.matter.focus = [custom]
      slots.matter.confidence = 'high'
      slots.confidence.matter = 'high'
    }
  }
  return slots
}
