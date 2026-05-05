// Runtime configuration for Vercel
export const runtime = 'nodejs'
export const maxDuration = 300

import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  consumeApples,
  refundApples,
  getOrResetQuota,
} from '@/lib/quota'
import {
  FEATURE_COSTS,
  FEATURE_SENTINELS,
  getFeaturePrompt,
  type FeatureKind,
} from '@/lib/feature-prompts'
import { buildGanZhiTable, type Granularity } from '@/lib/calendar'
import {
  callLLM,
  createUnifiedStreamProcessor,
  pickLlmTask,
} from '@/lib/llm'

// ==================== Types ====================

interface Participant {
  name: string
  baziText?: string | null
  pillars?: string | null
}

interface HepanParams {
  subtype: 'pair' | 'multi' | 'event'
  relationLabel?: string
  eventDesc?: string
  participants: Participant[]
}

interface FortuneParams {
  profile: Participant
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD
  granularity: Granularity
  focus: string[]
}

interface AvatarParams {
  imageDataUrl: string // data:image/...;base64,...
  combineBazi: boolean
  profile?: Participant | null
}

interface LifePathParams {
  profile: Participant
}

// ==================== Build user message text ====================

function truncate(text: string | null | undefined, max = 1200): string {
  if (!text) return '（暂无完整命盘文本）'
  return text.length > max ? text.slice(0, max) + '\n...（已截断）' : text
}

function describeParticipant(p: Participant, idx?: number): string {
  const head = idx !== undefined ? `### 人物${idx + 1}：${p.name || '未命名'}` : `### ${p.name || '未命名'}`
  const pillars = p.pillars ? `\n四柱：${p.pillars}` : ''
  const bazi = p.baziText ? `\n命盘信息：\n${truncate(p.baziText)}` : ''
  return `${head}${pillars}${bazi}`
}

function buildHepanUserMessage(params: HepanParams): string {
  const subtypeLabel =
    params.subtype === 'pair'
      ? '双人合盘'
      : params.subtype === 'multi'
      ? '多人合盘'
      : '应事分析'

  const blocks = params.participants
    .map((p, i) => describeParticipant(p, i))
    .join('\n\n')

  const relation = params.relationLabel
    ? `\n\n【关系类型】${params.relationLabel}`
    : ''
  const event = params.eventDesc
    ? `\n\n【应事 / 关注事件描述】${params.eventDesc}`
    : ''

  return `${FEATURE_SENTINELS.hepan}（${subtypeLabel}）

请基于以下 ${params.participants.length} 位参与者的八字信息进行合盘分析。

${blocks}${relation}${event}

请按系统提示中要求的结构输出。`
}

function buildFortuneUserMessage(params: FortuneParams): string {
  const startDate = new Date(params.start)
  const endDate = new Date(params.end)
  const calendarTable = buildGanZhiTable(startDate, endDate, params.granularity)
  const focusLabel =
    params.focus.length > 0 ? params.focus.join('、') : '整体运势'

  return `${FEATURE_SENTINELS.fortune}（${params.granularity === 'day' ? '逐日' : '逐月'}）

【命主信息】
${describeParticipant(params.profile)}

【时间范围】${params.start} ~ ${params.end}
【关注方向】${focusLabel}

${calendarTable}

请基于命主八字 + 上方时间表，按系统提示中要求的结构进行近期运势推演。每个关注方向独立成段。`
}

function buildAvatarUserText(params: AvatarParams): string {
  const profileBlock =
    params.combineBazi && params.profile
      ? `\n【命主信息（用于五行/风格倾向参考）】\n${describeParticipant(params.profile)}`
      : params.combineBazi
      ? `\n【提示】用户希望结合八字，但未提供命主信息，请略过五行风格段并提示用户补充。`
      : `\n【提示】用户未开启结合八字，请略过五行风格段。`

  return `${FEATURE_SENTINELS.avatar}

请分析下方上传的头像图片，并结合命理参考给出建议。
${profileBlock}

请按系统提示中要求的 6 段式结构输出。`
}

function buildLifePathUserMessage(params: LifePathParams): string {
  return `${FEATURE_SENTINELS.lifepath}

【命主信息】
${describeParticipant(params.profile)}

请按系统提示中要求的结构，做一次贯穿一生的脉络梳理与总体分析。`
}

// ==================== Refundable stream wrapper ====================
// Wrap upstream stream so an empty / errored stream triggers a refund.

function createRefundableStream(
  upstream: ReadableStream,
  refundOnFail: () => Promise<void>,
): ReadableStream {
  let receivedAnyChars = false
  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value && value.length > 0) receivedAnyChars = true
          controller.enqueue(value)
        }
        if (!receivedAnyChars) {
          // Empty upstream — treat as failure
          await refundOnFail()
        }
        controller.close()
      } catch (err) {
        console.error('[feature-analyze] stream error, refunding:', err)
        try {
          await refundOnFail()
        } catch {
          /* ignore */
        }
        try {
          controller.error(err)
        } catch {
          /* ignore */
        }
      }
    },
  })
}

// ==================== Main handler ====================

export async function POST(req: Request) {
  let userId: string | null = null
  let consumedCost = 0
  let consumed = false

  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'unauthorized', message: '请先登录后再使用功能分析' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )
    }
    userId = user.id

    const body = (await req.json()) as {
      kind: FeatureKind
      params: any
      // useUltraMode is ignored here — feature pipeline routes via task selection
      useUltraMode?: boolean
    }

    if (!body || !body.kind || !FEATURE_COSTS[body.kind]) {
      return new Response(
        JSON.stringify({ error: 'invalid_request', message: '功能类型无效' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const cost = FEATURE_COSTS[body.kind]
    consumedCost = cost

    // 1) Peek quota before consuming so we know if this is the first apple of day
    const preQuota = await getOrResetQuota(userId)
    const preUsedToday = preQuota.usedToday

    // 2) Consume apples
    const { success, quota } = await consumeApples(userId, cost)
    if (!success) {
      return new Response(
        JSON.stringify({
          error: 'quota_exceeded',
          message: `这个功能需要 ${cost} 个苹果🍎，今天的库存不太够啦~ 明天再来或者给卜卜象投喂一下吧`,
          required: cost,
          remaining: quota.remaining,
          dailyLimit: quota.dailyLimit,
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      )
    }
    consumed = true

    // 3) Pick task: feature route is always apple-consuming
    const task = pickLlmTask({
      consumesApple: true,
      preUsedToday,
      isAvatar: body.kind === 'avatar',
    })

    // For prompt selection: useUltra is true whenever upstream is a Gemini-style
    // multimodal/reasoning model (apple_first / apple_avatar). For apple_other
    // we use the DeepSeek prompt variant.
    const useUltraPrompt = task === 'apple_first' || task === 'apple_avatar'
    const systemPrompt = getFeaturePrompt(body.kind, useUltraPrompt)

    let messagesWithSystem: any[] = []

    if (body.kind === 'avatar') {
      const params = body.params as AvatarParams
      if (!params?.imageDataUrl || !params.imageDataUrl.startsWith('data:')) {
        await refundApples(userId, cost)
        return new Response(
          JSON.stringify({ error: 'invalid_request', message: '头像图片缺失或格式错误' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        )
      }
      messagesWithSystem = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: buildAvatarUserText(params) },
            { type: 'image_url', image_url: { url: params.imageDataUrl } },
          ],
        },
      ]
    } else {
      let userMessageText = ''
      if (body.kind === 'hepan') {
        userMessageText = buildHepanUserMessage(body.params as HepanParams)
      } else if (body.kind === 'fortune') {
        userMessageText = buildFortuneUserMessage(body.params as FortuneParams)
      } else {
        userMessageText = buildLifePathUserMessage(body.params as LifePathParams)
      }
      messagesWithSystem = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessageText },
      ]
    }

    // 4) Call upstream
    let upstreamResponse: Response
    try {
      const result = await callLLM(messagesWithSystem, task)
      upstreamResponse = result.response
    } catch (err) {
      console.error('[feature-analyze] upstream call failed', err)
      await refundApples(userId, cost)
      return new Response(
        JSON.stringify({ error: 'analyze_failed', message: '分析服务暂时不可用，已退还苹果' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // 5) Stream back with refund-on-empty wrapper
    const baseStream = createUnifiedStreamProcessor(upstreamResponse, { drip: true })
    const refundOnFail = async () => {
      if (userId) {
        try {
          await refundApples(userId, cost)
        } catch (e) {
          console.error('[feature-analyze] refund failed', e)
        }
      }
    }
    const finalStream = createRefundableStream(baseStream, refundOnFail)

    return new Response(finalStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[feature-analyze] fatal error', error)
    if (consumed && userId) {
      try {
        await refundApples(userId, consumedCost)
      } catch (e) {
        console.error('[feature-analyze] refund-on-fatal failed', e)
      }
    }
    return new Response(
      JSON.stringify({ error: 'analyze_failed', message: '分析服务出错，已退还苹果' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
