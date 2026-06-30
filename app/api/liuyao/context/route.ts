export const runtime = 'nodejs'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getOwnedLiuYaoSession } from '@/lib/liuyao/server'
import type { LiuYaoContextPayload } from '@/lib/liuyao/types'

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'unauthorized', message: '请先登录。' }, { status: 401 })
    }

    const body = await req.json() as {
      sessionId?: string
      context?: LiuYaoContextPayload
    }
    const sessionId = body.sessionId?.trim() || ''
    const context = body.context
    if (
      !sessionId ||
      !context ||
      context.status !== 'completed' ||
      context.session?.lines?.length !== 6 ||
      context.plot?.payload?.linesBottomToTop?.length !== 6
    ) {
      return Response.json({ error: 'bad_request', message: '完整卦盘参数缺失。' }, { status: 400 })
    }
    const session = await getOwnedLiuYaoSession(supabase, sessionId, user.id)
    if (!session) {
      return Response.json({ error: 'not_found', message: '卜卜卦会话不存在。' }, { status: 404 })
    }

    const { error } = await supabase
      .from('chat_session_contexts')
      .upsert({
        session_id: sessionId,
        context_type: 'liuyao_hexagram',
        version: 1,
        payload: context as unknown as Record<string, unknown>,
      }, { onConflict: 'session_id,context_type' })
    if (error) throw error

    await supabase
      .from('chat_sessions')
      .update({
        summary: `${context.plot.view.title}｜${context.question}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)

    return Response.json({ success: true })
  } catch (error) {
    console.error('[liuyao-context] save failed', error)
    return Response.json({ error: 'save_failed', message: '完整卦盘暂时无法保存。' }, { status: 500 })
  }
}
