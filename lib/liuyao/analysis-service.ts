import { callLLM, createUnifiedStreamProcessor, type LlmTaskKind } from '@/lib/llm'
import { createUsageTrackedStream } from '@/lib/token-usage'
import { estimateTokensForMessages } from '@/lib/token-estimator'
import type { LiuYaoAnalysisRequest } from '@/lib/liuyao/types'

export interface LiuYaoAnalysisResult {
  stream: ReadableStream
  model: string
  task: LlmTaskKind
  inputTokens: number
}

export function validateLiuYaoAnalysisRequest(value: unknown): asserts value is LiuYaoAnalysisRequest {
  const body = value as LiuYaoAnalysisRequest
  if (!body || typeof body !== 'object') throw new Error('请求体不能为空。')
  if (body.reportDepth !== 'balanced') throw new Error('解卦深度参数不正确。')
  if (!body.question?.trim()) throw new Error('缺少问卦问题。')
  if (!body.session || !Array.isArray(body.session.lines) || body.session.lines.length !== 6) {
    throw new Error('起卦记录必须包含完整六爻。')
  }
  if (!body.plot?.payload || body.plot.payload.linesBottomToTop.length !== 6) {
    throw new Error('排盘参数必须包含完整六爻。')
  }
  if (!body.plot?.view?.markdown) throw new Error('缺少六爻排盘结果。')
}

export async function runLiuYaoAnalysisStream(
  userId: string,
  request: LiuYaoAnalysisRequest,
  signal?: AbortSignal,
): Promise<LiuYaoAnalysisResult> {
  const messages = buildMessages(request)

  if (process.env.LIUYAO_LLM_MOCK === '1') {
    return {
      stream: createMockStream(request),
      model: 'mock-liuyao-analysis',
      task: 'free',
      inputTokens: estimateTokensForMessages(messages),
    }
  }

  const task: LlmTaskKind = 'free'
  const { response, config, inputTokens } = await callLLM(messages, task, {
    signal,
    temperature: 0.95,
    maxTokens: 48_000,
    thinking: 'enabled',
    reasoningEffort: 'high',
  })
  const stream = createUnifiedStreamProcessor(response, { chunking: 'immediate' })

  return {
    stream: createUsageTrackedStream(stream, {
      userId,
      source: 'feature_page',
      mode: 'feature',
      model: config.model,
      task,
      inputTokens,
      featureKind: 'liuyao',
    }),
    model: config.model,
    task,
    inputTokens,
  }
}

function buildMessages(body: LiuYaoAnalysisRequest) {
  return [
    {
      role: 'system',
      content: [
        '【角色定位】',
        '你是卜卜象，一个精通六爻预测又善解人意积极乐观的温柔可爱小象。',
        '',
        '【分析原则与隐藏思维链（Chain of Thought）】',
        '你在推演卦象时，内心必须严格遵循《增删卜易》的专业流程（但这只是你的内心草稿，不要机械地展示给用户）：',
        '1. 第一步：精准取用神，明确世爻与应爻。',
        '2. 第二步：将核心爻置于日月建中，细别旺相休囚死、真空假空、月破日冲。',
        '3. 第三步：审视动变之爻，剖析生克制化与合冲进退。',
        '4. 第四步：结合初到上六个爻位，将卦象映射到现实的层级或空间。',
        '5. 第五步：参考六神（青龙等）体察情绪、特质及事态细节。',
        '6. 第六步：综合推断最终吉凶成败倾向，寻找应期。',
        '',
        '【表达与人设规范（重点）】',
        '不要机械地套用“第一步、第二步”这样的冰冷步骤体来输出！',
        '1. 必须始终保持“温暖、通透、轻盈”的沟通基调，自然地自称“小象”。',
        '2. 直接用口语化、风格化的语言，像一位充满智慧、富有同理心的老朋友在和用户促膝长谈一样把你的结论娓娓道来。',
        '3. 把易理术语（如五行生克、暗动、化进退）自然地转化为用户听得懂的“现实剧情”和比喻，不要让人觉得在读八股文说明书。',
        '4. 遇到凶险或阻滞之象，要以人文关怀的口吻委婉指出，并重点给出化解或应对的思路。明确卦象仅为参考，最终决定权在用户手中。',
        '',
        '【输出结构规范】',
        '使用流畅自然的 Markdown 排版，可以利用自然的小节标题（如“🌟 小象看到的大象”、“☁️ 核心的阻力或助力”等，标题可自由发挥，但要有呼吸感）：',
        '- 开篇先给出一句温暖的问候，并轻巧地点明事情的核心走向（定个基调），后续多轮对话则不需要再次自我介绍打招呼而是直接回答问题。',
        '- 正文部分将卦理融入情节，分析当事人的状态（世爻/应爻）和事件的阻力与机会（动静生克/日月建）。',
        '- 结尾收拢思绪，给出从容、能趋吉避凶的具体建议。',
        '注意：不要出现“内部草稿”、“AI推理”、“六步分析法”等字眼。如果用户给的前提有缺失，轻柔地提一句你的假设即可。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请分析以下六爻排盘。',
        '',
        `【用户问题】\n${body.question}`,
        '',
        `【完整参数 JSON】\n${JSON.stringify(body, null, 2)}`,
        '',
        `【算法 Markdown】\n${body.plot.view.markdown}`,
      ].join('\n'),
    },
  ]
}

function createMockStream(body: LiuYaoAnalysisRequest): ReadableStream {
  const encoder = new TextEncoder()
  const calendar = body.plot.calendar
  const calendarLine = calendar
    ? `现在的时令是 ${calendar.stemBranchFull}，处于 ${calendar.dayEmptiness} 旬空，月破在 ${calendar.monthBreak}。`
    : `此时 ${body.plot.view.stemBranch || '_'} 的能量正笼罩着这卦。`
  const chunks = [
    `你好呀，小象已经帮你排好了「${body.plot.view.title}」这卦。让我来替你仔细瞧一瞧里面的玄机。\n\n`,
    `先给你吃颗定心丸：围绕着「${body.question}」这件事，盘面的主轴其实已经显现了。小象会在心里把代表你的世爻，和代表这件事的用神互相放进当下的日月大环境中比对。\n\n`,
    `大环境来看，${calendarLine} 感受着这份能量，卦象里的关键角色正在悄悄发生一些变化。\n\n`,
    '你看，卦里有几处活泼的变动，这就像事物发展的暗流。我会把五行的生克冲合，翻译成你现实里可能会遇到的波折或助力。\n\n',
    '结合卦象映射的现实场景与情绪变化，你近期的心态，或者这件事潜在的特质，也都写在了里面喔。\n\n',
    '最后小象再帮你收拢一下：事情的走向虽然有倾向，但造化始终在你心里。小象的这些卦理推演，希望能给你一些从容应对的灵感与选择的空间呀~\n',
  ]
  return new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
        await new Promise(resolve => setTimeout(resolve, 120))
      }
      controller.close()
    },
  })
}
