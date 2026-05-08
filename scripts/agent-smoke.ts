import { runAgentChat, runAgentChatEvents } from '../lib/agent-service'

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

async function main() {
  const fastResult = await runAgentChat(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '你好' },
      ],
      maxSteps: 2,
      timeoutMs: 10_000,
    },
    {
      planner: async () => {
        throw new Error('planner should not be called for simple greetings')
      },
    },
  )
  const fastText = await readStream(fastResult.stream)
  if (!fastText.includes('我是卜卜象') || !fastResult.trace.some(t => t.action === 'fast_answer')) {
    throw new Error(`fast path failed: ${fastText}`)
  }

  const askResult = await runAgentChat(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '帮我看近期事业运' },
      ],
      maxSteps: 2,
      timeoutMs: 10_000,
    },
    {
      planner: async () => JSON.stringify({
        action: 'ask',
        content: '可以呀，请先补充命主和想看的时间范围。',
        missing: ['profile', 'start', 'end'],
      }),
    },
  )
  const askText = await readStream(askResult.stream)
  if (!askText.includes('请先补充命主')) {
    throw new Error(`ask path failed: ${askText}`)
  }

  let toolCalls = 0
  const plans = [
    JSON.stringify({
      action: 'tool_call',
      tool: 'feature_analyze',
      kind: 'fortune',
      params: {
        profile: { name: '小明', pillars: '甲子 乙丑 丙寅 丁卯', baziText: '测试命盘' },
        start: '2026-05-01',
        end: '2026-05-07',
        granularity: 'day',
        focus: ['事业'],
      },
      reason: '用户参数完整，需要调用近期运势工具',
    }),
    JSON.stringify({
      action: 'answer',
      content: '工具已经完成，我会把事业趋势和行动建议整合给你。',
    }),
  ]

  const toolResult = await runAgentChat(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '帮我看近期事业运' },
        { role: 'assistant', content: askText },
        { role: 'user', content: '小明，2026-05-01 到 2026-05-07，看事业' },
      ],
      selectedProfile: { name: '小明', pillars: '甲子 乙丑 丙寅 丁卯', baziText: '测试命盘' },
      maxSteps: 3,
      timeoutMs: 10_000,
    },
    {
      planner: async () => plans.shift() || JSON.stringify({
        action: 'answer',
        content: 'fallback',
      }),
      runFeature: async ({ kind }) => {
        toolCalls += 1
        return `${kind} 工具结果：事业节奏先稳后动。`
      },
    },
  )
  const toolText = await readStream(toolResult.stream)
  if (toolCalls !== 1 || !toolText.includes('事业节奏先稳后动')) {
    throw new Error(`tool path failed: calls=${toolCalls}, text=${toolText}`)
  }

  const streamPlans = [
    JSON.stringify({
      action: 'tool_call',
      tool: 'feature_analyze',
      kind: 'fortune',
      params: {
        profile: { name: '小明', pillars: '甲子 乙丑 丙寅 丁卯', baziText: '测试命盘' },
        start: '2026-05-01',
        end: '2026-07-31',
        granularity: 'month',
        focus: ['整体'],
      },
      reason: '用户参数完整，需要调用逐月长报告工具',
    }),
  ]
  const streamEvents: string[] = []
  let streamText = ''
  for await (const event of runAgentChatEvents(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '帮小明看接下来几个月' },
      ],
      selectedProfile: { name: '小明', pillars: '甲子 乙丑 丙寅 丁卯', baziText: '测试命盘' },
      maxSteps: 2,
      timeoutMs: 10_000,
    },
    {
      planner: async () => streamPlans.shift() || JSON.stringify({ action: 'answer', content: 'fallback' }),
      runFeatureStream: async () => new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          controller.enqueue(encoder.encode('第一段'))
          controller.enqueue(encoder.encode('第二段'))
          controller.close()
        },
      }),
    },
  )) {
    streamEvents.push(event.type)
    if (event.type === 'delta') streamText += event.content
  }
  if (!streamEvents.includes('delta') || streamEvents.indexOf('delta') > streamEvents.indexOf('done') || streamText !== '第一段第二段') {
    throw new Error(`stream tool path failed: events=${streamEvents.join(',')}, text=${streamText}`)
  }

  let futureYearsParams: any = null
  const futureYearsResult = await runAgentChat(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我的未来几年财运如何？' },
      ],
      selectedProfile: { name: '我', pillars: '甲戌 癸酉 壬子 戊申', baziText: '测试命盘' },
      maxSteps: 2,
      timeoutMs: 10_000,
    },
    {
      planner: async () => JSON.stringify({
        action: 'tool_call',
        tool: 'feature_analyze',
        kind: 'fortune',
        params: {
          profile: { name: '我', pillars: '甲戌 癸酉 壬子 戊申', baziText: '测试命盘' },
          start: '2026-05',
          end: '2030-12',
          granularity: 'month',
          focus: ['财富'],
        },
        reason: '用户询问未来几年财运',
      }),
      runFeature: async ({ params }) => {
        futureYearsParams = params
        return '多年财运报告已生成。'
      },
    },
  )
  const futureYearsText = await readStream(futureYearsResult.stream)
  if (
    !futureYearsText.includes('多年财运报告') ||
    !/^\d{4}-\d{2}-\d{2}$/.test(futureYearsParams?.start || '') ||
    futureYearsParams?.end !== '2030-12-31' ||
    futureYearsParams?.granularity !== 'month'
  ) {
    throw new Error(`future years normalization failed: ${JSON.stringify(futureYearsParams)}, text=${futureYearsText}`)
  }

  const formEvents: any[] = []
  let formText = ''
  for await (const event of runAgentChatEvents(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我最近适合做什么' },
        { role: 'assistant', content: '请提供出生年月日时、历法和性别。' },
        { role: 'user', content: '1994.9.23 15:20 公历 男' },
      ],
      maxSteps: 2,
      timeoutMs: 10_000,
    },
  )) {
    formEvents.push(event)
    if (event.type === 'delta') formText += event.content
  }
  const formUi = formEvents.find(event => event.type === 'ui')?.ui
  if (
    !formText.includes('Bazi Analysis Results') ||
    formUi?.type !== 'human_input_request' ||
    formUi?.kind !== 'bazi_profile'
  ) {
    throw new Error(`bazi inline form path failed: text=${formText}, ui=${JSON.stringify(formUi)}`)
  }

  const noProfileEvents: any[] = []
  for await (const event of runAgentChatEvents(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '我的未来几年财运如何？' },
      ],
      maxSteps: 2,
      timeoutMs: 10_000,
    },
    {
      planner: async () => JSON.stringify({
        action: 'tool_call',
        tool: 'feature_analyze',
        kind: 'fortune',
        params: {
          profile: { name: '我', pillars: '甲戌 癸酉 壬子 戊申', baziText: '模型不应注入的命盘' },
          start: '2026-05',
          end: '2030-12',
          granularity: 'month',
          focus: ['财富'],
        },
        reason: '用户询问未来几年财运',
      }),
      runFeature: async () => {
        throw new Error('feature tool should not run without a verified profile')
      },
    },
  )) {
    noProfileEvents.push(event)
  }
  const noProfileUi = noProfileEvents.find(event => event.type === 'ui')?.ui
  if (noProfileUi?.type !== 'human_input_request' || noProfileUi?.kind !== 'bazi_profile') {
    throw new Error(`no-profile HITL failed: ${JSON.stringify(noProfileEvents)}`)
  }

  const partialAbortEvents: any[] = []
  let partialAbortText = ''
  for await (const event of runAgentChatEvents(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '帮小明写一个很长的未来几个月报告' },
      ],
      selectedProfile: { name: '小明', pillars: '甲子 乙丑 丙寅 丁卯', baziText: '测试命盘' },
      maxSteps: 2,
      timeoutMs: 10_000,
    },
    {
      planner: async () => JSON.stringify({
        action: 'tool_call',
        tool: 'feature_analyze',
        kind: 'fortune',
        params: {
          profile: { name: '小明', pillars: '甲子 乙丑 丙寅 丁卯', baziText: '测试命盘' },
          start: '2026-05-01',
          end: '2026-08-31',
          granularity: 'month',
          focus: ['整体'],
        },
        reason: '用户需要长报告',
      }),
      runFeatureStream: async () => {
        let sent = false
        return new ReadableStream({
          pull(controller) {
            if (!sent) {
              sent = true
              controller.enqueue(new TextEncoder().encode('已生成的前半段报告'))
              return
            }
            controller.error(new DOMException('This operation was aborted', 'AbortError'))
          },
        })
      },
    },
  )) {
    partialAbortEvents.push(event)
    if (event.type === 'delta') partialAbortText += event.content
  }
  if (
    !partialAbortText.includes('已生成的前半段报告') ||
    !partialAbortText.includes('接着写') ||
    !partialAbortEvents.some(event => event.type === 'done') ||
    partialAbortEvents.some(event => event.type === 'error')
  ) {
    throw new Error(`partial abort preservation failed: text=${partialAbortText}, events=${JSON.stringify(partialAbortEvents)}`)
  }

  let plannerPrompt = ''
  const promptResult = await runAgentChat(
    {
      userId: 'smoke-user',
      messages: [
        { role: 'user', content: '帮我看一下事业运' },
      ],
      maxSteps: 1,
      timeoutMs: 10_000,
    },
    {
      planner: async (messages) => {
        plannerPrompt = String(messages[0]?.content || '')
        return JSON.stringify({ action: 'answer', content: '需要先补充命主信息。' })
      },
    },
  )
  await readStream(promptResult.stream)
  if (
    plannerPrompt.includes('经典聊天人设与命理 prompt') ||
    plannerPrompt.includes('BAZI_INSTRUCTIONS') ||
    plannerPrompt.includes('你是资深命理师')
  ) {
    throw new Error(`planner prompt still contains business prompt: ${plannerPrompt.slice(0, 500)}`)
  }

  console.log(JSON.stringify({
    ok: true,
    fastTrace: fastResult.trace.map(t => t.action),
    askTrace: askResult.trace.map(t => t.action),
    toolTrace: toolResult.trace.map(t => t.action),
    formUi: formUi?.type,
    noProfileUi: noProfileUi?.type,
    futureYears: {
      start: futureYearsParams.start,
      end: futureYearsParams.end,
    },
    toolCalls,
  }))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
