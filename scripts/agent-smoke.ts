import { runAgentChat, runAgentChatEvents } from '../lib/agent-service'
import { buildAgentAnalysisMessages } from '../lib/agent-prompt-builder'
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

async function main() {
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
    !missingNamed.text.includes('不能凭空猜')
  ) {
    throw new Error(`missing named profile flow failed: text=${missingNamed.text}, ui=${JSON.stringify(missingNamed.ui)}`)
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

  const relationshipCaptured: { request?: AgentAnalysisRequest } = {}
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
      timeoutMs: 10_000,
    },
    {
      runAnalysisStream: async ({ request }) => {
        relationshipCaptured.request = request
        return '关系分析已生成。'
      },
    },
  )
  const relationshipFinalText = await readStream(relationshipFinal.stream)
  const relationshipPeople = relationshipCaptured.request?.slots.people.map(person => person.name) || []
  if (
    !relationshipFinalText.includes('关系分析') ||
    !relationshipPeople.includes('我') ||
    !relationshipPeople.includes('西西') ||
    relationshipCaptured.request?.slots.matter?.category !== 'relationship'
  ) {
    throw new Error(`relationship final failed: text=${relationshipFinalText}, request=${JSON.stringify(relationshipCaptured.request)}`)
  }

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

  const promptMessages = buildAgentAnalysisMessages(request)
  const promptText = promptMessages.map(message => JSON.stringify(message.content)).join('\n')
  if (
    !promptText.includes('相关人物八字与大运') ||
    !promptText.includes('庚午') ||
    !promptText.includes('当前公历信息') ||
    !promptText.includes('当前时间锚点') ||
    !promptText.includes('所问时间')
  ) {
    throw new Error(`dynamic prompt missing required context: ${promptText.slice(0, 1000)}`)
  }

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
