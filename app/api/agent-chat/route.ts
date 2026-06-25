// Runtime configuration for Vercel
export const runtime = 'nodejs'
export const maxDuration = 300

import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  createAgentEventStream,
  type AgentMessage,
  type AgentPendingConfirmation,
  type AgentTimeRangeContext,
} from '@/lib/agent-service'
import {
  normalizeAgentComplexityMode,
  type AgentComplexityMode,
  type AgentReportPreference,
} from '@/lib/agent-complexity'
import type { ChatFeatureContext, ChatParticipant } from '@/lib/chat-service'
import type { AgentParticipant } from '@/lib/agent-workflow-types'
import {
  getOrCreateGuestTrial,
  recordGuestFinalAnswer,
} from '@/lib/guest-trial'
import { GUEST_FIRST_QA_FLOW } from '@/lib/guest-first-qa-flow'

function guestFlowOutputDepth() {
  const mode = GUEST_FIRST_QA_FLOW.reportPreference.mode
  return mode === 'balanced' || mode === 'detailed' ? mode : 'concise'
}

function forceGuestDepthOnDraftSlots(value: any) {
  if (!value || typeof value !== 'object') return value
  return {
    ...value,
    outputDepth: guestFlowOutputDepth(),
    confidence: {
      ...(value.confidence || {}),
      depth: 'high',
    },
  }
}

function normalizeGuestPendingConfirmation(
  pending?: AgentPendingConfirmation | null,
): AgentPendingConfirmation | null {
  if (!pending) return null
  return {
    ...pending,
    draftSlots: forceGuestDepthOnDraftSlots((pending as any).draftSlots),
    params: (pending as any).params?.draftSlots
      ? {
          ...(pending as any).params,
          draftSlots: forceGuestDepthOnDraftSlots((pending as any).params.draftSlots),
        }
      : (pending as any).params,
    executionProfile: {
      ...((pending as any).executionProfile || {}),
      reportPreference: GUEST_FIRST_QA_FLOW.reportPreference,
      complexity: GUEST_FIRST_QA_FLOW.complexity,
    },
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    const body = await req.json() as {
      messages: AgentMessage[]
      baziAnalysisResult?: string | null
      selectedProfile?: AgentParticipant | null
      participants?: ChatParticipant[]
      timeRanges?: AgentTimeRangeContext[]
      reportPreference?: AgentReportPreference | null
      sessionSummary?: string | null
      pendingConfirmation?: AgentPendingConfirmation | null
      featureContext?: ChatFeatureContext
      complexity?: AgentComplexityMode
      maxSteps?: number
      timeoutMs?: number
      guestOnboarding?: boolean
      guestOnboardingQuestion?: string | null
    }

    const isGuestTrial = Boolean(authError || !user)
    const guestTrial = isGuestTrial ? await getOrCreateGuestTrial() : null
    if (guestTrial && guestTrial.remainingFinalAnswers <= 0) {
      return new Response(
        JSON.stringify({
          error: 'guest_trial_exhausted',
          message: '这次试用已经完成啦。登录或注册后，小象就能继续陪你聊，并把这段记录保存下来。',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const complexity = isGuestTrial ? GUEST_FIRST_QA_FLOW.complexity : normalizeAgentComplexityMode(body.complexity)
    const pendingConfirmation = isGuestTrial
      ? normalizeGuestPendingConfirmation(body.pendingConfirmation)
      : body.pendingConfirmation
    const reportPreference = isGuestTrial
      ? GUEST_FIRST_QA_FLOW.reportPreference
      : body.reportPreference

    const stream = createAgentEventStream({
      userId: user?.id || `guest:${guestTrial?.keyHash.slice(0, 16) || 'trial'}`,
      messages: body.messages || [],
      baziAnalysisResult: body.baziAnalysisResult,
      selectedProfile: body.selectedProfile,
      participants: body.participants,
      timeRanges: body.timeRanges,
      reportPreference,
      sessionSummary: body.sessionSummary,
      pendingConfirmation,
      featureContext: body.featureContext,
      complexity,
      maxSteps: body.maxSteps,
      timeoutMs: body.timeoutMs,
      guestTrial: isGuestTrial,
      guestOnboarding: isGuestTrial && body.guestOnboarding === true,
      guestOnboardingQuestion: isGuestTrial
        ? String(body.guestOnboardingQuestion || '').slice(0, 1200)
        : undefined,
      skipUsageTracking: isGuestTrial,
    }, {}, {
      onEvent: async event => {
        if (!guestTrial) return
        if (event.type === 'done' && !event.pendingConfirmation) {
          await recordGuestFinalAnswer(guestTrial.keyHash)
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...(guestTrial
          ? { 'X-Guest-Trial-Remaining': String(guestTrial.remainingFinalAnswers) }
          : {}),
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
