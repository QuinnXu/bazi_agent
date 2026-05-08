// Runtime configuration for Vercel
export const runtime = 'nodejs'
export const maxDuration = 300

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAgentEventStream, type AgentMessage, type AgentTimeRangeContext } from '@/lib/agent-service'
import {
  normalizeAgentComplexityMode,
  type AgentComplexityMode,
  type AgentReportPreference,
} from '@/lib/agent-complexity'
import type { ChatFeatureContext, ChatParticipant } from '@/lib/chat-service'
import type { Participant } from '@/lib/feature-service'

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'unauthorized', message: '请先登录后再使用 Agent 对话' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const body = await req.json() as {
      messages: AgentMessage[]
      baziAnalysisResult?: string | null
      selectedProfile?: Participant | null
      participants?: ChatParticipant[]
      timeRanges?: AgentTimeRangeContext[]
      reportPreference?: AgentReportPreference | null
      featureContext?: ChatFeatureContext
      complexity?: AgentComplexityMode
      maxSteps?: number
      timeoutMs?: number
    }

    const complexity = normalizeAgentComplexityMode(body.complexity)

    const stream = createAgentEventStream({
      userId: user.id,
      messages: body.messages || [],
      baziAnalysisResult: body.baziAnalysisResult,
      selectedProfile: body.selectedProfile,
      participants: body.participants,
      timeRanges: body.timeRanges,
      reportPreference: body.reportPreference,
      featureContext: body.featureContext,
      complexity,
      maxSteps: body.maxSteps,
      timeoutMs: body.timeoutMs,
      signal: req.signal,
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[agent-chat] fatal error', error)
    return new Response(
      JSON.stringify({ error: 'Agent service temporarily unavailable' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
