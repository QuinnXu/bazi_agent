// Runtime configuration for Vercel
export const runtime = 'nodejs'
export const maxDuration = 300

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ServiceHttpError } from '@/lib/chat-service'
import {
  runFeatureAnalysisStream,
  type FeatureKind,
} from '@/lib/feature-service'
import {
  normalizeAgentComplexityMode,
  type AgentComplexityMode,
} from '@/lib/agent-complexity'

// ==================== Main handler ====================

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'unauthorized', message: '请先登录后再使用功能分析' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const body = (await req.json()) as {
      kind: FeatureKind
      params: any
      useUltraMode?: boolean
      chatMode?: 'classic' | 'agent'
      complexity?: AgentComplexityMode
    }

    const result = await runFeatureAnalysisStream(
      {
        userId: user.id,
        kind: body.kind,
        params: body.params,
        source: body.chatMode === 'agent' ? 'agent_tool' : 'feature_page',
        chargeApples: true,
        complexity: body.complexity
          ? normalizeAgentComplexityMode(body.complexity)
          : undefined,
      },
      { signal: req.signal },
    )

    return new Response(result.stream, {
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
    if (error instanceof ServiceHttpError) {
      return new Response(JSON.stringify(error.body), {
        status: error.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.error('[feature-analyze] fatal error', error)
    return new Response(
      JSON.stringify({ error: 'analyze_failed', message: '分析服务出错，已退还苹果' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
