// Runtime configuration for Vercel
export const runtime = 'nodejs'
export const maxDuration = 300

import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  runClassicChatStream,
  ServiceHttpError,
  type ChatFeatureContext,
  type ChatParticipant,
} from '@/lib/chat-service'

// ==================== Main Handler ====================

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'unauthorized', message: '请先登录后再使用聊天功能' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
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

    const { stream, model, inputTokens, task } = await runClassicChatStream({
      userId: user.id,
      messages,
      baziAnalysisResult,
      useUltraMode,
      participants,
      featureContext,
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-LLM-Model': model,
        'X-LLM-Task': task,
        'X-LLM-Input-Tokens': String(inputTokens),
      },
    })
  } catch (error) {
    if (error instanceof ServiceHttpError) {
      return new Response(JSON.stringify(error.body), {
        status: error.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.error('Chat API Error:', error)
    return new Response(
      JSON.stringify({ error: 'Chat service temporarily unavailable' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
