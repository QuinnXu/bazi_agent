import {
  getCurrentDateString,
  type ChatFeatureContext,
  type ChatParticipant,
} from '@/lib/chat-service'
import {
  runFeatureAnalysisStream,
  validateFeatureParams,
  type FeatureKind,
  type Participant,
} from '@/lib/feature-service'
import { callLLMTextWithUsage, type LlmTaskKind } from '@/lib/llm'
import { recordLlmUsage } from '@/lib/token-usage'
import {
  getAgentReportPreferenceLabel,
  getAgentComplexityProfile,
  normalizeAgentReportPreference,
  normalizeAgentComplexityMode,
  type AgentComplexityMode,
  type AgentReportPreference,
} from '@/lib/agent-complexity'
import {
  sanitizeReplacementChars,
  takeSemanticStreamChunk,
} from '@/lib/text-sanitize'

const AGENT_STREAM_DELAY_MS = 30
const AGENT_STREAM_MIN_CHARS = 8
const AGENT_STREAM_MAX_CHARS = 90

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AgentChatInput {
  userId: string
  messages: AgentMessage[]
  baziAnalysisResult?: string | null
  selectedProfile?: Participant | null
  participants?: ChatParticipant[]
  timeRanges?: AgentTimeRangeContext[]
  reportPreference?: AgentReportPreference | null
  featureContext?: ChatFeatureContext
  complexity?: AgentComplexityMode
  maxSteps?: number
  timeoutMs?: number
  signal?: AbortSignal
}

export interface AgentTimeRangeContext {
  label: string
  start: string
  end: string
}

export interface AgentTraceEvent {
  step: number
  action: string
  ok: boolean
  detail?: string
  elapsedMs: number
}

export interface AgentProgressEvent {
  step: number
  phase: 'planner' | 'tool' | 'final' | 'fallback'
  status: 'running' | 'completed' | 'failed'
  title: string
  detail?: string
  elapsedMs: number
}

export interface AgentBaziFormData {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  isSolar: boolean
  isFemale: boolean
  longitude: string
  latitude: string
}

export interface AgentBaziFormUiEvent {
  type: 'bazi_profile_form'
  message: string
  initialData: AgentBaziFormData
}

export type AgentHumanInputKind =
  | 'bazi_profile'
  | 'profile_required'
  | 'feature_params'

export type AgentHumanInputFieldType =
  | 'text'
  | 'number'
  | 'select'
  | 'choice'
  | 'boolean'
  | 'date'
  | 'time'

export interface AgentHumanInputField {
  name: string
  label: string
  inputType: AgentHumanInputFieldType
  required?: boolean
  value?: string | boolean | number | null
  placeholder?: string
  options?: Array<{ label: string; value: string | boolean | number }>
  multiple?: boolean
  allowCustom?: boolean
  customPlaceholder?: string
}

export interface AgentHumanInputRequestUiEvent {
  type: 'human_input_request'
  requestId: string
  kind: AgentHumanInputKind
  title: string
  message: string
  fields: AgentHumanInputField[]
  submitLabel?: string
  resumeIntent?: string
}

export type AgentStreamEvent =
  | { type: 'progress'; progress: AgentProgressEvent }
  | { type: 'trace'; trace: AgentTraceEvent }
  | { type: 'ui'; ui: AgentBaziFormUiEvent | AgentHumanInputRequestUiEvent }
  | { type: 'delta'; content: string }
  | { type: 'done'; trace: AgentTraceEvent[] }
  | { type: 'error'; message: string }

export interface AgentChatResult {
  stream: ReadableStream
  trace: AgentTraceEvent[]
}

export interface AgentRuntimeDeps {
  planner?: (messages: any[], signal: AbortSignal) => Promise<string>
  runFeature?: (
    input: {
      userId: string
      kind: FeatureKind
      params: any
      complexity?: AgentComplexityMode
      reportPreference?: AgentReportPreference | null
    },
    opts: { signal?: AbortSignal },
  ) => Promise<string>
  runFeatureStream?: (
    input: {
      userId: string
      kind: FeatureKind
      params: any
      complexity?: AgentComplexityMode
      reportPreference?: AgentReportPreference | null
    },
    opts: { signal?: AbortSignal },
  ) => Promise<ReadableStream>
}

type AgentAction =
  | { action: 'answer'; content: string }
  | { action: 'ask'; content: string; missing?: string[] }
  | { action: 'request_human_input'; content: string; request?: Partial<AgentHumanInputRequestUiEvent> }
  | { action: 'open_bazi_form'; content: string; initialData?: Partial<AgentBaziFormData> }
  | {
      action: 'tool_call'
      tool: 'feature_analyze'
      kind: FeatureKind
      params: any
      reason?: string
    }

interface ToolObservation {
  tool: 'feature_analyze'
  kind: FeatureKind
  ok: boolean
  content: string
}

const HARD_MAX_STEPS = 5
const DEFAULT_TIMEOUT_MS = 285_000
const MAX_MESSAGE_CHARS = 1600
const MAX_CONTEXT_CHARS = 12_000
const MAX_TOOL_RESULT_CHARS = 7_000
const SELF_PROFILE_NAMES = new Set(['我', '本人', '自己', '当前命主', '用户', '命主'])
const DEFAULT_BAZI_FORM_DATA: AgentBaziFormData = {
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

function truncateText(text: string | null | undefined, max: number): string {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}\n...（已压缩截断）` : text
}

function isAbortError(err: unknown): boolean {
  return !!(
    err &&
    typeof err === 'object' &&
    ('name' in err && String((err as any).name) === 'AbortError')
  )
}

function normalizeMessages(messages: AgentMessage[]): AgentMessage[] {
  const safe = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'system'))
    .map(m => ({
      role: m.role,
      content: truncateText(String(m.content || ''), MAX_MESSAGE_CHARS),
    }))

  const recent = safe.slice(-10)
  const older = safe.slice(0, -10)
  if (older.length === 0) return recent

  const summary = older
    .map(m => `${m.role}: ${truncateText(m.content, 220)}`)
    .join('\n')

  return [
    {
      role: 'system',
      content: `【更早上下文摘要】\n${truncateText(summary, 2400)}`,
    },
    ...recent,
  ]
}

function profileBlock(selectedProfile?: Participant | null): string {
  if (!selectedProfile) return '（未选择当前命主）'
  const pillars = selectedProfile.pillars ? `\n四柱：${selectedProfile.pillars}` : ''
  const bazi = selectedProfile.baziText
    ? `\n命盘信息：\n${truncateText(selectedProfile.baziText, 1800)}`
    : ''
  return `姓名：${selectedProfile.name || '当前命主'}${pillars}${bazi}`
}

function participantContextBlock(participants?: ChatParticipant[]): string {
  if (!participants || participants.length === 0) return '（未添加其他人物）'
  return participants
    .map((participant, index) => {
      const pillars = participant.pillars ? `\n四柱：${participant.pillars}` : ''
      const bazi = participant.baziText
        ? `\n命盘信息：\n${truncateText(participant.baziText, 1400)}`
        : ''
      return `### 人物 ${index + 1}：${participant.name || '未命名'}${pillars}${bazi}`
    })
    .join('\n\n')
}

function timeRangeContextBlock(timeRanges?: AgentTimeRangeContext[]): string {
  if (!timeRanges || timeRanges.length === 0) return '（未添加时间段）'
  return timeRanges
    .filter(range => range.start && range.end)
    .map((range, index) =>
      `### 时间段 ${index + 1}：${range.label || `${range.start} ~ ${range.end}`}\nstart：${range.start}\nend：${range.end}`,
    )
    .join('\n\n') || '（未添加时间段）'
}

function inferReportPreferenceFromText(text: string): AgentReportPreference | null {
  const compact = text.replace(/\s+/g, '')
  if (/简洁|简单|短一点|短些|一句话|结论先行|只要重点|快速说|概括/.test(compact)) {
    return { mode: 'concise' }
  }
  if (/详细|深度|展开|完整|长报告|细一点|多讲|逐项|全面/.test(compact)) {
    return { mode: 'detailed' }
  }
  if (/均衡|适中|正常|标准|中等/.test(compact)) {
    return { mode: 'balanced' }
  }
  return null
}

function resolveReportPreference(input: AgentChatInput): AgentReportPreference | null {
  return (
    normalizeAgentReportPreference(input.reportPreference) ||
    inferReportPreferenceFromText(recentUserText(input))
  )
}

function hasBaziInfo(profile?: Participant | ChatParticipant | null): boolean {
  return !!(
    profile?.baziText?.trim() ||
    profile?.pillars?.trim()
  )
}

function resolveCurrentProfile(input: AgentChatInput): Participant | null {
  const selected = input.selectedProfile || null
  const baziText = selected?.baziText || input.baziAnalysisResult || null
  const pillars = selected?.pillars || null

  if (!baziText && !pillars) return null
  return {
    name: selected?.name || '当前命主',
    pillars,
    baziText,
  }
}

function contextProfiles(input: AgentChatInput): Participant[] {
  const current = resolveCurrentProfile(input)
  const all = [
    ...(current ? [current] : []),
    ...(input.participants || []),
  ]
  const seen = new Set<string>()
  const profiles: Participant[] = []
  for (const profile of all) {
    if (!profile?.name?.trim()) continue
    const key = profile.name.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    profiles.push({
      name: profile.name,
      pillars: profile.pillars,
      baziText: profile.baziText,
    })
  }
  return profiles
}

function latestUserText(input: AgentChatInput): string {
  return [...input.messages].reverse().find(m => m.role === 'user')?.content || ''
}

function fastLocalAnswer(input: AgentChatInput): string | null {
  const latest = latestUserText(input).trim()
  if (!latest) return null

  const compact = latest.replace(/[\s。！？!?,，～~.]/g, '').toLowerCase()
  if (/^(你好|您好|嗨|hi|hello|在吗|早上好|下午好|晚上好)$/.test(compact)) {
    return '你好呀～我是卜卜象。你可以直接告诉我想看的问题，比如近期运势、合盘、人生脉络，或者先选择/创建一个八字人物。'
  }
  if (/^(谢谢|感谢|多谢|thx|thanks)$/.test(compact)) {
    return '不客气呀～需要继续看某个月份、某段关系或某个选择时，直接告诉我就好。'
  }
  return null
}

function recentUserText(input: AgentChatInput): string {
  return input.messages
    .filter(m => m.role === 'user')
    .slice(-4)
    .map(m => m.content)
    .join('\n')
}

function pad2(value: string): string {
  const n = Number(value)
  return Number.isFinite(n) ? String(n).padStart(2, '0') : value
}

function buildBaziFormDataFromText(text: string): AgentBaziFormData {
  const data: AgentBaziFormData = { ...DEFAULT_BAZI_FORM_DATA }
  const dateMatch = text.match(/((?:19|20)\d{2})\s*(?:年|[./-])\s*(\d{1,2})\s*(?:月|[./-])\s*(\d{1,2})\s*日?/)
  if (dateMatch) {
    data.year = dateMatch[1]
    data.month = String(Number(dateMatch[2]))
    data.day = String(Number(dateMatch[3]))
  }

  const timeSource = dateMatch && dateMatch.index !== undefined
    ? text.slice(dateMatch.index + dateMatch[0].length)
    : text
  const timeMatch = timeSource.match(/(?:^|[^\d])([01]?\d|2[0-3])\s*(?:[:：点时])\s*([0-5]?\d)?/)
  if (timeMatch) {
    data.hour = pad2(timeMatch[1])
    data.minute = timeMatch[2] !== undefined ? pad2(timeMatch[2]) : ''
  }

  if (/农历|阴历/.test(text)) data.isSolar = false
  if (/公历|阳历|太阳历/.test(text)) data.isSolar = true
  if (/女命|女性|女生|女士|\b女\b/.test(text)) data.isFemale = true
  if (/男命|男性|男生|先生|\b男\b/.test(text)) data.isFemale = false

  return data
}

function normalizeBaziInitialData(
  raw: Partial<AgentBaziFormData> | undefined,
  fallbackText: string,
): AgentBaziFormData {
  const inferred = buildBaziFormDataFromText(fallbackText)
  return {
    ...inferred,
    ...Object.fromEntries(
      Object.entries(raw || {}).filter(([, value]) => value !== undefined && value !== null),
    ),
  } as AgentBaziFormData
}

function newRequestId(kind: AgentHumanInputKind): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function baziDataToFields(data: AgentBaziFormData): AgentHumanInputField[] {
  return [
    { name: 'profileName', label: '人物名称', inputType: 'text', required: true, value: '', placeholder: '例如：小明、伴侣，或你的昵称' },
    { name: 'year', label: '出生年份', inputType: 'number', required: true, value: data.year, placeholder: '1994' },
    { name: 'month', label: '出生月份', inputType: 'number', required: true, value: data.month, placeholder: '9' },
    { name: 'day', label: '出生日期', inputType: 'number', required: true, value: data.day, placeholder: '23' },
    { name: 'hour', label: '出生小时', inputType: 'number', required: true, value: data.hour, placeholder: '15' },
    { name: 'minute', label: '出生分钟', inputType: 'number', required: false, value: data.minute || '0', placeholder: '20' },
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
    { name: 'longitude', label: '出生地经度', inputType: 'number', required: true, value: data.longitude, placeholder: '121.5' },
    { name: 'latitude', label: '出生地纬度', inputType: 'number', required: true, value: data.latitude, placeholder: '31.2' },
  ]
}

function buildBaziHumanInputRequest(
  message: string,
  initialData: AgentBaziFormData,
  resumeIntent?: string,
): AgentHumanInputRequestUiEvent {
  return {
    type: 'human_input_request',
    requestId: newRequestId('bazi_profile'),
    kind: 'bazi_profile',
    title: '补全八字人物资料',
    message,
    fields: baziDataToFields(initialData),
    submitLabel: '生成 Bazi Analysis Results 并继续',
    resumeIntent,
  }
}

function buildFeatureParamsInputRequest(
  kind: FeatureKind,
  missing: string[],
  reason?: string,
): AgentHumanInputRequestUiEvent {
  const fieldForMissing = (item: string, index: number): AgentHumanInputField => {
    if (item === 'focus') {
      return {
        name: 'focus',
        label: '关注方向',
        inputType: 'choice',
        required: true,
        multiple: true,
        allowCustom: true,
        customPlaceholder: '回车添加其他关注方向',
        options: [
          { label: '事业', value: '事业' },
          { label: '感情', value: '感情' },
          { label: '财富', value: '财富' },
          { label: '健康', value: '健康' },
          { label: '整体', value: '整体' },
        ],
      }
    }
    if (item === 'granularity') {
      return {
        name: 'granularity',
        label: '报告颗粒度',
        inputType: 'choice',
        required: true,
        value: 'month',
        options: [
          { label: '逐日', value: 'day' },
          { label: '逐月', value: 'month' },
        ],
      }
    }
    if (item === 'subtype') {
      return {
        name: 'subtype',
        label: '合盘类型',
        inputType: 'choice',
        required: true,
        value: 'pair',
        options: [
          { label: '双人合盘', value: 'pair' },
          { label: '多人合盘', value: 'multi' },
          { label: '应事分析', value: 'event' },
        ],
      }
    }
    if (item === 'start' || item === 'end') {
      return {
        name: item,
        label: item === 'start' ? '开始日期' : '结束日期',
        inputType: 'date',
        required: true,
      }
    }
    return {
      name: `missing_${index + 1}`,
      label: item,
      inputType: 'text',
      required: true,
      placeholder: '请补充这项信息',
    }
  }

  return {
    type: 'human_input_request',
    requestId: newRequestId('feature_params'),
    kind: 'feature_params',
    title: `${describeTool(kind)} 还需要补充信息`,
    message: reason || `继续调用「${describeTool(kind)}」前，还缺少：${missing.join('、')}。`,
    fields: missing.map(fieldForMissing),
    submitLabel: '提交并继续',
    resumeIntent: `补全 ${kind} 工具参数`,
  }
}

function buildFortuneScopeInputRequest(missing: string[]): AgentHumanInputRequestUiEvent {
  const fields: AgentHumanInputField[] = []

  if (missing.includes('timeRangePreset')) {
    fields.push(
      {
        name: 'timeRangePreset',
        label: '时间范围',
        inputType: 'choice',
        required: true,
        value: 'future_30d',
        options: [
          { label: '未来 30 天', value: 'future_30d' },
          { label: '未来 3 个月', value: 'future_3m' },
          { label: '今年剩余时间', value: 'rest_of_year' },
          { label: '自定义日期', value: 'custom' },
        ],
      },
      {
        name: 'customStart',
        label: '自定义开始日期',
        inputType: 'date',
        required: false,
      },
      {
        name: 'customEnd',
        label: '自定义结束日期',
        inputType: 'date',
        required: false,
      },
    )
  }

  if (missing.includes('focus')) {
    fields.push({
      name: 'focus',
      label: '关注方向',
      inputType: 'choice',
      required: true,
      multiple: true,
      allowCustom: true,
      customPlaceholder: '回车添加其他关注方向',
      options: [
        { label: '事业', value: '事业' },
        { label: '财富', value: '财富' },
        { label: '感情', value: '感情' },
        { label: '健康', value: '健康' },
        { label: '整体', value: '整体' },
      ],
    })
  }

  fields.push({
    name: 'specificQuestion',
    label: '具体想问',
    inputType: 'text',
    required: false,
    placeholder: '比如：适不适合跳槽、感情推进、财务节奏',
  })

  return {
    type: 'human_input_request',
    requestId: newRequestId('feature_params'),
    kind: 'feature_params',
    title: '先框定问题范围',
    message: '这个问题有点宽，我先帮你把时间和关注方向框定一下，再继续调用结构化分析。',
    fields,
    submitLabel: '继续分析',
    resumeIntent: '继续生成近期运势报告',
  }
}

function buildReportPreferenceInputRequest(kind: FeatureKind): AgentHumanInputRequestUiEvent {
  return {
    type: 'human_input_request',
    requestId: newRequestId('feature_params'),
    kind: 'feature_params',
    title: '选择报告风格',
    message: `生成「${describeTool(kind)}」报告前，想用哪种风格？你也可以写自己的要求。`,
    fields: [
      {
        name: 'reportStyle',
        label: '报告风格',
        inputType: 'choice',
        required: true,
        value: 'balanced',
        allowCustom: true,
        customPlaceholder: '例如：像咨询师一样直接，重点讲年份和行动建议',
        options: [
          { label: '简洁结论型', value: 'concise' },
          { label: '均衡报告型', value: 'balanced' },
          { label: '深度展开型', value: 'detailed' },
        ],
      },
    ],
    submitLabel: '继续生成报告',
    resumeIntent: `继续生成 ${describeTool(kind)} 报告`,
  }
}

function normalizeHumanInputRequest(
  partial: Partial<AgentHumanInputRequestUiEvent> | undefined,
  fallbackMessage: string,
  input: AgentChatInput,
): AgentHumanInputRequestUiEvent {
  if (partial?.kind === 'feature_params' && partial.fields?.length) {
    return {
      type: 'human_input_request',
      requestId: partial.requestId || newRequestId('feature_params'),
      kind: 'feature_params',
      title: partial.title || '请补充信息',
      message: partial.message || fallbackMessage,
      fields: partial.fields,
      submitLabel: partial.submitLabel || '提交并继续',
      resumeIntent: partial.resumeIntent,
    }
  }
  return buildBaziHumanInputRequest(
    partial?.message || fallbackMessage,
    buildBaziFormDataFromText(recentUserText(input)),
    partial?.resumeIntent,
  )
}

function shouldOpenBaziForm(input: AgentChatInput): { content: string; initialData: AgentBaziFormData } | null {
  if (resolveCurrentProfile(input)) return null

  const latest = latestUserText(input)
  const recent = recentUserText(input)
  const combined = `${recent}\n${latest}`
  const hasBirthDate = /(?:19|20)\d{2}\s*(?:年|[./-])\s*\d{1,2}\s*(?:月|[./-])\s*\d{1,2}/.test(combined)
  const hasBirthMeta = /公历|阳历|农历|阴历|男命|女命|男性|女性|男生|女生|\d{1,2}\s*[:：点时]/.test(combined)
  const createIntent = /(创建|新建|新增|添加|录入|保存|建立).{0,10}(八字|人物|命主|档案|profile)|八字人物|命主档案|排盘/.test(combined)
  const assistantAskedBirth = input.messages.slice(-6).some(m =>
    m.role === 'assistant' && /出生|公历|阳历|农历|阴历|性别|八字信息|人物档案|命主档案|排盘/.test(m.content),
  )

  if (!createIntent && !(hasBirthDate && (hasBirthMeta || assistantAskedBirth))) {
    return null
  }

  const initialData = buildBaziFormDataFromText(combined)
  const content = hasBirthDate
    ? '我先帮你打开八字人物表单，请确认出生信息、历法、性别和地点。确认后会通过 Bazi Analysis Results 生成命盘，再用于后续分析。'
    : '我先帮你打开八字人物表单。创建人物需要通过 Bazi Analysis Results 生成命盘，不能只靠对话里猜四柱。'

  return { content, initialData }
}

function hasExplicitFortuneTime(text: string, input: AgentChatInput): boolean {
  if (input.timeRanges?.some(range => range.start && range.end)) return true
  if (/(?:19|20)\d{2}\s*(?:年|[./-])\s*\d{1,2}(?:\s*(?:月|[./-])\s*\d{1,2}\s*日?)?/.test(text)) return true
  if (/本月|这个月|下个月|今年|本年|流年|未来一年|接下来一年|未来几年|接下来几年|未来数年|往后几年/.test(text)) return true
  if (/(未来|接下来|往后)\s*([0-9一二两三四五六七八九十]{1,3})\s*(天|日|周|个月|月|年)/.test(text)) return true
  if (/半年|一季度|一个季度|本季度|下季度/.test(text)) return true
  return false
}

function hasSpecificFocus(text: string): boolean {
  if (inferFocus(text).some(item => item !== '整体')) return true
  return /整体|总体|综合|全部|全方位|大概|主线|趋势/.test(text)
}

function shouldAskFortuneScope(input: AgentChatInput): { content: string; request: AgentHumanInputRequestUiEvent } | null {
  if (!resolveCurrentProfile(input)) return null

  const latest = latestUserText(input)
  const recent = recentUserText(input)
  const combined = `${recent}\n${latest}`
  const asksFortune =
    /(运势|流年|财运|事业运|感情运|桃花|工作运|健康运|这段时间|最近|近期|接下来|未来|会.*(怎么样|如何)|怎么样|如何|适合做什么|有什么变化)/.test(latest)
  const wantsStructured =
    /(报告|分析|推演|看看|看一下|看下|测|算|预测|建议)/.test(latest) ||
    /这段时间|最近|近期|接下来|未来|会.*(怎么样|如何)|怎么样|如何|适合做什么/.test(latest)

  if (!asksFortune || !wantsStructured) return null

  const missing: string[] = []
  if (!hasExplicitFortuneTime(combined, input)) missing.push('timeRangePreset')
  if (!hasSpecificFocus(combined)) missing.push('focus')
  if (missing.length === 0) return null

  return {
    content: '可以看，但这个问题范围比较大。先选一下时间范围和关注方向，我再继续给你做结构化分析。',
    request: buildFortuneScopeInputRequest(missing),
  }
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function toDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function endOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0)
}

function coerceDateLike(value: unknown, boundary: 'start' | 'end'): string | null {
  if (typeof value !== 'string') return null
  const normalized = value
    .trim()
    .replace(/[./]/g, '-')
    .replace(/年/g, '-')
    .replace(/月/g, '')
    .replace(/日/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const dayMatch = normalized.match(/^((?:19|20)\d{2})-(\d{1,2})-(\d{1,2})$/)
  if (dayMatch) {
    const year = Number(dayMatch[1])
    const month = Number(dayMatch[2])
    const day = Number(dayMatch[3])
    const date = new Date(year, month - 1, day)
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return toDateString(date)
    }
    return null
  }

  const monthMatch = normalized.match(/^((?:19|20)\d{2})-(\d{1,2})$/)
  if (monthMatch) {
    const year = Number(monthMatch[1])
    const month = Number(monthMatch[2])
    if (month < 1 || month > 12) return null
    const date = boundary === 'start'
      ? new Date(year, month - 1, 1)
      : endOfMonth(year, month)
    return toDateString(date)
  }

  const yearMatch = normalized.match(/^((?:19|20)\d{2})$/)
  if (yearMatch) {
    const year = Number(yearMatch[1])
    return boundary === 'start' ? `${year}-01-01` : `${year}-12-31`
  }

  return null
}

function chineseNumberToInt(text: string): number | null {
  const digits: Record<string, number> = {
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
    十: 10,
  }
  if (/^\d+$/.test(text)) return Number(text)
  if (digits[text] !== undefined) return digits[text]
  if (text.length === 2 && text[0] === '十' && digits[text[1]] !== undefined) return 10 + digits[text[1]]
  if (text.length === 2 && text[1] === '十' && digits[text[0]] !== undefined) return digits[text[0]] * 10
  if (text.length === 3 && text[1] === '十' && digits[text[0]] !== undefined && digits[text[2]] !== undefined) {
    return digits[text[0]] * 10 + digits[text[2]]
  }
  return null
}

function inferFutureYearCount(text: string): number | null {
  const explicit = text.match(/(?:未来|接下来|往后)\s*([0-9一二两三四五六七八九十]{1,3})\s*年/)
  if (explicit) return chineseNumberToInt(explicit[1])
  if (/未来几年|接下来几年|未来数年|往后几年/.test(text)) return 5
  return null
}

function inferFocus(text: string): string[] {
  const focus: string[] = []
  if (/事业|工作|职业|项目|职场|创业/.test(text)) focus.push('事业')
  if (/财|钱|收入|投资|副业|生意/.test(text)) focus.push('财富')
  if (/感情|恋爱|婚姻|桃花|关系/.test(text)) focus.push('感情')
  if (/健康|身体|睡眠|压力/.test(text)) focus.push('健康')
  return focus.length > 0 ? focus : ['整体']
}

function userProvidedBaziText(text: string): boolean {
  return /Bazi Analysis Results|四柱|八字|乾造|坤造|命盘信息|年柱|月柱|日柱|时柱/.test(text)
}

function cloneParams(params: any): any {
  if (!params || typeof params !== 'object') return params
  try {
    return JSON.parse(JSON.stringify(params))
  } catch {
    return { ...params }
  }
}

function normalizeProfileForTool(profile: any, input: AgentChatInput): Participant | any {
  const current = resolveCurrentProfile(input)
  const name = typeof profile?.name === 'string' && profile.name.trim()
    ? profile.name.trim()
    : current?.name || '当前命主'
  const isSelf = SELF_PROFILE_NAMES.has(name)
  const matchedContext = contextProfiles(input).find(participant =>
    participant.name.trim() === name ||
    name.includes(participant.name.trim()) ||
    participant.name.trim().includes(name),
  )

  if (current && (isSelf || name === current.name || (!profile?.name && !hasBaziInfo(profile)))) {
    return { ...current, name: isSelf ? current.name : name }
  }

  if (matchedContext && (!hasBaziInfo(profile) || name === matchedContext.name)) {
    return { ...matchedContext, name: matchedContext.name }
  }

  if (hasBaziInfo(profile)) {
    const recent = recentUserText(input)
    if (userProvidedBaziText(recent)) return profile
  }

  return { name }
}

function normalizeFortuneTime(params: any, input: AgentChatInput) {
  const text = recentUserText(input)
  const today = new Date()
  const todayString = toDateString(today)
  const hasExplicitDate = /(?:19|20)\d{2}-\d{1,2}-\d{1,2}|(?:19|20)\d{2}年\d{1,2}月\d{1,2}日/.test(text)
  const futureYearCount = inferFutureYearCount(text)
  const selectedTimeRange = input.timeRanges?.find(range => range.start && range.end)

  const normalizedStart = coerceDateLike(params.start, 'start')
  if (normalizedStart) params.start = normalizedStart
  const normalizedEnd = coerceDateLike(params.end, 'end')
  if (normalizedEnd) params.end = normalizedEnd

  if (selectedTimeRange && (!params.start || !params.end)) {
    params.start = params.start || selectedTimeRange.start
    params.end = params.end || selectedTimeRange.end
  }

  if (!Array.isArray(params.focus) || params.focus.length === 0) {
    params.focus = inferFocus(text)
  }
  if (!['day', 'month'].includes(params.granularity)) {
    params.granularity = /今年|本年|流年|未来一年|一年|未来几年|接下来几年|未来数年|往后几年/.test(text) ? 'month' : 'day'
  }

  if (futureYearCount) {
    params.start = todayString
    const years = Math.min(Math.max(futureYearCount, 1), 10)
    const endYear = today.getFullYear() + years - 1
    params.end = params.end || `${endYear}-12-31`
    const endDate = coerceDateLike(params.end, 'end')
    if (endDate) params.end = endDate
    params.granularity = 'month'
    return
  }

  if (/本月|这个月/.test(text)) {
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    params.start = params.start || todayString
    params.end = params.end || toDateString(end)
    return
  }

  if (/下个月/.test(text)) {
    const start = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    const end = new Date(today.getFullYear(), today.getMonth() + 2, 0)
    params.start = params.start || toDateString(start)
    params.end = params.end || toDateString(end)
    return
  }

  if (/今年|本年|流年|未来一年|一年/.test(text)) {
    params.start = params.start || todayString
    params.end = params.end || toDateString(addDays(today, 365))
    params.granularity = 'month'
    return
  }

  if (/最近|近期|这段时间|接下来|未来|现在/.test(text)) {
    if (!hasExplicitDate || !params.start) params.start = todayString
    if (!params.end) params.end = toDateString(addDays(today, 30))
  }

  const finalStart = coerceDateLike(params.start, 'start')
  if (finalStart) params.start = finalStart
  const finalEnd = coerceDateLike(params.end, 'end')
  if (finalEnd) params.end = finalEnd
}

function normalizeToolAction(
  input: AgentChatInput,
  action: Extract<AgentAction, { action: 'tool_call' }>,
): Extract<AgentAction, { action: 'tool_call' }> {
  const params = cloneParams(action.params) || {}

  if (action.kind === 'fortune') {
    params.profile = normalizeProfileForTool(params.profile, input)
    normalizeFortuneTime(params, input)
  } else if (action.kind === 'lifepath') {
    params.profile = normalizeProfileForTool(params.profile, input)
  } else if (action.kind === 'avatar') {
    if (params.combineBazi) params.profile = normalizeProfileForTool(params.profile, input)
  } else if (action.kind === 'hepan' && Array.isArray(params.participants)) {
    params.participants = params.participants.map((participant: any) =>
      normalizeProfileForTool(participant, input),
    )
  }

  return { ...action, params }
}

function buildAgentSystemPrompt(input: AgentChatInput): string {
  const currentProfile = resolveCurrentProfile(input)
  const complexity = getAgentComplexityProfile(input.complexity)

  const reportPreference = resolveReportPreference(input)

  return `你是卜卜象的 Agent 编排器，负责直接回复、参数整理、工具调用和 human-in-the-loop 输入收集。你可以像经典对话一样回答轻量问题；只有用户明确需要结构化报告或必须使用工具时，才调用工具。

你必须只输出一个 JSON 对象，不要输出 markdown，不要输出解释性前后缀。

可选动作：
1. {"action":"answer","content":"给用户的最终回答"}
2. {"action":"ask","content":"向用户追问缺失信息的一句话","missing":["缺失项"]}
3. {"action":"tool_call","tool":"feature_analyze","kind":"fortune|hepan|lifepath|avatar","params":{...},"reason":"为什么需要调用工具"}
4. {"action":"request_human_input","content":"提示用户补充信息的一句话","request":{"kind":"bazi_profile|profile_required|feature_params","title":"标题","message":"说明","fields":[{"name":"focus","label":"关注方向","inputType":"choice","required":true,"multiple":true,"allowCustom":true,"options":[{"label":"事业","value":"事业"}]}]}}

工具 feature_analyze 是现有 4 个结构化功能，不允许编造工具名：
- fortune params: {"profile":{"name":"...","pillars":"...","baziText":"..."},"start":"YYYY-MM-DD","end":"YYYY-MM-DD","granularity":"day|month","focus":["事业","感情","财富","健康","整体"]}
- hepan params: {"subtype":"pair|multi|event","relationLabel":"...","eventDesc":"...","participants":[{"name":"...","pillars":"...","baziText":"..."}]}
- lifepath params: {"profile":{"name":"...","pillars":"...","baziText":"..."}}
- avatar params: {"imageDataUrl":"data:image/...;base64,...","combineBazi":true|false,"profile":{...}}

决策规则：
- 默认优先判断是否可以直接 answer。闲聊、概念解释、轻量建议、非结构化追问、简单命理常识、用户只是想聊想法时，都可以直接回复。
- answer 可以结合已验证命主上下文给轻量建议，但不得编造八字、四柱、流年细表、图片观察或完整结构化报告。
- 只有用户明确要“报告/分析/推演/近期运势/合盘/人生脉络/头像分析/看某段时间/多人物关系”等结构化输出，或必须依赖图片/已验证命盘/工具能力时，才输出 tool_call。
- 如果用户想做结构化分析且参数足够，输出 tool_call。工具负责写业务报告。
- 所有创建/录入/新增八字人物、命主档案、排盘信息的对话，必须 request_human_input，让前端在 chat message 中 step-by-step 收集信息，并通过 /api/bazi 生成 Bazi Analysis Results 后再继续。
- tool_call 的 profile/participants 必须来自当前命主、已选人物、参与者上下文或用户明确粘贴的 Bazi Analysis Results/四柱文本；不得根据出生日期自行推算或编造 pillars/baziText。
- 如果缺少命主、Bazi Analysis Results、合盘对象、时间范围、关注方向、头像图片等关键参数，必须 request_human_input；一次只收集最关键的一组信息，可以使用 choice 字段让用户选择，也可以 allowCustom。
- 用户问“这段时间/最近/未来会怎么样”等泛问题时，先让用户框定时间范围和关注方向；不要直接把“最近”默认为固定范围后调用工具。
- 用户可能已在输入框添加多个人物和多个时间段。人物必须优先从【已选人物上下文】匹配；时间范围必须优先从【已选时间段】匹配。若用户选择了多个时间段但工具只能接受一个 start/end，请选择最符合当前问题的时间段；如果用户明确要求多时间段比较，先说明将围绕这些时间段做比较，并在参数、问题描述或追问中保留这些范围。
- 若准备调用结构化工具，且【当前报告风格】为“未选择”，服务会先询问用户报告风格；planner 不需要自行生成该问题，除非还需要同时收集别的关键参数。
- “我/本人/当前命主/用户/命主”只是代词，不是有效人物。只有下方【当前已验证命主】存在 baziText 或 pillars 时，才可把“我”解析为该命主；否则必须 request_human_input。
- 不要为了调用工具而编造日期、人物、八字、图片或关系。
- 工具返回后，本服务会直接把工具结果流式输出；planner 不需要再总结工具全文。
- 所有 answer/ask/request_human_input.content 使用中文。

【回答复杂度配置】
${complexity.plannerInstruction}

现在是：${getCurrentDateString()}

【当前已验证命主】
${profileBlock(currentProfile)}

【已选人物上下文】
${participantContextBlock(input.participants)}

【已选时间段】
${timeRangeContextBlock(input.timeRanges)}

【当前报告风格】
${getAgentReportPreferenceLabel(reportPreference)}
`
}

function buildPlannerMessages(
  input: AgentChatInput,
  observations: ToolObservation[],
): any[] {
  const system = buildAgentSystemPrompt(input)
  const conversation = normalizeMessages(input.messages)
  const observationText = observations.length
    ? observations
        .map((o, i) => {
          const status = o.ok ? '成功' : '失败'
          return `### 工具观察 ${i + 1}（${o.kind} / ${status}）\n${truncateText(o.content, MAX_TOOL_RESULT_CHARS)}`
        })
        .join('\n\n')
    : '（暂无工具观察）'

  const contextText = truncateText(
    `【工具观察】\n${observationText}`,
    MAX_CONTEXT_CHARS,
  )

  return [
    { role: 'system', content: system },
    ...conversation,
    {
      role: 'system',
      content: contextText,
    },
    {
      role: 'user',
      content: '请根据当前对话和工具观察，输出下一步 JSON 动作。',
    },
  ]
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim()
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fence ? fence[1].trim() : trimmed
}

function extractAction(text: string): AgentAction | null {
  const stripped = stripJsonFence(text)
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const raw = JSON.parse(stripped.slice(start, end + 1))
    if (raw?.action === 'answer' && typeof raw.content === 'string') {
      return { action: 'answer', content: raw.content }
    }
    if (raw?.action === 'ask' && typeof raw.content === 'string') {
      return {
        action: 'ask',
        content: raw.content,
        missing: Array.isArray(raw.missing) ? raw.missing.map(String) : undefined,
      }
    }
    if (raw?.action === 'request_human_input' && typeof raw.content === 'string') {
      return {
        action: 'request_human_input',
        content: raw.content,
        request: raw.request && typeof raw.request === 'object' ? raw.request : undefined,
      }
    }
    if (raw?.action === 'open_bazi_form' && typeof raw.content === 'string') {
      return {
        action: 'open_bazi_form',
        content: raw.content,
        initialData: raw.initialData && typeof raw.initialData === 'object'
          ? raw.initialData
          : undefined,
      }
    }
    if (
      raw?.action === 'tool_call' &&
      raw.tool === 'feature_analyze' &&
      ['fortune', 'hepan', 'lifepath', 'avatar'].includes(raw.kind)
    ) {
      return {
        action: 'tool_call',
        tool: 'feature_analyze',
        kind: raw.kind,
        params: raw.params,
        reason: typeof raw.reason === 'string' ? raw.reason : undefined,
      }
    }
  } catch {
    return null
  }
  return null
}

function extractPlainTextAnswer(text: string): AgentAction | null {
  const stripped = stripJsonFence(text).trim()
  if (!stripped) return null
  if (stripped.startsWith('{') || stripped.includes('"action"')) return null
  return { action: 'answer', content: stripped }
}

function textToStream(text: string, opts: { dripDelayMs?: number } = {}): ReadableStream {
  const encoder = new TextEncoder()
  const delay = opts.dripDelayMs ?? AGENT_STREAM_DELAY_MS
  return new ReadableStream({
    async start(controller) {
      let rest = sanitizeReplacementChars(text)
      while (rest.length > 0) {
        const chunk = takeSemanticStreamChunk(rest, {
          minChars: AGENT_STREAM_MIN_CHARS,
          maxChars: AGENT_STREAM_MAX_CHARS,
        }) || rest
        rest = rest.slice(chunk.length)
        controller.enqueue(encoder.encode(chunk))
        await new Promise(resolve => setTimeout(resolve, delay))
      }
      controller.close()
    },
  })
}

async function withDeadline<T>(
  deadlineAt: number,
  fn: (signal: AbortSignal) => Promise<T>,
  externalSignal?: AbortSignal,
): Promise<T> {
  const remaining = deadlineAt - Date.now()
  if (remaining <= 0) throw new Error('Agent timeout')

  const controller = new AbortController()
  const abort = () => controller.abort()
  if (externalSignal?.aborted) {
    controller.abort()
  } else {
    externalSignal?.addEventListener('abort', abort, { once: true })
  }
  const timer = setTimeout(() => controller.abort(), remaining)
  try {
    return await fn(controller.signal)
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener('abort', abort)
  }
}

function fallbackAnswer(observations: ToolObservation[]): string {
  const lastOk = [...observations].reverse().find(o => o.ok)
  if (lastOk) {
    return `我已经完成了结构化分析，先把关键结论整理给你：\n\n${truncateText(lastOk.content, 5000)}`
  }
  return '我这边暂时没能稳定完成 Agent 编排。你可以先补充命主、时间范围和关注方向，我会继续帮你整理成更准确的分析。'
}

function traceEvent(
  trace: AgentTraceEvent[],
  event: AgentTraceEvent,
): AgentStreamEvent {
  trace.push(event)
  return { type: 'trace', trace: event }
}

function progressEvent(
  startedAt: number,
  event: Omit<AgentProgressEvent, 'elapsedMs'>,
): AgentStreamEvent {
  return {
    type: 'progress',
    progress: {
      ...event,
      elapsedMs: Date.now() - startedAt,
    },
  }
}

function describeAction(action: AgentAction | null): string {
  if (!action) return '无法解析动作'
  if (action.action === 'answer') return '生成最终回复'
  if (action.action === 'ask') return '追问缺失信息'
  if (action.action === 'request_human_input') return '请求用户补充信息'
  if (action.action === 'open_bazi_form') return '请求补全八字人物'
  return `调用功能工具：${action.kind}`
}

function describeTool(kind: FeatureKind): string {
  const labels: Record<FeatureKind, string> = {
    fortune: '近期运势',
    hepan: '合盘 / 应事',
    lifepath: '人生脉络',
    avatar: '头像分析',
  }
  return labels[kind] || kind
}

function debugLog(
  userId: string,
  label: string,
  payload?: Record<string, unknown>,
) {
  const suffix = payload ? ` ${JSON.stringify(payload)}` : ''
  console.log(`[agent][${userId.slice(0, 8)}] ${label}${suffix}`)
}

async function* streamTextEvents(text: string): AsyncGenerator<AgentStreamEvent> {
  let rest = sanitizeReplacementChars(text)
  while (rest.length > 0) {
    const chunk = takeSemanticStreamChunk(rest, {
      minChars: AGENT_STREAM_MIN_CHARS,
      maxChars: AGENT_STREAM_MAX_CHARS,
    }) || rest
    rest = rest.slice(chunk.length)
    yield { type: 'delta', content: chunk }
    await new Promise(resolve => setTimeout(resolve, AGENT_STREAM_DELAY_MS))
  }
}

async function openFeatureResultStream(
  toolInput: {
    userId: string
    kind: FeatureKind
    params: any
    reportPreference?: AgentReportPreference | null
  },
  deps: AgentRuntimeDeps,
  signal: AbortSignal,
  complexity: AgentComplexityMode,
): Promise<ReadableStream> {
  const inputWithComplexity = { ...toolInput, complexity }
  if (deps.runFeatureStream) {
    return deps.runFeatureStream(inputWithComplexity, { signal })
  }
  if (deps.runFeature) {
    const content = await deps.runFeature(inputWithComplexity, { signal })
    return textToStream(content, { dripDelayMs: 0 })
  }
  const result = await runFeatureAnalysisStream(
    { ...toolInput, source: 'agent_tool', complexity },
    { signal, drip: false },
  )
  return result.stream
}

export async function* runAgentChatEvents(
  input: AgentChatInput,
  deps: AgentRuntimeDeps = {},
): AsyncGenerator<AgentStreamEvent> {
  const startedAt = Date.now()
  const complexity = getAgentComplexityProfile(input.complexity)
  const timeoutMs = Math.min(
    Math.max(input.timeoutMs ?? complexity.timeoutMs, 5_000),
    DEFAULT_TIMEOUT_MS,
  )
  const deadlineAt = startedAt + timeoutMs
  const maxSteps = Math.min(
    Math.max(input.maxSteps ?? complexity.maxSteps, 1),
    HARD_MAX_STEPS,
  )
  const initialReportPreference = resolveReportPreference(input)
  const trace: AgentTraceEvent[] = []
  const observations: ToolObservation[] = []
  const plannerTask: LlmTaskKind = 'agent_planner'

  debugLog(input.userId, 'start', {
    messages: input.messages.length,
    selectedProfile: input.selectedProfile?.name || null,
    participants: input.participants?.map(p => p.name) || [],
    timeRanges: input.timeRanges?.map(range => range.label || `${range.start}~${range.end}`) || [],
    reportPreference: getAgentReportPreferenceLabel(initialReportPreference),
    featureContext: input.featureContext?.kind || null,
    complexity: complexity.mode,
    maxSteps,
    timeoutMs,
  })

  const fastAnswer = fastLocalAnswer(input)
  if (fastAnswer) {
    debugLog(input.userId, 'fast_answer', {
      content: truncateText(fastAnswer, 300),
    })
    yield traceEvent(trace, {
      step: 1,
      action: 'fast_answer',
      ok: true,
      detail: 'local_simple_chat',
      elapsedMs: Date.now() - startedAt,
    })
    yield progressEvent(startedAt, {
      step: 1,
      phase: 'final',
      status: 'running',
      title: '快速回复',
    })
    yield* streamTextEvents(fastAnswer)
    yield progressEvent(startedAt, {
      step: 1,
      phase: 'final',
      status: 'completed',
      title: '已快速回复',
    })
    yield { type: 'done', trace }
    return
  }

  const initialBaziForm = shouldOpenBaziForm(input)
  if (initialBaziForm) {
    const humanInput = buildBaziHumanInputRequest(
      initialBaziForm.content,
      initialBaziForm.initialData,
      '创建八字人物后继续当前问题',
    )
    debugLog(input.userId, 'bazi_form.open', {
      reason: 'preflight',
      initialData: initialBaziForm.initialData,
    })
    yield traceEvent(trace, {
      step: 1,
      action: 'request_human_input:bazi_profile',
      ok: true,
      detail: 'preflight',
      elapsedMs: Date.now() - startedAt,
    })
    yield progressEvent(startedAt, {
      step: 1,
      phase: 'final',
      status: 'running',
      title: '请求补全八字人物',
    })
    yield* streamTextEvents(initialBaziForm.content)
    yield {
      type: 'ui',
      ui: humanInput,
    }
    yield progressEvent(startedAt, {
      step: 1,
      phase: 'final',
      status: 'completed',
      title: '已请求补全八字人物',
    })
    yield { type: 'done', trace }
    return
  }

  const fortuneScope = shouldAskFortuneScope(input)
  if (fortuneScope) {
    debugLog(input.userId, 'fortune_scope.request', {
      reason: 'preflight',
      fields: fortuneScope.request.fields.map(field => field.name),
    })
    yield traceEvent(trace, {
      step: 1,
      action: 'request_human_input:fortune_scope',
      ok: true,
      detail: fortuneScope.request.fields.map(field => field.name).join(','),
      elapsedMs: Date.now() - startedAt,
    })
    yield progressEvent(startedAt, {
      step: 1,
      phase: 'final',
      status: 'running',
      title: '请求框定问题范围',
    })
    yield* streamTextEvents(fortuneScope.content)
    yield {
      type: 'ui',
      ui: fortuneScope.request,
    }
    yield progressEvent(startedAt, {
      step: 1,
      phase: 'final',
      status: 'completed',
      title: '已请求框定问题范围',
    })
    yield { type: 'done', trace }
    return
  }

  for (let step = 1; step <= maxSteps; step += 1) {
    if (input.signal?.aborted) {
      throw new Error('Agent request aborted')
    }
    if (Date.now() >= deadlineAt) {
      const event = {
        step,
        action: 'timeout',
        ok: false,
        elapsedMs: Date.now() - startedAt,
      }
      debugLog(input.userId, 'timeout', { step })
      yield traceEvent(trace, event)
      yield progressEvent(startedAt, {
        step,
        phase: 'planner',
        status: 'failed',
        title: 'Agent 超时',
        detail: '超过本次请求的最大等待时间',
      })
      break
    }

    yield progressEvent(startedAt, {
      step,
      phase: 'planner',
      status: 'running',
      title: '判断下一步动作',
      detail: observations.length
        ? `已收到 ${observations.length} 个工具观察`
        : '分析用户输入和当前人物上下文',
    })

    let action: AgentAction | null = null
    try {
      const plannerMessages = buildPlannerMessages(input, observations)
      debugLog(input.userId, 'planner.request', {
        step,
        messages: plannerMessages.length,
        observations: observations.length,
        task: plannerTask,
      })
      const raw = await withDeadline(
        deadlineAt,
        async signal => {
          if (deps.planner) return deps.planner(plannerMessages, signal)
          const result = await callLLMTextWithUsage(
            plannerMessages,
            plannerTask,
            {
              signal,
              maxTokens: complexity.plannerMaxTokens,
              temperature: complexity.mode === 'instant' ? 0.15 : 0.2,
              thinking: complexity.thinking,
              reasoningEffort: complexity.reasoningEffort,
            },
          )
          await recordLlmUsage({
            userId: input.userId,
            source: 'agent_planner',
            mode: 'agent',
            model: result.config.model,
            task: plannerTask,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
          })
          return result.text
        },
        input.signal,
      )
      action = extractAction(raw) || extractPlainTextAnswer(raw)
      debugLog(input.userId, 'planner.response', {
        step,
        action: action?.action || 'parse_failed',
        raw: truncateText(raw, 900),
      })
      const event = {
        step,
        action: action?.action || 'parse_failed',
        ok: !!action,
        detail: action ? undefined : truncateText(raw, 300),
        elapsedMs: Date.now() - startedAt,
      }
      yield traceEvent(trace, event)
      yield progressEvent(startedAt, {
        step,
        phase: 'planner',
        status: action ? 'completed' : 'failed',
        title: describeAction(action),
        detail: action
          ? action.action === 'tool_call'
            ? action.reason
            : undefined
          : '模型没有返回可执行 JSON',
      })
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      debugLog(input.userId, 'planner.error', { step, detail })
      const event = {
        step,
        action: 'planner_error',
        ok: false,
        detail,
        elapsedMs: Date.now() - startedAt,
      }
      yield traceEvent(trace, event)
      yield progressEvent(startedAt, {
        step,
        phase: 'planner',
        status: 'failed',
        title: '判断动作失败',
        detail,
      })
      break
    }

    if (!action) break

    if (action.action === 'answer' || action.action === 'ask') {
      const content = action.content || fallbackAnswer(observations)
      yield progressEvent(startedAt, {
        step,
        phase: 'final',
        status: 'running',
        title: action.action === 'ask' ? '整理追问信息' : '生成最终回复',
      })
      debugLog(input.userId, 'final.response', {
        step,
        action: action.action,
        content: truncateText(content, 900),
      })
      yield* streamTextEvents(content)
      yield progressEvent(startedAt, {
        step,
        phase: 'final',
        status: 'completed',
        title: action.action === 'ask' ? '已追问缺失信息' : '已生成回复',
      })
      yield { type: 'done', trace }
      return
    }

    if (action.action === 'request_human_input' || action.action === 'open_bazi_form') {
      const initialData = action.action === 'open_bazi_form'
        ? normalizeBaziInitialData(action.initialData, recentUserText(input))
        : buildBaziFormDataFromText(recentUserText(input))
      const content = action.content || '请先填写八字人物表单，生成 Bazi Analysis Results 后我再继续分析。'
      const humanInput = action.action === 'request_human_input'
        ? normalizeHumanInputRequest(action.request, content, input)
        : buildBaziHumanInputRequest(content, initialData, '补全八字人物后继续当前问题')
      debugLog(input.userId, 'bazi_form.open', {
        step,
        reason: 'planner',
        requestId: humanInput.requestId,
      })
      yield progressEvent(startedAt, {
        step,
        phase: 'final',
        status: 'running',
        title: humanInput.title || '请求用户补充信息',
      })
      yield* streamTextEvents(content)
      yield {
        type: 'ui',
        ui: humanInput,
      }
      yield progressEvent(startedAt, {
        step,
        phase: 'final',
        status: 'completed',
        title: '已请求用户补充信息',
      })
      yield { type: 'done', trace }
      return
    }

    action = normalizeToolAction(input, action)

    yield progressEvent(startedAt, {
      step,
      phase: 'tool',
      status: 'running',
      title: `准备调用：${describeTool(action.kind)}`,
      detail: action.reason,
    })

    const missing = validateFeatureParams(action.kind, action.params)
    if (missing.length > 0) {
      if (missing.some(item => item.includes('Bazi Analysis Results') || item.includes('baziText') || item.includes('pillars'))) {
        const content = '这个功能需要先有完整的八字人物。我帮你打开表单，请用 Bazi Analysis Results 生成命盘后再继续。'
        const initialData = buildBaziFormDataFromText(recentUserText(input))
        const humanInput = buildBaziHumanInputRequest(content, initialData, `补全八字人物后继续 ${action.kind} 分析`)
        debugLog(input.userId, 'bazi_form.open', {
          step,
          reason: 'missing_bazi_profile',
          missing,
          initialData,
        })
        yield traceEvent(trace, {
          step,
          action: 'request_human_input:bazi_profile',
          ok: true,
          detail: missing.join(','),
          elapsedMs: Date.now() - startedAt,
        })
        yield progressEvent(startedAt, {
          step,
          phase: 'tool',
          status: 'failed',
          title: `${describeTool(action.kind)} 缺少八字人物`,
          detail: missing.join('、'),
        })
        yield* streamTextEvents(content)
        yield {
          type: 'ui',
          ui: humanInput,
        }
        yield { type: 'done', trace }
        return
      }
      const content = `我可以继续用 Agent 调用「${action.kind}」分析，但还缺少：${missing.join('、')}。请先补充这些信息。`
      const humanInput = buildFeatureParamsInputRequest(action.kind, missing, content)
      debugLog(input.userId, 'tool.validation_failed', {
        step,
        kind: action.kind,
        missing,
        params: truncateText(JSON.stringify(action.params || {}), 1200),
      })
      const event = {
        step,
        action: `tool_validation:${action.kind}`,
        ok: false,
        detail: missing.join(','),
        elapsedMs: Date.now() - startedAt,
      }
      yield traceEvent(trace, event)
      yield progressEvent(startedAt, {
        step,
        phase: 'tool',
        status: 'failed',
        title: `${describeTool(action.kind)} 参数不完整`,
        detail: missing.join('、'),
      })
      yield* streamTextEvents(content)
      yield { type: 'ui', ui: humanInput }
      yield { type: 'done', trace }
      return
    }

    const reportPreference = resolveReportPreference(input)
    if (!reportPreference) {
      const content = `参数已经差不多齐了。生成「${describeTool(action.kind)}」报告前，先选一下你想要的报告风格。`
      const humanInput = buildReportPreferenceInputRequest(action.kind)
      debugLog(input.userId, 'report_preference.request', {
        step,
        kind: action.kind,
      })
      yield traceEvent(trace, {
        step,
        action: `request_human_input:report_preference:${action.kind}`,
        ok: true,
        elapsedMs: Date.now() - startedAt,
      })
      yield progressEvent(startedAt, {
        step,
        phase: 'final',
        status: 'running',
        title: '选择报告风格',
      })
      yield* streamTextEvents(content)
      yield { type: 'ui', ui: humanInput }
      yield progressEvent(startedAt, {
        step,
        phase: 'final',
        status: 'completed',
        title: '已请求报告风格',
      })
      yield { type: 'done', trace }
      return
    }

    let partialToolContent = ''
    try {
      const toolInput = {
        userId: input.userId,
        kind: action.kind,
        params: action.params,
        reportPreference,
      }
      debugLog(input.userId, 'tool.call', {
        step,
        kind: action.kind,
        reason: action.reason,
        reportPreference: getAgentReportPreferenceLabel(reportPreference),
        params: truncateText(JSON.stringify(action.params || {}), 1600),
      })
      const remainingMs = deadlineAt - Date.now()
      if (remainingMs <= 0) throw new Error('Agent timeout')
      const controller = new AbortController()
      const abortTool = () => controller.abort()
      if (input.signal?.aborted) {
        controller.abort()
      } else {
        input.signal?.addEventListener('abort', abortTool, { once: true })
      }
      const timer = setTimeout(() => controller.abort(), remainingMs)
      try {
        const resultStream = await openFeatureResultStream(
          toolInput,
          deps,
          controller.signal,
          complexity.mode,
        )
        const reader = resultStream.getReader()
        const decoder = new TextDecoder()
        yield progressEvent(startedAt, {
          step,
          phase: 'final',
          status: 'running',
          title: `${describeTool(action.kind)} 正在生成报告`,
          detail: '分析正文会边生成边显示',
        })
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = sanitizeReplacementChars(decoder.decode(value, { stream: true }))
          if (!chunk) continue
          partialToolContent += chunk
          yield { type: 'delta', content: chunk }
        }
        const tail = sanitizeReplacementChars(decoder.decode())
        if (tail) {
          partialToolContent += tail
          yield { type: 'delta', content: tail }
        }
      } finally {
        clearTimeout(timer)
        input.signal?.removeEventListener('abort', abortTool)
      }
      if (!partialToolContent.trim()) {
        throw new Error('分析服务返回为空')
      }
      observations.push({
        tool: 'feature_analyze',
        kind: action.kind,
        ok: true,
        content: partialToolContent,
      })
      debugLog(input.userId, 'tool.result', {
        step,
        kind: action.kind,
        content: truncateText(partialToolContent, 1200),
      })
      const event = {
        step,
        action: `tool_call:${action.kind}`,
        ok: true,
        detail: action.reason,
        elapsedMs: Date.now() - startedAt,
      }
      yield traceEvent(trace, event)
      yield progressEvent(startedAt, {
        step,
        phase: 'tool',
        status: 'completed',
        title: `${describeTool(action.kind)} 已完成`,
        detail: action.reason,
      })
      debugLog(input.userId, 'final.response', {
        step,
        action: `tool_result:${action.kind}`,
        content: truncateText(partialToolContent, 900),
      })
      yield progressEvent(startedAt, {
        step,
        phase: 'final',
        status: 'completed',
        title: '已输出工具分析结果',
      })
      yield { type: 'done', trace }
      return
    } catch (err) {
      if (isAbortError(err) && partialToolContent.trim()) {
        const detail = 'Agent 工具生成超过本次请求时间，已保留当前已生成内容。'
        observations.push({
          tool: 'feature_analyze',
          kind: action.kind,
          ok: true,
          content: partialToolContent,
        })
        debugLog(input.userId, 'tool.partial_timeout', {
          step,
          kind: action.kind,
          chars: partialToolContent.length,
        })
        yield traceEvent(trace, {
          step,
          action: `tool_call:${action.kind}:partial_timeout`,
          ok: true,
          detail,
          elapsedMs: Date.now() - startedAt,
        })
        yield progressEvent(startedAt, {
          step,
          phase: 'final',
          status: 'completed',
          title: '已输出部分工具分析结果',
          detail,
        })
        yield { type: 'delta', content: '\n\n（本次长报告生成时间接近上限，我先保留以上已生成内容。你可以继续追问“接着写/继续展开某个月”。）' }
        yield { type: 'done', trace }
        return
      }
      const detail = err instanceof Error ? err.message : String(err)
      observations.push({
        tool: 'feature_analyze',
        kind: action.kind,
        ok: false,
        content: detail,
      })
      debugLog(input.userId, 'tool.error', {
        step,
        kind: action.kind,
        detail,
      })
      const event = {
        step,
        action: `tool_call:${action.kind}`,
        ok: false,
        detail,
        elapsedMs: Date.now() - startedAt,
      }
      yield traceEvent(trace, event)
      yield progressEvent(startedAt, {
        step,
        phase: 'tool',
        status: 'failed',
        title: `${describeTool(action.kind)} 调用失败`,
        detail,
      })
      yield* streamTextEvents(`工具分析暂时没有完成：${detail}。我先不继续扣苹果，请你稍后再试，或改用经典聊天继续追问。`)
      yield { type: 'done', trace }
      return
    }
  }

  const event = {
    step: maxSteps,
    action: 'fallback',
    ok: false,
    elapsedMs: Date.now() - startedAt,
  }
  debugLog(input.userId, 'fallback', {
    observations: observations.length,
  })
  yield traceEvent(trace, event)
  yield progressEvent(startedAt, {
    step: maxSteps,
    phase: 'fallback',
    status: 'running',
    title: '使用兜底回复',
  })

  yield* streamTextEvents(fallbackAnswer(observations))
  yield progressEvent(startedAt, {
    step: maxSteps,
    phase: 'fallback',
    status: 'completed',
    title: '兜底回复已生成',
  })
  yield { type: 'done', trace }
}

export function createAgentEventStream(
  input: AgentChatInput,
  deps: AgentRuntimeDeps = {},
): ReadableStream {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runAgentChatEvents(input, deps)) {
          if (event.type === 'delta') {
            const content = sanitizeReplacementChars(event.content)
            if (!content) continue
            controller.enqueue(encoder.encode(`${JSON.stringify({ ...event, content })}\n`))
            continue
          }
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[agent] event stream fatal error', err)
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'error', message })}\n`))
      } finally {
        controller.close()
      }
    },
  })
}

export async function runAgentChat(
  input: AgentChatInput,
  deps: AgentRuntimeDeps = {},
): Promise<AgentChatResult> {
  const trace: AgentTraceEvent[] = []
  let content = ''

  for await (const event of runAgentChatEvents(input, deps)) {
    if (event.type === 'trace') trace.push(event.trace)
    if (event.type === 'delta') content += sanitizeReplacementChars(event.content)
  }

  return {
    stream: textToStream(content),
    trace,
  }
}
