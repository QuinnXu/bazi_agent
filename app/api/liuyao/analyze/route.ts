export const runtime = 'nodejs'
export const maxDuration = 300

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { estimateTokensForText } from '@/lib/token-estimator'
import {
  runLiuYaoAnalysisStream,
  validateLiuYaoAnalysisRequest,
} from '@/lib/liuyao/analysis-service'
import {
  createPersistedTextStream,
  getOwnedLiuYaoSession,
  loadLiuYaoContext,
} from '@/lib/liuyao/server'
import { getLiuYaoAppleCost, resolveBillingPlan } from '@/lib/apple-costs'
import { completeAppleCharge, consumeApples, getOrResetQuota, refundApples } from '@/lib/quota'

export async function POST(req: Request) {
  let chargedUserId: string | null = null
  let chargedAppleCost = 0
  let chargeId: string | null = null
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return Response.json({ error: 'unauthorized', message: '请先登录后再解卦。' }, { status: 401 })
    }

    const body = await req.json() as { sessionId?: string }
    const sessionId = body.sessionId?.trim() || ''
    if (!sessionId) {
      return Response.json({ error: 'bad_request', message: '缺少 sessionId。' }, { status: 400 })
    }
    const [session, context] = await Promise.all([
      getOwnedLiuYaoSession(supabase, sessionId, user.id),
      loadLiuYaoContext(supabase, sessionId),
    ])
    if (!session) {
      return Response.json({ error: 'not_found', message: '卜卜卦会话不存在。' }, { status: 404 })
    }
    if (!context) {
      return Response.json({ error: 'not_ready', message: '完整卦盘还没有保存。' }, { status: 409 })
    }

    const analysisRequest = {
      reportDepth: 'balanced' as const,
      question: context.question,
      session: context.session,
      plot: context.plot,
    }
    validateLiuYaoAnalysisRequest(analysisRequest)

    const quota = await getOrResetQuota(user.id)
    const appleCost = getLiuYaoAppleCost('reading', resolveBillingPlan(quota.tier))
    const consumed = await consumeApples(user.id, appleCost, { enforceFairUse: true })
    if (!consumed.success) {
      if (consumed.fairUseLimited) {
        return Response.json({
          error: 'fair_use_limited',
          message: '当前账号的生成任务过于频繁，请稍后再试。',
          retryAfterSeconds: consumed.retryAfterSeconds,
        }, { status: 429 })
      }
      return Response.json({
        error: 'quota_exceeded',
        message: `完整解卦需要 ${appleCost} 个苹果🍎，当前总余额还剩 ${consumed.quota.remaining} 个。`,
        required: appleCost,
        remaining: consumed.quota.remaining,
        dailyLimit: consumed.quota.dailyLimit,
      }, { status: 403 })
    }
    chargedUserId = user.id
    chargedAppleCost = appleCost
    chargeId = consumed.chargeId

    const result = await runLiuYaoAnalysisStream(user.id, analysisRequest, req.signal)
    const stream = createPersistedTextStream(result.stream, async content => {
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          session_id: sessionId,
          role: 'assistant',
          content,
          mode: 'liuyao',
          model: result.model,
          tokens_used: result.inputTokens + estimateTokensForText(content),
          metadata: { kind: 'liuyao_analysis', status: 'completed' },
        })
      if (error) throw error
      await supabase
        .from('chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sessionId)
      if (chargeId) await completeAppleCharge(user.id, chargeId)
    }, async (_streamError, content) => {
      if (chargedUserId && chargeId) {
        if (!content.trim()) await refundApples(chargedUserId, chargeId)
        else await completeAppleCharge(chargedUserId, chargeId)
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-LLM-Model': result.model,
        'X-LLM-Task': result.task,
        'X-LLM-Input-Tokens': String(result.inputTokens),
        'X-Apple-Cost': String(appleCost),
      },
    })
  } catch (error) {
    if (chargedUserId && chargeId) {
      await refundApples(chargedUserId, chargeId).catch(() => undefined)
    }
    console.error('[liuyao-analyze] failed', error)
    return Response.json({
      error: 'analyze_failed',
      message: error instanceof Error ? error.message : '解卦服务暂时不可用。',
    }, { status: 500 })
  }
}
