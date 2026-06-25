import { runAgentChat, runAgentChatEvents } from '../lib/agent-service'
import { getAgentAnalysisGenerationOptions } from '../lib/agent-analysis-runner'
import { buildAgentAnalysisMessages } from '../lib/agent-prompt-builder'
import { buildFeatureMessages } from '../lib/feature-service'
import { selectLlmConfig } from '../lib/llm'
import type { AgentAnalysisRequest } from '../lib/agent-workflow-types'

async function readStream(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let out = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    out += decoder.decode(value, { stream: true })
  }

  return out
}

async function collect(input: Parameters<typeof runAgentChatEvents>[0], deps: Parameters<typeof runAgentChatEvents>[1] = {}) {
  const events: any[] = []
  let text = ''
  for await (const event of runAgentChatEvents(input, deps)) {
    events.push(event)
    if (event.type === 'delta') text += event.content
  }
  return {
    events,
    text,
    ui: events.find(event => event.type === 'ui')?.ui,
    done: [...events].reverse().find(event => event.type === 'done'),
  }
}

const selfProfile = {
  id: 'self',
  name: '我',
  pillars: '甲戌 癸酉 壬子 戊申',
  baziText: `女命 公历: 1994年9月23日15时
年柱：甲戌 月柱：癸酉 日柱：壬子 时柱：戊申
年龄 大运 年份:
8-17岁大运 壬申 2002-2011
18-27岁大运 辛未 2012-2021
28-37岁大运 庚午 2022-2031`,
  dayun: [
    { ageStart: 8, ageEnd: 17, ganZhi: '壬申', yearStart: 2002, yearEnd: 2011 },
    { ageStart: 18, ageEnd: 27, ganZhi: '辛未', yearStart: 2012, yearEnd: 2021 },
    { ageStart: 28, ageEnd: 37, ganZhi: '庚午', yearStart: 2022, yearEnd: 2031 },
  ],
}

const xixiProfile = {
  id: 'xixi',
  name: '西西',
  pillars: '乙亥 甲申 丁卯 庚子',
  baziText: `女命 公历: 1995年8月16日23时
年柱：乙亥 月柱：甲申 日柱：丁卯 时柱：庚子
年龄 大运 年份:
7-16岁大运 癸未 2002-2011
17-26岁大运 壬午 2012-2021
27-36岁大运 辛巳 2022-2031`,
  dayun: [
    { ageStart: 7, ageEnd: 16, ganZhi: '癸未', yearStart: 2002, yearEnd: 2011 },
    { ageStart: 17, ageEnd: 26, ganZhi: '壬午', yearStart: 2012, yearEnd: 2021 },
    { ageStart: 27, ageEnd: 36, ganZhi: '辛巳', yearStart: 2022, yearEnd: 2031 },
  ],
}

const correctedProfile = {
  id: 'corrected-person',
  name: '小山楂',
  pillars: '丙子 丁酉 己未 辛亥',
  baziText: `女命 公历: 1996年9月9日21时
年柱：丙子 月柱：丁酉 日柱：己未 时柱：辛亥
年龄 大运 年份:
6-15岁大运 戊戌 2002-2011
16-25岁大运 己亥 2012-2021
26-35岁大运 庚子 2022-2031`,
  dayun: [
    { ageStart: 6, ageEnd: 15, ganZhi: '戊戌', yearStart: 2002, yearEnd: 2011 },
    { ageStart: 16, ageEnd: 25, ganZhi: '己亥', yearStart: 2012, yearEnd: 2021 },
    { ageStart: 26, ageEnd: 35, ganZhi: '庚子', yearStart: 2022, yearEnd: 2031 },
  ],
}

const shanzhaProfile = {
  id: 'shanzha',
  name: '山楂',
  pillars: '甲戌 壬申 己丑 甲戌',
  baziText: `女命 公历: 1994年8月18日20时
年柱：甲戌 月柱：壬申 日柱：己丑 时柱：甲戌
年龄 大运 年份:
9-18岁大运 癸酉 2003-2012
19-28岁大运 甲戌 2013-2022
29-38岁大运 乙亥 2023-2032`,
  dayun: [
    { ageStart: 9, ageEnd: 18, ganZhi: '癸酉', yearStart: 2003, yearEnd: 2012 },
    { ageStart: 19, ageEnd: 28, ganZhi: '甲戌', yearStart: 2013, yearEnd: 2022 },
    { ageStart: 29, ageEnd: 38, ganZhi: '乙亥', yearStart: 2023, yearEnd: 2032 },
  ],
}

const ISO_DATE_RE = /\d{4}-\d{2}-\d{2}/

function visibleUiText(ui: any): string {
  return [
    ui?.title,
    ui?.message,
    ui?.submitLabel,
    ...(ui?.fields || []).flatMap((field: any) => [
      field.label,
      field.placeholder,
      field.customPlaceholder,
      ...(field.options || []).flatMap((option: any) => [
        option.label,
        option.description,
      ]),
    ]),
  ].filter(Boolean).join('\n')
}

function messagesText(messages: any[]): string {
  return messages
    .map(message => typeof message.content === 'string' ? message.content : JSON.stringify(message.content))
    .join('\n')
}

function analysisMessagesText(request?: AgentAnalysisRequest): string {
  return request ? messagesText(buildAgentAnalysisMessages(request)) : ''
}

function assertPromptIncludes(label: string, text: string, phrases: string[]) {
  const missing = phrases.filter(phrase => !text.includes(phrase))
  if (missing.length > 0) {
    throw new Error(`${label} missing prompt phrases: ${missing.join('、')}\n${text.slice(0, 1200)}`)
  }
}

async function main() {
  const expectedProModel = process.env.DEEPSEEK_V4_PRO_MODEL || 'deepseek-v4-pro'
  const expectedFlashModel = process.env.DEEPSEEK_V4_FLASH_MODEL || 'deepseek-v4-flash'
  if (selectLlmConfig('free').model !== expectedProModel) {
    throw new Error(`free/main route should use Pro: ${selectLlmConfig('free').model}`)
  }
  if (selectLlmConfig('apple_report').model !== expectedProModel) {
    throw new Error(`report route should use Pro: ${selectLlmConfig('apple_report').model}`)
  }
  if (selectLlmConfig('agent_extractor').model !== expectedFlashModel) {
    throw new Error(`extractor route should use Flash: ${selectLlmConfig('agent_extractor').model}`)
  }
  if (selectLlmConfig('follow_up_suggestions').model !== expectedFlashModel) {
    throw new Error(`follow-up route should use Flash: ${selectLlmConfig('follow_up_suggestions').model}`)
  }

  const fastResult = await runAgentChat(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '你好' }],
      timeoutMs: 10_000,
    },
    {
      directChat: async () => {
        throw new Error('direct chat should not run for fast greeting')
      },
    },
  )
  const fastText = await readStream(fastResult.stream)
  if (!fastText.includes('我是卜卜象') || !fastResult.trace.some(trace => trace.action === 'fast_answer')) {
    throw new Error(`fast path failed: ${fastText}`)
  }

  const noProfile = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '我的未来几年财运如何？' }],
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('analysis should wait for profile')
      },
    },
  )
  if (noProfile.ui?.kind !== 'bazi_profile' || noProfile.done?.pendingConfirmation?.kind !== 'create_profile') {
    throw new Error(`no-profile flow failed: ${JSON.stringify(noProfile.events)}`)
  }

  const toolDirect = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '今天有点乱，先像聊天一样接住我' }],
      timeoutMs: 10_000,
    },
    {
      selectTool: async () => ({
        name: 'agent_direct_chat',
        arguments: { reason: '用户明确要求像聊天一样说' },
      }),
      directChat: async () => '这是工具路由后的直聊回复。',
      runAnalysisStream: async () => {
        throw new Error('tool-routed direct chat should not run analysis')
      },
    },
  )
  if (
    !toolDirect.text.includes('工具路由后的直聊回复') ||
    !toolDirect.events.some(event => event.type === 'trace' && event.trace?.action === 'tool_call:agent_direct_chat')
  ) {
    throw new Error(`tool direct chat failed: text=${toolDirect.text}, events=${JSON.stringify(toolDirect.events)}`)
  }

  const toolMissingProfile = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '帮西西看看事业走势' }],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      timeoutMs: 10_000,
    },
    {
      selectTool: async () => ({
        name: 'agent_request_bazi_profile',
        arguments: {
          reason: '用户要看西西的事业，但上下文没有西西的八字资料',
          profileName: '西西',
          category: 'fortune',
          focus: ['事业'],
        },
      }),
      directChat: async () => {
        throw new Error('missing profile tool route should not fall through to direct chat')
      },
      runAnalysisStream: async () => {
        throw new Error('missing profile tool route should wait for profile card')
      },
    },
  )
  const toolMissingProfileNameField = toolMissingProfile.ui?.fields?.find((field: any) => field.name === 'profileName')
  if (
    toolMissingProfile.done?.pendingConfirmation?.kind !== 'create_profile' ||
    toolMissingProfile.ui?.kind !== 'bazi_profile' ||
    toolMissingProfileNameField?.value !== '西西' ||
    !toolMissingProfile.events.some(event => event.type === 'trace' && event.trace?.action === 'tool_call:agent_request_bazi_profile')
  ) {
    throw new Error(`tool missing profile failed: text=${toolMissingProfile.text}, ui=${JSON.stringify(toolMissingProfile.ui)}`)
  }

  const dailyDirectFromBadTool = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '我今天适合出门吗？' }],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      timeoutMs: 10_000,
    },
    {
      selectTool: async () => ({
        name: 'agent_confirm_time_range',
        arguments: {
          reason: '故意模拟 LLM 误以为今天还要确认时间卡',
          category: 'fortune',
          focus: ['出行', '日常'],
          timeText: '今天',
        },
      }),
      directChat: async () => '今天可以出门，但更适合轻装、少绕路，重要沟通留一点余地。',
      runAnalysisStream: async () => {
        throw new Error('explicit daily decision should not run paid analysis')
      },
    },
  )
  if (
    !dailyDirectFromBadTool.text.includes('今天可以出门') ||
    dailyDirectFromBadTool.ui ||
    dailyDirectFromBadTool.done?.pendingConfirmation ||
    !dailyDirectFromBadTool.events.some(event => event.type === 'trace' && event.trace?.action === 'tool_call:agent_direct_chat')
  ) {
    throw new Error(`daily direct normalization failed: text=${dailyDirectFromBadTool.text}, ui=${JSON.stringify(dailyDirectFromBadTool.ui)}, done=${JSON.stringify(dailyDirectFromBadTool.done)}`)
  }

  const tomorrowSigningCaptured: { request?: AgentAnalysisRequest } = {}
  const tomorrowSigningFinal = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '详细分析我明天适合签约吗？' }],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      timeoutMs: 10_000,
    },
    {
      selectTool: async () => null,
      runAnalysisStream: async ({ request }) => {
        tomorrowSigningCaptured.request = request
        return '明天签约分析已生成。'
      },
    },
  )
  const tomorrowVisibleText = `${tomorrowSigningFinal.text}\n${visibleUiText(tomorrowSigningFinal.ui)}`
  if (
    !tomorrowSigningFinal.text.includes('明天签约分析') ||
    tomorrowSigningFinal.done?.pendingConfirmation ||
    tomorrowSigningCaptured.request?.slots.askedTime?.label !== '明天' ||
    tomorrowSigningCaptured.request?.slots.matter?.focus?.[0] !== '应事择日' ||
    tomorrowSigningCaptured.request?.depth !== 'detailed' ||
    /未来 30 天|未来 3 个月|今年剩余时间/.test(tomorrowVisibleText)
  ) {
    throw new Error(`tomorrow explicit date policy failed: text=${tomorrowSigningFinal.text}, ui=${JSON.stringify(tomorrowSigningFinal.ui)}, done=${JSON.stringify(tomorrowSigningFinal.done)}, request=${JSON.stringify(tomorrowSigningCaptured.request)}`)
  }
  assertPromptIncludes('tomorrow event scenario prompt', analysisMessagesText(tomorrowSigningCaptured.request), [
    '应事择日与决策参考',
    '备选路径',
    '专业风险提示',
  ])

  const recentOutingCard = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '我最近适合出门吗？' }],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      timeoutMs: 10_000,
    },
    {
      selectTool: async () => null,
      runAnalysisStream: async () => {
        throw new Error('recent outing should ask a contextual date card')
      },
    },
  )
  const recentOutingField = recentOutingCard.ui?.fields?.[0]
  const recentOptionValues = (recentOutingField?.options || []).map((option: any) => option.value)
  const recentVisibleText = `${recentOutingCard.text}\n${visibleUiText(recentOutingCard.ui)}`
  if (
    recentOutingCard.done?.pendingConfirmation?.kind !== 'confirm_time' ||
    recentOutingField?.name !== 'timeRangeChoice' ||
    !recentOptionValues.includes('today') ||
    !recentOptionValues.includes('tomorrow') ||
    /未来 3 个月|今年剩余时间/.test(recentVisibleText)
  ) {
    throw new Error(`recent outing contextual card failed: text=${recentOutingCard.text}, ui=${JSON.stringify(recentOutingCard.ui)}`)
  }

  const recentStateDirect = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '我最近状态怎么样？' }],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      timeoutMs: 10_000,
    },
    {
      selectTool: async () => ({
        name: 'agent_select_depth',
        arguments: {
          reason: '故意模拟 LLM 把一个短问题误判成报告深度选择',
          category: 'fortune',
          focus: ['身心状态'],
        },
      }),
      directChat: async () => '最近状态短答：先稳住节奏，少做高消耗决定。',
      runAnalysisStream: async () => {
        throw new Error('bounded recent-state question should not run report analysis')
      },
    },
  )
  if (
    !recentStateDirect.text.includes('最近状态短答') ||
    recentStateDirect.ui ||
    recentStateDirect.done?.pendingConfirmation ||
    !recentStateDirect.events.some(event => event.type === 'trace' && event.trace?.action === 'tool_call:agent_direct_chat')
  ) {
    throw new Error(`recent state direct routing failed: text=${recentStateDirect.text}, ui=${JSON.stringify(recentStateDirect.ui)}, done=${JSON.stringify(recentStateDirect.done)}`)
  }

  const explicitReportFromBadDirect = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '给我一份2026年事业财运报告' }],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      timeoutMs: 10_000,
    },
    {
      selectTool: async () => ({
        name: 'agent_direct_chat',
        arguments: { reason: '故意模拟 LLM 想短答报告型需求' },
      }),
      directChat: async () => {
        throw new Error('explicit report request should be upgraded out of direct chat')
      },
      runAnalysisStream: async () => {
        throw new Error('explicit report request should ask depth before analysis')
      },
    },
  )
  const explicitReportField = explicitReportFromBadDirect.ui?.fields?.[0]
  if (
    explicitReportFromBadDirect.done?.pendingConfirmation?.kind !== 'select_depth' ||
    explicitReportField?.name !== 'depthChoice' ||
    !explicitReportFromBadDirect.events.some(event => event.type === 'trace' && event.trace?.action === 'tool_call:agent_select_depth') ||
    !explicitReportFromBadDirect.events.some(event => event.type === 'trace' && event.trace?.action === 'response_mode:report')
  ) {
    throw new Error(`explicit report upgrade failed: text=${explicitReportFromBadDirect.text}, ui=${JSON.stringify(explicitReportFromBadDirect.ui)}, events=${JSON.stringify(explicitReportFromBadDirect.events)}`)
  }

  const longRequestFromBadDirect = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '我想看2026年事业、财富和感情的整体节奏，分别有哪些机会、风险和行动建议？' }],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      timeoutMs: 10_000,
    },
    {
      selectTool: async () => ({
        name: 'agent_direct_chat',
        arguments: { reason: '故意模拟 LLM 想短答较长的多主题需求' },
      }),
      directChat: async () => {
        throw new Error('long multi-topic request should be upgraded out of direct chat')
      },
      runAnalysisStream: async () => {
        throw new Error('long multi-topic request should ask depth before analysis')
      },
    },
  )
  const longRequestField = longRequestFromBadDirect.ui?.fields?.[0]
  if (
    longRequestFromBadDirect.done?.pendingConfirmation?.kind !== 'select_depth' ||
    longRequestField?.name !== 'depthChoice' ||
    !longRequestFromBadDirect.events.some(event => event.type === 'trace' && event.trace?.action === 'response_mode:report')
  ) {
    throw new Error(`long request report recommendation failed: text=${longRequestFromBadDirect.text}, ui=${JSON.stringify(longRequestFromBadDirect.ui)}, events=${JSON.stringify(longRequestFromBadDirect.events)}`)
  }

  const llmPlannedCard = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '我最近适合出门吗？' }],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      timeoutMs: 10_000,
    },
    {
      selectTool: async () => null,
      planCard: async () => ({
        family: 'daily_decision',
        title: '小象帮你定个出门日',
        message: '选一个你最可能出门的日子，小象按那天细看。',
        submitLabel: '就看这天',
        optionHints: [
          { key: 'tomorrow', label: '明天出门', description: '适合想稍微缓一缓再出发。' },
          { key: 'today', label: '今天出门', description: '适合马上要动身。' },
        ],
      }),
      runAnalysisStream: async () => {
        throw new Error('planned card should still wait for user selection')
      },
    },
  )
  const plannedField = llmPlannedCard.ui?.fields?.[0]
  const plannedOptions = plannedField?.options || []
  if (
    llmPlannedCard.ui?.title !== '小象帮你定个出门日' ||
    !llmPlannedCard.text.includes('选一个你最可能出门的日子') ||
    plannedOptions[0]?.value !== 'tomorrow' ||
    plannedOptions[0]?.label !== '明天出门' ||
    !plannedOptions[0]?.params?.draftSlots?.askedTime ||
    !llmPlannedCard.events.some(event => event.type === 'trace' && event.trace?.action === 'card_plan:daily_decision')
  ) {
    throw new Error(`llm planned card failed: text=${llmPlannedCard.text}, ui=${JSON.stringify(llmPlannedCard.ui)}`)
  }

  const invalidPlannedCard = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '我最近适合出门吗？' }],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      timeoutMs: 10_000,
    },
    {
      selectTool: async () => null,
      planCard: async () => ({ family: 'made_up', title: '不该出现的卡片' } as any),
      runAnalysisStream: async () => {
        throw new Error('invalid planned card should still wait for user selection')
      },
    },
  )
  if (
    visibleUiText(invalidPlannedCard.ui).includes('不该出现') ||
    invalidPlannedCard.events.some(event => event.type === 'trace' && String(event.trace?.action || '').startsWith('card_plan:')) ||
    invalidPlannedCard.done?.pendingConfirmation?.kind !== 'confirm_time'
  ) {
    throw new Error(`invalid planned card fallback failed: text=${invalidPlannedCard.text}, ui=${JSON.stringify(invalidPlannedCard.ui)}, events=${JSON.stringify(invalidPlannedCard.events)}`)
  }

  const lifetimeWealthDepthAsk = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '我的此生什么时候能暴富？' }],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      timeoutMs: 10_000,
    },
    {
      selectTool: async () => ({
        name: 'agent_confirm_focus',
        arguments: {
          reason: '故意模拟 LLM 误以为还要确认重点',
          category: 'fortune',
        },
      }),
      runAnalysisStream: async () => {
        throw new Error('lifetime wealth should wait for depth, not run before report style')
      },
    },
  )
  const lifetimeDepthField = lifetimeWealthDepthAsk.ui?.fields?.[0]
  const lifetimeConciseOption = lifetimeDepthField?.options?.find((option: any) => option.value === 'concise')
  const lifetimeDraftSlots = lifetimeWealthDepthAsk.done?.pendingConfirmation?.draftSlots
  if (
    lifetimeWealthDepthAsk.done?.pendingConfirmation?.kind !== 'select_depth' ||
    lifetimeDepthField?.name !== 'depthChoice' ||
    lifetimeDraftSlots?.askedTime !== null ||
    lifetimeDraftSlots?.matter?.category !== 'lifepath' ||
    !lifetimeDraftSlots?.matter?.focus?.includes('财富') ||
    !lifetimeConciseOption ||
    lifetimeWealthDepthAsk.ui?.kind === 'bazi_profile'
  ) {
    throw new Error(`lifetime wealth policy failed: text=${lifetimeWealthDepthAsk.text}, done=${JSON.stringify(lifetimeWealthDepthAsk.done)}, ui=${JSON.stringify(lifetimeWealthDepthAsk.ui)}`)
  }

  const lifetimeCaptured: { request?: AgentAnalysisRequest } = {}
  const lifetimeFinal = await runAgentChat(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我的此生什么时候能暴富？' },
        { role: 'assistant', content: lifetimeWealthDepthAsk.text },
        { role: 'user', content: `报告长度：${lifetimeConciseOption.label}` },
      ],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      pendingConfirmation: lifetimeWealthDepthAsk.done.pendingConfirmation,
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async ({ request }) => {
        lifetimeCaptured.request = request
        return '人生财富窗口分析已生成。'
      },
    },
  )
  const lifetimeFinalText = await readStream(lifetimeFinal.stream)
  const lifetimePromptText = lifetimeCaptured.request
    ? buildAgentAnalysisMessages(lifetimeCaptured.request).map(message => String(message.content)).join('\n')
    : ''
  if (
    !lifetimeFinalText.includes('人生财富窗口') ||
    lifetimeCaptured.request?.slots.askedTime !== null ||
    lifetimeCaptured.request?.slots.matter?.category !== 'lifepath' ||
    !lifetimeCaptured.request?.slots.matter?.focus?.includes('财富') ||
    !lifetimePromptText.includes('人生财富窗口') ||
    !lifetimePromptText.includes('风险概率') ||
    !lifetimePromptText.includes('重大转折')
  ) {
    throw new Error(`lifetime wealth final failed: text=${lifetimeFinalText}, request=${JSON.stringify(lifetimeCaptured.request)}`)
  }

  const partnerArchetypeDepthAsk = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '我适合和谁一起搞钱？' }],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      timeoutMs: 10_000,
    },
    {
      selectTool: async () => ({
        name: 'agent_request_bazi_profile',
        arguments: {
          reason: '故意模拟 LLM 误以为“谁”是缺少的第二个人',
          profileName: '谁',
          category: 'relationship',
          focus: [],
        },
      }),
      runAnalysisStream: async () => {
        throw new Error('partner archetype should wait for depth, not request a second profile or run early')
      },
    },
  )
  const partnerDepthField = partnerArchetypeDepthAsk.ui?.fields?.[0]
  const partnerConciseOption = partnerDepthField?.options?.find((option: any) => option.value === 'concise')
  const partnerDraftSlots = partnerArchetypeDepthAsk.done?.pendingConfirmation?.draftSlots
  if (
    partnerArchetypeDepthAsk.done?.pendingConfirmation?.kind !== 'select_depth' ||
    partnerDepthField?.name !== 'depthChoice' ||
    partnerArchetypeDepthAsk.ui?.kind === 'bazi_profile' ||
    partnerDraftSlots?.people?.length !== 1 ||
    partnerDraftSlots?.people?.[0]?.name !== '我' ||
    partnerDraftSlots?.matter?.category !== 'lifepath' ||
    !partnerDraftSlots?.matter?.focus?.includes('财富') ||
    !partnerDraftSlots?.matter?.focus?.includes('合作对象') ||
    !partnerConciseOption
  ) {
    throw new Error(`partner archetype policy failed: text=${partnerArchetypeDepthAsk.text}, done=${JSON.stringify(partnerArchetypeDepthAsk.done)}, ui=${JSON.stringify(partnerArchetypeDepthAsk.ui)}`)
  }

  const partnerCaptured: { request?: AgentAnalysisRequest } = {}
  const partnerFinal = await runAgentChat(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我适合和谁一起搞钱？' },
        { role: 'assistant', content: partnerArchetypeDepthAsk.text },
        { role: 'user', content: `报告长度：${partnerConciseOption.label}` },
      ],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      pendingConfirmation: partnerArchetypeDepthAsk.done.pendingConfirmation,
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async ({ request }) => {
        partnerCaptured.request = request
        return '合作对象画像分析已生成。'
      },
    },
  )
  const partnerFinalText = await readStream(partnerFinal.stream)
  const partnerPromptText = partnerCaptured.request
    ? buildAgentAnalysisMessages(partnerCaptured.request).map(message => String(message.content)).join('\n')
    : ''
  if (
    !partnerFinalText.includes('合作对象画像') ||
    partnerCaptured.request?.slots.people?.length !== 1 ||
    partnerCaptured.request?.slots.people?.[0]?.name !== '我' ||
    partnerCaptured.request?.slots.matter?.category !== 'lifepath' ||
    !partnerCaptured.request?.slots.matter?.focus?.includes('合作对象') ||
    !partnerPromptText.includes('合作对象画像')
  ) {
    throw new Error(`partner archetype final failed: text=${partnerFinalText}, request=${JSON.stringify(partnerCaptured.request)}`)
  }

  const missingNamed = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '我和徐某最近关系如何' }],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('analysis should wait for 徐某 profile')
      },
    },
  )
  const missingNameField = missingNamed.ui?.fields?.find((field: any) => field.name === 'profileName')
  if (
    missingNamed.ui?.kind !== 'bazi_profile' ||
    missingNameField?.value !== '徐某' ||
    !missingNamed.text.includes('我先理解你说的对方是')
  ) {
    throw new Error(`missing named profile flow failed: text=${missingNamed.text}, ui=${JSON.stringify(missingNamed.ui)}`)
  }

  const smallT = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '我和小T适合吗？' }],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('analysis should wait for 小T profile')
      },
    },
  )
  const smallTNameField = smallT.ui?.fields?.find((field: any) => field.name === 'profileName')
  if (
    smallT.done?.pendingConfirmation?.kind !== 'create_profile' ||
    smallT.ui?.kind !== 'bazi_profile' ||
    smallTNameField?.value !== '小T' ||
    smallT.text.includes('小T适合')
  ) {
    throw new Error(`smallT name extraction failed: text=${smallT.text}, ui=${JSON.stringify(smallT.ui)}`)
  }

  const tongShishi = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '我和童诗诗合适吗？' }],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('analysis should wait for 童诗诗 profile')
      },
      directChat: async () => {
        throw new Error('合适吗 relationship question should not fall through to direct chat')
      },
    },
  )
  const tongShishiNameField = tongShishi.ui?.fields?.find((field: any) => field.name === 'profileName')
  if (
    tongShishi.done?.pendingConfirmation?.kind !== 'create_profile' ||
    tongShishi.ui?.kind !== 'bazi_profile' ||
    tongShishiNameField?.value !== '童诗诗'
  ) {
    throw new Error(`童诗诗 missing profile flow failed: text=${tongShishi.text}, ui=${JSON.stringify(tongShishi.ui)}`)
  }

  const similarNameMissing = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '我和迷你山楂今年适合合作嘛？' }],
      selectedProfile: selfProfile,
      participants: [selfProfile, shanzhaProfile],
      timeoutMs: 10_000,
    },
    {
      directChat: async () => {
        throw new Error('similar-name analysis should not fall through to direct chat')
      },
      runAnalysisStream: async () => {
        throw new Error('similar-name analysis should wait for 迷你山楂 profile')
      },
    },
  )
  const similarNameField = similarNameMissing.ui?.fields?.find((field: any) => field.name === 'profileName')
  if (
    similarNameMissing.done?.pendingConfirmation?.kind !== 'create_profile' ||
    similarNameMissing.ui?.kind !== 'bazi_profile' ||
    similarNameField?.value !== '迷你山楂'
  ) {
    throw new Error(`similar-name missing profile failed: text=${similarNameMissing.text}, ui=${JSON.stringify(similarNameMissing.ui)}`)
  }

  const existingNameTimeConfirm = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '我和山楂今年适合合作嘛？' }],
      selectedProfile: selfProfile,
      participants: [selfProfile, shanzhaProfile],
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('existing 山楂 analysis should wait for time confirmation')
      },
    },
  )
  if (existingNameTimeConfirm.done?.pendingConfirmation?.kind !== 'confirm_time') {
    throw new Error(`existing-name time confirmation failed: text=${existingNameTimeConfirm.text}, ui=${JSON.stringify(existingNameTimeConfirm.ui)}`)
  }

  const correctedFromPending = await collect(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我和山楂今年适合合作嘛？' },
        { role: 'assistant', content: existingNameTimeConfirm.text },
        { role: 'user', content: '迷你山楂是新人物，不是山楂' },
      ],
      selectedProfile: selfProfile,
      participants: [selfProfile, shanzhaProfile],
      pendingConfirmation: existingNameTimeConfirm.done.pendingConfirmation,
      timeoutMs: 10_000,
    },
    {
      directChat: async () => {
        throw new Error('person correction should not fall through to direct chat')
      },
      runAnalysisStream: async () => {
        throw new Error('person correction should wait for 迷你山楂 profile')
      },
    },
  )
  const correctedFromPendingField = correctedFromPending.ui?.fields?.find((field: any) => field.name === 'profileName')
  if (
    correctedFromPending.done?.pendingConfirmation?.kind !== 'create_profile' ||
    correctedFromPending.ui?.kind !== 'bazi_profile' ||
    correctedFromPendingField?.value !== '迷你山楂'
  ) {
    throw new Error(`pending person correction failed: text=${correctedFromPending.text}, ui=${JSON.stringify(correctedFromPending.ui)}`)
  }

  const liveExtractedCorrection = await collect(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我和山楂今年适合合作嘛？' },
        { role: 'assistant', content: existingNameTimeConfirm.text },
        { role: 'user', content: '你搞混了，我说的是迷你山楂，是一个新人物' },
      ],
      selectedProfile: selfProfile,
      participants: [selfProfile, shanzhaProfile],
      pendingConfirmation: existingNameTimeConfirm.done.pendingConfirmation,
      timeoutMs: 10_000,
    },
    {
      extractCorrection: async () => ({
        intent: 'correction',
        scope: 'person',
        intendedName: '迷你山楂',
        rejectedName: '山楂',
        createNew: true,
        confidence: 'high',
        source: 'llm',
      }),
      directChat: async () => {
        throw new Error('live extracted correction should not fall through to direct chat')
      },
      runAnalysisStream: async () => {
        throw new Error('live extracted correction should wait for 迷你山楂 profile')
      },
    },
  )
  const liveExtractedField = liveExtractedCorrection.ui?.fields?.find((field: any) => field.name === 'profileName')
  if (
    liveExtractedCorrection.done?.pendingConfirmation?.kind !== 'create_profile' ||
    liveExtractedCorrection.ui?.kind !== 'bazi_profile' ||
    liveExtractedField?.value !== '迷你山楂'
  ) {
    throw new Error(`live extracted correction failed: text=${liveExtractedCorrection.text}, ui=${JSON.stringify(liveExtractedCorrection.ui)}`)
  }

  const createNamedRelationship = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '我和山楂今年关系如何？' }],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('relationship with missing profile should wait for profile creation')
      },
    },
  )
  const createNamedField = createNamedRelationship.ui?.fields?.find((field: any) => field.name === 'profileName')
  if (
    createNamedRelationship.done?.pendingConfirmation?.kind !== 'create_profile' ||
    createNamedField?.value !== '山楂'
  ) {
    throw new Error(`named profile creation ask failed: text=${createNamedRelationship.text}, ui=${JSON.stringify(createNamedRelationship.ui)}`)
  }

  const correctedNameTimeConfirm = await collect(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我和山楂今年关系如何？' },
        { role: 'assistant', content: createNamedRelationship.text },
        { role: 'user', content: '继续分析：我和山楂今年关系如何？\n已创建八字人物：小山楂。\n人物名修正：山楂 -> 小山楂' },
      ],
      selectedProfile: selfProfile,
      participants: [selfProfile, correctedProfile],
      pendingConfirmation: createNamedRelationship.done.pendingConfirmation,
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('corrected-name relationship should wait for time confirmation')
      },
    },
  )
  const correctedTimeField = correctedNameTimeConfirm.ui?.fields?.[0]
  const correctedCurrentTimeOption = correctedTimeField?.options?.find((option: any) => option.value === 'current_time')
  if (
    correctedNameTimeConfirm.done?.pendingConfirmation?.kind !== 'confirm_time' ||
    correctedTimeField?.name !== 'timeRangeChoice' ||
    correctedNameTimeConfirm.ui?.kind === 'bazi_profile' ||
    !correctedCurrentTimeOption
  ) {
    throw new Error(`corrected-name time confirmation failed: text=${correctedNameTimeConfirm.text}, ui=${JSON.stringify(correctedNameTimeConfirm.ui)}`)
  }

  const correctedNameDepthAsk = await collect(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我和山楂今年关系如何？' },
        { role: 'assistant', content: createNamedRelationship.text },
        { role: 'user', content: '继续分析：我和山楂今年关系如何？\n已创建八字人物：小山楂。\n人物名修正：山楂 -> 小山楂' },
        { role: 'assistant', content: correctedNameTimeConfirm.text },
        { role: 'user', content: `时间范围：${correctedCurrentTimeOption.label}` },
      ],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      pendingConfirmation: correctedNameTimeConfirm.done.pendingConfirmation,
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('corrected-name relationship should wait for depth selection')
      },
    },
  )
  if (correctedNameDepthAsk.done?.pendingConfirmation?.kind !== 'select_depth') {
    throw new Error(`corrected-name depth ask failed: text=${correctedNameDepthAsk.text}, ui=${JSON.stringify(correctedNameDepthAsk.ui)}`)
  }

  const relationshipTimeConfirm = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '我和西西今年关系如何？' }],
      selectedProfile: xixiProfile,
      participants: [xixiProfile, selfProfile],
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('relationship analysis should wait for time confirmation')
      },
    },
  )
  const relationshipTimeField = relationshipTimeConfirm.ui?.fields?.[0]
  const relationshipCurrentTimeOption = relationshipTimeField?.options?.find((option: any) => option.value === 'current_time')
  if (
    relationshipTimeConfirm.done?.pendingConfirmation?.kind !== 'confirm_time' ||
    relationshipTimeField?.name !== 'timeRangeChoice' ||
    !relationshipCurrentTimeOption ||
    relationshipTimeConfirm.ui?.kind === 'bazi_profile'
  ) {
    throw new Error(`relationship time confirmation failed: text=${relationshipTimeConfirm.text}, ui=${JSON.stringify(relationshipTimeConfirm.ui)}`)
  }

  const futureRelationshipTimeConfirm = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '我和西西未来如何' }],
      selectedProfile: xixiProfile,
      participants: [xixiProfile, selfProfile],
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('future relationship analysis should wait for time confirmation')
      },
    },
  )
  const futureRelationshipTimeField = futureRelationshipTimeConfirm.ui?.fields?.[0]
  const futureRelationshipCurrentTimeOption = futureRelationshipTimeField?.options?.find((option: any) => option.value === 'current_time')
  const futureRelationshipVisibleText = `${futureRelationshipTimeConfirm.text}\n${visibleUiText(futureRelationshipTimeConfirm.ui)}`
  if (
    futureRelationshipTimeConfirm.done?.pendingConfirmation?.kind !== 'confirm_time' ||
    futureRelationshipTimeField?.name !== 'timeRangeChoice' ||
    futureRelationshipTimeField?.allowCustom !== true ||
    !futureRelationshipCurrentTimeOption ||
    !String(futureRelationshipCurrentTimeOption.label).includes('接下来一个关系阶段') ||
    !futureRelationshipTimeConfirm.text.includes('我先把这里的「未来」理解成「接下来一个关系阶段」') ||
    ISO_DATE_RE.test(futureRelationshipVisibleText)
  ) {
    throw new Error(`future relationship time confirmation failed: text=${futureRelationshipTimeConfirm.text}, ui=${JSON.stringify(futureRelationshipTimeConfirm.ui)}`)
  }

  const futureRelationshipNextAsk = await collect(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我和西西未来如何' },
        { role: 'assistant', content: futureRelationshipTimeConfirm.text },
        { role: 'user', content: `时间范围：${futureRelationshipCurrentTimeOption.label}` },
      ],
      selectedProfile: xixiProfile,
      participants: [xixiProfile, selfProfile],
      pendingConfirmation: futureRelationshipTimeConfirm.done.pendingConfirmation,
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('future relationship should still collect remaining slots')
      },
    },
  )
  if (futureRelationshipNextAsk.done?.pendingConfirmation?.kind === 'confirm_time') {
    throw new Error(`future relationship default time looped back to time confirmation: text=${futureRelationshipNextAsk.text}, ui=${JSON.stringify(futureRelationshipNextAsk.ui)}`)
  }

  const futureRelationshipCustomMonths = await collect(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我和西西未来如何' },
        { role: 'assistant', content: futureRelationshipTimeConfirm.text },
        { role: 'user', content: '时间范围：未来指三个月内' },
      ],
      selectedProfile: xixiProfile,
      participants: [xixiProfile, selfProfile],
      pendingConfirmation: futureRelationshipTimeConfirm.done.pendingConfirmation,
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('future relationship custom months should still collect remaining slots')
      },
    },
  )
  if (
    futureRelationshipCustomMonths.done?.pendingConfirmation?.kind === 'confirm_time' ||
    futureRelationshipCustomMonths.done?.pendingConfirmation?.draftSlots?.askedTime?.label !== '未来 3 个月'
  ) {
    throw new Error(`custom months time answer failed: text=${futureRelationshipCustomMonths.text}, done=${JSON.stringify(futureRelationshipCustomMonths.done)}`)
  }

  const futureRelationshipCustomYearEnd = await collect(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我和西西未来如何' },
        { role: 'assistant', content: futureRelationshipTimeConfirm.text },
        { role: 'user', content: '时间范围：先看到年底前' },
      ],
      selectedProfile: xixiProfile,
      participants: [xixiProfile, selfProfile],
      pendingConfirmation: futureRelationshipTimeConfirm.done.pendingConfirmation,
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('future relationship custom year-end should still collect remaining slots')
      },
    },
  )
  if (
    futureRelationshipCustomYearEnd.done?.pendingConfirmation?.kind === 'confirm_time' ||
    futureRelationshipCustomYearEnd.done?.pendingConfirmation?.draftSlots?.askedTime?.label !== '今年剩余时间'
  ) {
    throw new Error(`custom year-end time answer failed: text=${futureRelationshipCustomYearEnd.text}, done=${JSON.stringify(futureRelationshipCustomYearEnd.done)}`)
  }

  const relationshipDepthAsk = await collect(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我和西西今年关系如何？' },
        { role: 'assistant', content: relationshipTimeConfirm.text },
        { role: 'user', content: `时间范围：${relationshipCurrentTimeOption.label}` },
      ],
      selectedProfile: xixiProfile,
      participants: [xixiProfile, selfProfile],
      pendingConfirmation: relationshipTimeConfirm.done.pendingConfirmation,
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('relationship analysis should wait for depth selection')
      },
    },
  )
  const relationshipDepthField = relationshipDepthAsk.ui?.fields?.[0]
  const relationshipConciseOption = relationshipDepthField?.options?.find((option: any) => option.value === 'concise')
  if (
    relationshipDepthAsk.done?.pendingConfirmation?.kind !== 'select_depth' ||
    relationshipDepthField?.name !== 'depthChoice' ||
    !relationshipConciseOption
  ) {
    throw new Error(`relationship depth ask failed: text=${relationshipDepthAsk.text}, ui=${JSON.stringify(relationshipDepthAsk.ui)}`)
  }

  const relationshipCaptured: { request?: AgentAnalysisRequest; complexity?: string | null } = {}
  const relationshipFinal = await runAgentChat(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我和西西今年关系如何？' },
        { role: 'assistant', content: relationshipTimeConfirm.text },
        { role: 'user', content: `时间范围：${relationshipCurrentTimeOption.label}` },
        { role: 'assistant', content: relationshipDepthAsk.text },
        { role: 'user', content: `报告长度：${relationshipConciseOption.label}` },
      ],
      selectedProfile: xixiProfile,
      participants: [xixiProfile, selfProfile],
      pendingConfirmation: relationshipDepthAsk.done.pendingConfirmation,
      complexity: 'thinking',
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async ({ request, complexity }) => {
        relationshipCaptured.request = request
        relationshipCaptured.complexity = complexity
        return '关系分析已生成。'
      },
    },
  )
  const relationshipFinalText = await readStream(relationshipFinal.stream)
  const relationshipPeople = relationshipCaptured.request?.slots.people.map(person => person.name) || []
  if (
    !relationshipFinalText.includes('关系分析') ||
    relationshipCaptured.complexity !== 'thinking' ||
    !relationshipPeople.includes('我') ||
    !relationshipPeople.includes('西西') ||
    relationshipCaptured.request?.slots.matter?.category !== 'relationship'
  ) {
    throw new Error(`relationship final failed: text=${relationshipFinalText}, request=${JSON.stringify(relationshipCaptured.request)}`)
  }
  assertPromptIncludes('relationship scenario prompt', analysisMessagesText(relationshipCaptured.request), [
    '关系合盘与合作互动',
    '天干外显',
    '地支内在',
  ])

  const timeConfirm = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '我的未来几年财运如何？' }],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('analysis should wait for time confirmation')
      },
    },
  )
  const timeField = timeConfirm.ui?.fields?.[0]
  if (
    timeConfirm.done?.pendingConfirmation?.kind !== 'confirm_time' ||
    timeField?.name !== 'timeRangeChoice' ||
    !timeConfirm.text.includes('未来 3 年') ||
    !timeField.options?.some((option: any) => String(option.label).includes('未来 5 年')) ||
    ISO_DATE_RE.test(`${timeConfirm.text}\n${visibleUiText(timeConfirm.ui)}`)
  ) {
    throw new Error(`time confirmation failed: text=${timeConfirm.text}, ui=${JSON.stringify(timeConfirm.ui)}`)
  }

  const currentTimeOption = timeField.options.find((option: any) => String(option.label).includes('未来 3 年'))
  const future12MonthOption = timeField.options.find((option: any) => option.value === 'future_12_months')
  const future5YearOption = timeField.options.find((option: any) => option.value === 'future_5_years')
  if (!currentTimeOption || !future12MonthOption || !future5YearOption) {
    throw new Error(`time option presets missing: ui=${JSON.stringify(timeConfirm.ui)}`)
  }
  const structuredFuture5YearDepthAsk = await collect(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我的未来几年财运如何？' },
        { role: 'assistant', content: timeConfirm.text },
        { role: 'user', content: '已在卡片里选择更宽的时间线' },
      ],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      pendingConfirmation: {
        ...timeConfirm.done.pendingConfirmation,
        params: future5YearOption.params,
      },
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('structured future 5 years should wait for depth selection')
      },
    },
  )
  if (
    structuredFuture5YearDepthAsk.done?.pendingConfirmation?.kind !== 'select_depth' ||
    structuredFuture5YearDepthAsk.done.pendingConfirmation.draftSlots?.askedTime?.label !== '未来 5 年'
  ) {
    throw new Error(`structured future 5 year selection collapsed: text=${structuredFuture5YearDepthAsk.text}, done=${JSON.stringify(structuredFuture5YearDepthAsk.done)}`)
  }
  const future12MonthDepthAsk = await collect(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我的未来几年财运如何？' },
        { role: 'assistant', content: timeConfirm.text },
        { role: 'user', content: `时间范围：${future12MonthOption.label}` },
      ],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      pendingConfirmation: timeConfirm.done.pendingConfirmation,
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('future 12 months should wait for depth selection')
      },
    },
  )
  if (
    future12MonthDepthAsk.done?.pendingConfirmation?.kind !== 'select_depth' ||
    future12MonthDepthAsk.done.pendingConfirmation.draftSlots?.askedTime?.label !== '未来 12 个月'
  ) {
    throw new Error(`future 12 month selection collapsed: text=${future12MonthDepthAsk.text}, done=${JSON.stringify(future12MonthDepthAsk.done)}`)
  }
  const future5YearDepthAsk = await collect(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我的未来几年财运如何？' },
        { role: 'assistant', content: timeConfirm.text },
        { role: 'user', content: `时间范围：${future5YearOption.label}` },
      ],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      pendingConfirmation: timeConfirm.done.pendingConfirmation,
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('future 5 years should wait for depth selection')
      },
    },
  )
  if (
    future5YearDepthAsk.done?.pendingConfirmation?.kind !== 'select_depth' ||
    future5YearDepthAsk.done.pendingConfirmation.draftSlots?.askedTime?.label !== '未来 5 年'
  ) {
    throw new Error(`future 5 year selection collapsed: text=${future5YearDepthAsk.text}, done=${JSON.stringify(future5YearDepthAsk.done)}`)
  }

  const depthAsk = await collect(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我的未来几年财运如何？' },
        { role: 'assistant', content: timeConfirm.text },
        { role: 'user', content: `时间范围：${currentTimeOption.label}` },
      ],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      pendingConfirmation: timeConfirm.done.pendingConfirmation,
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('analysis should wait for depth selection')
      },
    },
  )
  const depthField = depthAsk.ui?.fields?.[0]
  if (
    depthAsk.done?.pendingConfirmation?.kind !== 'select_depth' ||
    depthField?.name !== 'depthChoice' ||
    !depthField.options?.some((option: any) => option.value === 'balanced')
  ) {
    throw new Error(`depth ask failed: text=${depthAsk.text}, ui=${JSON.stringify(depthAsk.ui)}`)
  }

  const captured: { request?: AgentAnalysisRequest } = {}
  const balancedOption = depthField.options.find((option: any) => option.value === 'balanced')
  const final = await runAgentChat(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我的未来几年财运如何？' },
        { role: 'assistant', content: timeConfirm.text },
        { role: 'user', content: `时间范围：${currentTimeOption.label}` },
        { role: 'assistant', content: depthAsk.text },
        { role: 'user', content: `报告长度：${balancedOption.label}` },
      ],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      pendingConfirmation: depthAsk.done.pendingConfirmation,
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async ({ request }) => {
        captured.request = request
        return '统一要素分析已生成。'
      },
    },
  )
  const finalText = await readStream(final.stream)
  const request = captured.request
  if (
    !finalText.includes('统一要素分析') ||
    !request ||
    request.depth !== 'balanced' ||
    request.slots.people?.[0]?.name !== '我' ||
    request.slots.matter?.focus?.[0] !== '财富' ||
    !request.slots.askedTime?.label.includes('未来 3 年')
  ) {
    throw new Error(`final analysis failed: text=${finalText}, request=${JSON.stringify(captured.request)}`)
  }

  const conciseGeneration = getAgentAnalysisGenerationOptions({ ...request, depth: 'concise' }, 'instant')
  const balancedGeneration = getAgentAnalysisGenerationOptions({ ...request, depth: 'balanced' }, 'instant')
  const detailedGeneration = getAgentAnalysisGenerationOptions({ ...request, depth: 'detailed' }, 'instant')
  if (
    conciseGeneration.maxTokens !== 6_000 ||
    balancedGeneration.maxTokens !== 24_000 ||
    detailedGeneration.maxTokens !== 128_000 ||
    conciseGeneration.thinking !== 'disabled' ||
    balancedGeneration.thinking !== 'disabled' ||
    detailedGeneration.thinking !== 'disabled'
  ) {
    throw new Error(`depth max token policy failed: concise=${JSON.stringify(conciseGeneration)}, balanced=${JSON.stringify(balancedGeneration)}, detailed=${JSON.stringify(detailedGeneration)}`)
  }

  const promptMessages = buildAgentAnalysisMessages(request)
  const promptText = messagesText(promptMessages)
  if (
    !promptText.includes('相关人物八字与大运') ||
    !promptText.includes('庚午') ||
    !promptText.includes('当前公历信息') ||
    !promptText.includes('当前时间锚点') ||
    !promptText.includes('所问时间') ||
    !promptText.includes('场景深化要求') ||
    !promptText.includes('财富现金流与风险规避') ||
    !promptText.includes('天干外显') ||
    !promptText.includes('地支内在') ||
    !promptText.includes('重大转折')
  ) {
    throw new Error(`dynamic prompt missing required context: ${promptText.slice(0, 1000)}`)
  }

  const featureFortunePromptText = messagesText(buildFeatureMessages(
    'fortune',
    {
      profile: selfProfile,
      start: '2026-05-01',
      end: '2026-12-31',
      granularity: 'month',
      focus: ['事业', '财富'],
      analysisAngle: '重点看职业发展、财富节奏和风险规避',
    },
    false,
    'thinking',
    { mode: 'balanced' },
  ))
  assertPromptIncludes('feature fortune scenario prompt', featureFortunePromptText, [
    '职业发展与人生规划',
    '场景深化要求',
    '天干外显',
    '地支内在',
    '重大转折',
  ])

  const featureHepanPromptText = messagesText(buildFeatureMessages(
    'hepan',
    {
      subtype: 'pair',
      relationLabel: '合作伙伴',
      participants: [selfProfile, xixiProfile],
      analysisAngle: '重点看合作方式、关系磨合和利益边界',
    },
    false,
    'thinking',
    { mode: 'balanced' },
  ))
  assertPromptIncludes('feature hepan scenario prompt', featureHepanPromptText, [
    '关系合盘与合作互动',
    '天干外显',
    '地支内在',
    '合作风险',
  ])

  const yearTimeConfirm = await collect(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '我今年运势如何？' }],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('year analysis should wait for time confirmation')
      },
    },
  )
  const yearTimeField = yearTimeConfirm.ui?.fields?.[0]
  const yearCurrentOption = yearTimeField?.options?.find((option: any) => option.value === 'current_time')
  if (
    yearTimeConfirm.done?.pendingConfirmation?.kind !== 'confirm_time' ||
    !yearTimeField?.options?.some((option: any) => option.value === 'future_12_months') ||
    !yearTimeField.options.some((option: any) => String(option.label).includes('从今天往后 12 个月'))
  ) {
    throw new Error(`year time options failed: text=${yearTimeConfirm.text}, ui=${JSON.stringify(yearTimeConfirm.ui)}`)
  }

  const focusAsk = await collect(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我今年运势如何？' },
        { role: 'assistant', content: yearTimeConfirm.text },
        { role: 'user', content: `时间范围：${yearCurrentOption.label}` },
      ],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      pendingConfirmation: yearTimeConfirm.done.pendingConfirmation,
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('year analysis should wait for focus selection')
      },
    },
  )
  const focusField = focusAsk.ui?.fields?.[0]
  if (
    focusAsk.done?.pendingConfirmation?.kind !== 'confirm_focus' ||
    focusField?.name !== 'focusChoice' ||
    focusField.multiple !== true
  ) {
    throw new Error(`focus multi-select ask failed: text=${focusAsk.text}, ui=${JSON.stringify(focusAsk.ui)}`)
  }

  const multiFocusDepthAsk = await collect(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我今年运势如何？' },
        { role: 'assistant', content: yearTimeConfirm.text },
        { role: 'user', content: `时间范围：${yearCurrentOption.label}` },
        { role: 'assistant', content: focusAsk.text },
        { role: 'user', content: '想看的话题：事业、财富' },
      ],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      pendingConfirmation: focusAsk.done.pendingConfirmation,
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async () => {
        throw new Error('year analysis should wait for depth after multi focus')
      },
    },
  )
  const multiDepthField = multiFocusDepthAsk.ui?.fields?.[0]
  if (multiFocusDepthAsk.done?.pendingConfirmation?.kind !== 'select_depth') {
    throw new Error(`multi-focus depth ask failed: text=${multiFocusDepthAsk.text}, ui=${JSON.stringify(multiFocusDepthAsk.ui)}`)
  }

  const multiCaptured: { request?: AgentAnalysisRequest } = {}
  const conciseOption = multiDepthField.options.find((option: any) => option.value === 'concise')
  const multiFinal = await runAgentChat(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我今年运势如何？' },
        { role: 'assistant', content: yearTimeConfirm.text },
        { role: 'user', content: `时间范围：${yearCurrentOption.label}` },
        { role: 'assistant', content: focusAsk.text },
        { role: 'user', content: '想看的话题：事业、财富' },
        { role: 'assistant', content: multiFocusDepthAsk.text },
        { role: 'user', content: `报告长度：${conciseOption.label}` },
      ],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      pendingConfirmation: multiFocusDepthAsk.done.pendingConfirmation,
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async ({ request }) => {
        multiCaptured.request = request
        return '多话题分析已生成。'
      },
    },
  )
  const multiFinalText = await readStream(multiFinal.stream)
  if (
    !multiFinalText.includes('多话题分析') ||
    !multiCaptured.request?.slots.matter?.focus.includes('事业') ||
    !multiCaptured.request.slots.matter.focus.includes('财富')
  ) {
    throw new Error(`multi-focus final failed: text=${multiFinalText}, request=${JSON.stringify(multiCaptured.request)}`)
  }

  const plain = await runAgentChat(
    {
      userId: 'smoke-user',
      messages: [{ role: 'user', content: '简单聊聊我最近状态' }],
      selectedProfile: selfProfile,
      participants: [selfProfile],
      timeoutMs: 10_000,
    },
    {
      directChat: async () => '先把节奏放慢一点，最近更适合恢复状态。',
      runAnalysisStream: async () => {
        throw new Error('plain chat should not run paid analysis')
      },
    },
  )
  const plainText = await readStream(plain.stream)
  if (!plainText.includes('恢复状态') || !plain.trace.some(trace => trace.action === 'direct_chat')) {
    throw new Error(`plain chat failed: ${plainText}`)
  }

  console.log(JSON.stringify({
    ok: true,
    fastTrace: fastResult.trace.map(trace => trace.action),
    noProfilePending: noProfile.done?.pendingConfirmation?.kind,
    timePending: timeConfirm.done?.pendingConfirmation?.kind,
    depthPending: depthAsk.done?.pendingConfirmation?.kind,
    finalTrace: final.trace.map(trace => trace.action),
    plainTrace: plain.trace.map(trace => trace.action),
  }))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
