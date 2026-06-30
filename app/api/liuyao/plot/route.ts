export const runtime = 'nodejs'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getOwnedLiuYaoSession } from '@/lib/liuyao/server'
import { buildLiuYaoPlotResult } from '@/lib/liuyao/plot'
import type { DivinationSession, LiuYaoContextPayload } from '@/lib/liuyao/types'

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return Response.json({ error: 'unauthorized', message: '请先登录后再起卦。' }, { status: 401 })
    }

    const body = await req.json() as {
      sessionId?: string
      session?: DivinationSession
      persistContext?: boolean
      timezoneOffsetMinutes?: number
    }
    const offsetMinutes = Number(body.timezoneOffsetMinutes)
    if (!body.session || !Number.isFinite(offsetMinutes) || Math.abs(offsetMinutes) > 14 * 60) {
      return Response.json({ error: 'bad_request', message: '排盘参数不完整。' }, { status: 400 })
    }

    const plot = buildLiuYaoPlotResult(body.session, offsetMinutes)

    if (body.persistContext) {
      const sessionId = body.sessionId?.trim() || ''
      if (!sessionId) {
        return Response.json({ error: 'bad_request', message: '缺少 sessionId。' }, { status: 400 })
      }
      const session = await getOwnedLiuYaoSession(supabase, sessionId, user.id)
      if (!session) {
        return Response.json({ error: 'not_found', message: '卜卜卦会话不存在。' }, { status: 404 })
      }
      const context: LiuYaoContextPayload = {
        question: body.session.question,
        status: 'completed',
        session: body.session,
        plot,
      }
      const { error: contextError } = await supabase
        .from('chat_session_contexts')
        .upsert({
          session_id: sessionId,
          context_type: 'liuyao_hexagram',
          version: 1,
          payload: context as unknown as Record<string, unknown>,
        }, { onConflict: 'session_id,context_type' })
      if (contextError) throw contextError

      const { error: sessionError } = await supabase
        .from('chat_sessions')
        .update({
          summary: `${plot.view.title}｜${body.session.question}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
      if (sessionError) throw sessionError
    }

    return Response.json({
      plot,
    })
  } catch (error) {
    console.error('[liuyao-plot] failed', error)
    return Response.json({
      error: 'plot_failed',
      message: error instanceof Error ? error.message : '排盘暂时不可用。',
    }, { status: 500 })
  }
}
