export const runtime = 'nodejs'
export const maxDuration = 300

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { estimateTokensForText } from '@/lib/token-estimator'
import { runLiuYaoFollowUpStream } from '@/lib/liuyao/follow-up-service'
import {
  createPersistedTextStream,
  getOwnedLiuYaoSession,
  loadLiuYaoContext,
} from '@/lib/liuyao/server'

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'unauthorized', message: '请先登录。' }, { status: 401 })
    }

    const body = await req.json() as {
      sessionId?: string
      messages?: Array<{ role?: string; content?: string }>
    }
    const sessionId = body.sessionId?.trim() || ''
    const messages = (body.messages || [])
      .filter(message => (
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string' &&
        message.content.trim()
      ))
      .slice(-10)
      .map(message => ({
        role: message.role as 'user' | 'assistant',
        content: message.content!.trim().slice(0, 4000),
      }))
    const latest = messages.at(-1)
    if (!sessionId || !latest || latest.role !== 'user') {
      return Response.json({ error: 'bad_request', message: '追问内容不完整。' }, { status: 400 })
    }

    const latestStoredMessageQuery = supabase
      .from('chat_messages')
      .select('role, content, metadata')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const [session, context, latestMessageResult] = await Promise.all([
      getOwnedLiuYaoSession(supabase, sessionId, user.id),
      loadLiuYaoContext(supabase, sessionId),
      latestStoredMessageQuery,
    ])
    if (!session) {
      return Response.json({ error: 'not_found', message: '卜卜卦会话不存在。' }, { status: 404 })
    }
    if (!context) {
      return Response.json({ error: 'not_ready', message: '请先完成这一卦，再继续追问。' }, { status: 409 })
    }
    const { data: latestStoredMessage, error: latestMessageError } = latestMessageResult
    if (latestMessageError) throw latestMessageError

    const isRetryingUnansweredMessage =
      latestStoredMessage?.role === 'user' &&
      latestStoredMessage.content === latest.content &&
      (latestStoredMessage.metadata as { kind?: string } | null)?.kind === 'liuyao_followup'

    if (!isRetryingUnansweredMessage) {
      const { error: userMessageError } = await supabase
        .from('chat_messages')
        .insert({
          session_id: sessionId,
          role: 'user',
          content: latest.content,
          mode: 'liuyao',
          metadata: { kind: 'liuyao_followup', status: 'completed' },
        })
      if (userMessageError) throw userMessageError
    }

    const result = await runLiuYaoFollowUpStream(user.id, context, messages, req.signal)
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
          metadata: { kind: 'liuyao_followup', status: 'completed' },
        })
      if (error) throw error
      await supabase
        .from('chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sessionId)
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-LLM-Model': result.model,
        'X-LLM-Task': result.task,
        'X-LLM-Input-Tokens': String(result.inputTokens),
      },
    })
  } catch (error) {
    console.error('[liuyao-chat] failed', error)
    return Response.json({
      error: 'chat_failed',
      message: error instanceof Error ? error.message : '追问暂时没有接住。',
    }, { status: 500 })
  }
}
