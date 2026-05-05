// Runtime configuration for Vercel
export const runtime = 'nodejs'
export const maxDuration = 300

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { paipan: PaipanClass } = require('@/tool/paipan')

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { consumeApples, getOrResetQuota } from '@/lib/quota'
import {
  callLLM,
  createUnifiedStreamProcessor,
  pickLlmTask,
} from '@/lib/llm'

// Helper function to get current date string with Chinese calendar GanZhi
function getCurrentDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const day = now.getDate()

  let ganzhiStr = ''
  try {
    const p = new PaipanClass()
    const result = p.GetGZ(year, month, day, 12, 0, 0)
    if (result) {
      const [tg, dz] = result
      const yearGZ = p.ctg[tg[0]] + p.cdz[dz[0]]
      const monthGZ = p.ctg[tg[1]] + p.cdz[dz[1]]
      const dayGZ = p.ctg[tg[2]] + p.cdz[dz[2]]
      ganzhiStr = `(${yearGZ}年${monthGZ}月${dayGZ}日)`
    }
  } catch (e) {
    console.error('GanZhi calculation error:', e)
  }

  return `${year}年${month}月${day}日${ganzhiStr}`
}

// ==================== System Prompts ====================
const BASE_PROMPT =
  "你是'卜卜象'，一个精通八字命理又善解人意积极乐观的温柔可爱小象。请主要用盲派八字的理论，结合旺衰、子平等分析并答复用户的咨询。"

const BAZI_INSTRUCTIONS = `请根据用户的诉求，先着重分析命主的性格，人生际遇或人生格局并针对成长，职业发展，人生规划，风险规避等方面做出分析和给出建议。
- 请结合不同的大运流年判断其变化的特点和需要注意的要点，同时针对特殊的大运流年组合做出专门的建议，结合格局的变化深化盲派的分析。
- 结合天干（外显或外在的表现等）与地支（内在、内心的想法、世纪情况等）分析命主在不同阶段的性格变化与矛盾冲突等，取得用户的信任但是顺从用户自身的判断。
- 请结合专列用户人生重大转折的时间节点做出提示和建议等。
- 请着重围绕用户的提问和关心的领域，根据以上方法展开相应话题的分析。
- 请在使用专业术语同时，用通俗易懂的语言结合具体情况展开解释。
- 用积极乐观的态度给予回复
- 在多轮对话不要过分重复已经提到的内容，对话过程自然流畅，符合人设
- 请始终使用『趋势』『倾向』『建议』『参考』等柔性措辞，避免任何绝对化、命定式判断。`

// ==================== Feature follow-up context ====================
interface ChatParticipant {
  name: string
  baziText?: string | null
  pillars?: string | null
}

interface ChatFeatureContext {
  kind: 'hepan' | 'fortune' | 'avatar' | 'lifepath'
  summary?: string
}

const FEATURE_KIND_LABEL: Record<ChatFeatureContext['kind'], string> = {
  hepan: '合盘 / 应事',
  fortune: '近期运势',
  avatar: '头像分析',
  lifepath: '人生脉络与总体分析',
}

function truncateBazi(text: string | null | undefined, max = 800): string {
  if (!text) return '（暂无完整命盘）'
  return text.length > max ? text.slice(0, max) + '\n...（已截断）' : text
}

function buildFollowUpAddendum(
  participants?: ChatParticipant[],
  ctx?: ChatFeatureContext,
): string {
  let block = ''
  if (ctx) {
    block += `\n\n【上下文：刚刚完成的分析】\n类型：${FEATURE_KIND_LABEL[ctx.kind]}`
    if (ctx.summary) block += `\n概要：${ctx.summary}`
    block += `\n请基于先前给出的分析与下方人物信息继续答复用户的追问，不要重复已说过的命盘基础信息。`
  }
  if (participants && participants.length > 0) {
    const lines = participants
      .map((p, i) => `### 人物${i + 1}：${p.name || '未命名'}${p.pillars ? `\n四柱：${p.pillars}` : ''}\n${truncateBazi(p.baziText)}`)
      .join('\n\n')
    block += `\n\n【参与者命盘】\n${lines}`
  }
  return block
}

function buildSystemPrompt(
  baziAnalysisResult: string | null,
  participants?: ChatParticipant[],
  featureContext?: ChatFeatureContext,
): string {
  let systemPrompt = BASE_PROMPT

  if (baziAnalysisResult || (participants && participants.length > 0) || featureContext) {
    systemPrompt += BAZI_INSTRUCTIONS
    systemPrompt += `\n现在是${getCurrentDateString()}`
    if (baziAnalysisResult) {
      systemPrompt += `\n\n【用户八字信息】\n${baziAnalysisResult}`
    }
    systemPrompt += buildFollowUpAddendum(participants, featureContext)
  }

  return systemPrompt
}

// ==================== Main Handler ====================
export async function POST(req: Request) {
  try {
    // --- Auth check ---
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'unauthorized', message: '请先登录后再使用聊天功能' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const {
      messages,
      baziAnalysisResult,
      useUltraMode = false,
      participants,
      featureContext,
    } = await req.json() as {
      messages: any[]
      baziAnalysisResult?: string | null
      useUltraMode?: boolean
      participants?: ChatParticipant[]
      featureContext?: ChatFeatureContext
    }

    // --- Peek quota BEFORE consuming so we can decide first-of-day routing ---
    const preQuota = await getOrResetQuota(user.id)
    const preUsedToday = preQuota.usedToday

    // --- 投喂 mode quota check (consume 1 apple) ---
    if (useUltraMode) {
      const { success, quota } = await consumeApples(user.id, 1)
      if (!success) {
        return new Response(
          JSON.stringify({
            error: 'quota_exceeded',
            message: '今天的苹果已经吃完啦🍎 明天卜卜象会带来新的苹果~',
            remaining: quota.remaining,
            dailyLimit: quota.dailyLimit,
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    // --- Pick model task ---
    const task = pickLlmTask({
      consumesApple: useUltraMode,
      preUsedToday,
      isAvatar: false, // chat route is text-only
    })

    // --- Build system + messages ---
    const systemPrompt = buildSystemPrompt(
      baziAnalysisResult ?? null,
      participants,
      featureContext,
    )
    const messagesWithSystem = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ]

    // --- Call upstream + stream back ---
    const { response } = await callLLM(messagesWithSystem, task)
    const stream = createUnifiedStreamProcessor(response, { drip: true })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Chat API Error:', error)
    return new Response(
      JSON.stringify({ error: 'Chat service temporarily unavailable' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
