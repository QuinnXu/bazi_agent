export const runtime = 'nodejs'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  getOwnedLiuYaoSession,
  loadLiuYaoContext,
  loadLiuYaoMessages,
} from '@/lib/liuyao/server'

export async function GET(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'unauthorized', message: '请先登录。' }, { status: 401 })
    }

    const sessionId = new URL(req.url).searchParams.get('sessionId')?.trim()
    if (!sessionId) {
      return Response.json({ error: 'bad_request', message: '缺少 sessionId。' }, { status: 400 })
    }
    const session = await getOwnedLiuYaoSession(supabase, sessionId, user.id)
    if (!session) {
      return Response.json({ error: 'not_found', message: '卜卜卦会话不存在。' }, { status: 404 })
    }

    const [messages, context] = await Promise.all([
      loadLiuYaoMessages(supabase, sessionId),
      loadLiuYaoContext(supabase, sessionId),
    ])
    return Response.json({ session, messages, context })
  } catch (error) {
    console.error('[liuyao-session] load failed', error)
    return Response.json({ error: 'load_failed', message: '卜卜卦记录暂时无法加载。' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  let createdSessionId: string | null = null
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'unauthorized', message: '请先登录。' }, { status: 401 })
    }

    const body = await req.json() as { question?: string }
    const question = body.question?.trim() || ''
    if (!question || question.length > 120) {
      return Response.json({ error: 'bad_request', message: '请写下 1 到 120 字的问卦问题。' }, { status: 400 })
    }

    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .insert({
        user_id: user.id,
        title: question.length > 30 ? `${question.slice(0, 30)}...` : question,
        mode: 'liuyao',
        summary: `六爻问卦：${question}`,
      })
      .select('id')
      .single()
    if (sessionError || !session) throw sessionError || new Error('创建会话失败')
    createdSessionId = session.id

    const { error: messageError } = await supabase
      .from('chat_messages')
      .insert([
        {
          session_id: session.id,
          role: 'user',
          content: question,
          mode: 'liuyao',
          metadata: { kind: 'liuyao_question', status: 'completed' },
        },
        {
          session_id: session.id,
          role: 'assistant',
          content: '先让问题安静地落在心里。准备好后，我们一起完成六次起爻。',
          mode: 'liuyao',
          metadata: { kind: 'liuyao_ritual', status: 'pending' },
        },
      ])
    if (messageError) throw messageError

    return Response.json({ session }, { status: 201 })
  } catch (error) {
    if (createdSessionId) {
      await supabase.from('chat_sessions').delete().eq('id', createdSessionId)
    }
    console.error('[liuyao-session] create failed', error)
    return Response.json({ error: 'create_failed', message: '这次问卦没有保存下来，请重试。' }, { status: 500 })
  }
}
