// Runtime configuration for Vercel
export const runtime = 'nodejs'
export const maxDuration = 300

import { after, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/client'
import { startLlmRun, type LlmRunKind } from '@/lib/llm-runner'

const RUN_KINDS: LlmRunKind[] = ['classic_chat', 'agent_chat', 'feature_analyze']
const ACTIVE_STATUSES = ['queued', 'running'] as const
const RECENT_COMPLETED_LOOKBACK_MS = 5 * 60 * 1000
const RUN_SELECT_FIELDS = 'id, session_id, kind, status, output_text, final_metadata, assistant_message_id, error_message, created_at, updated_at'

function isDurableRunsSchemaUnavailable(error: unknown): boolean {
  const value = error as { code?: string; message?: string } | null
  return value?.code === 'PGRST205' ||
    String(value?.message || '').includes("Could not find the table 'public.llm_runs'")
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const serviceSupabase = createServiceClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized', message: '请先登录' }, { status: 401 })
    }

    const body = await req.json() as {
      kind?: LlmRunKind
      session_id?: string
      payload?: Record<string, any>
      client_message_id?: string | null
    }
    const kind = body.kind
    const sessionId = body.session_id
    if (!kind || !RUN_KINDS.includes(kind) || !sessionId || !body.payload) {
      return NextResponse.json({ error: 'invalid_request', message: '任务参数不完整' }, { status: 400 })
    }

    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()
    if (sessionError || !session) {
      return NextResponse.json({ error: 'forbidden', message: '会话不存在或无权限' }, { status: 403 })
    }

    if (body.client_message_id) {
      const { data: existing, error: existingError } = await serviceSupabase
        .from('llm_runs')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('client_message_id', body.client_message_id)
        .maybeSingle()
      if (isDurableRunsSchemaUnavailable(existingError)) {
        return NextResponse.json({ available: false, reason: 'schema_unavailable' })
      }
      if (existingError) throw existingError
      if (existing?.id) {
        if (existing.status === 'queued') {
          after(() => startLlmRun(existing.id))
        }
        return NextResponse.json({ run_id: existing.id, status: existing.status })
      }
    }

    const { data: run, error: insertError } = await serviceSupabase
      .from('llm_runs')
      .insert({
        user_id: user.id,
        session_id: sessionId,
        client_message_id: body.client_message_id || null,
        kind,
        status: 'queued',
        payload: body.payload,
      })
      .select('id, status')
      .single()
    if (insertError || !run) {
      if (isDurableRunsSchemaUnavailable(insertError)) {
        return NextResponse.json({ available: false, reason: 'schema_unavailable' })
      }
      console.error('[llm-runs] create failed', insertError)
      return NextResponse.json({ error: 'create_failed', message: '创建后台任务失败' }, { status: 500 })
    }

    after(() => startLlmRun(run.id))
    return NextResponse.json({ run_id: run.id, status: run.status })
  } catch (error) {
    console.error('[llm-runs] POST fatal', error)
    return NextResponse.json({ error: 'internal_error', message: '创建后台任务失败' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const serviceSupabase = createServiceClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('session_id')
    if (!sessionId) {
      return NextResponse.json({ runs: [] })
    }

    const { data: activeRuns, error } = await serviceSupabase
      .from('llm_runs')
      .select(RUN_SELECT_FIELDS)
      .eq('user_id', user.id)
      .eq('session_id', sessionId)
      .in('status', [...ACTIVE_STATUSES])
      .order('created_at', { ascending: false })
      .limit(3)
    if (error) {
      if (isDurableRunsSchemaUnavailable(error)) {
        return NextResponse.json({ runs: [], available: false, reason: 'schema_unavailable' })
      }
      throw error
    }

    const completedSince = new Date(Date.now() - RECENT_COMPLETED_LOOKBACK_MS).toISOString()
    const { data: completedRuns, error: completedError } = await serviceSupabase
      .from('llm_runs')
      .select(RUN_SELECT_FIELDS)
      .eq('user_id', user.id)
      .eq('session_id', sessionId)
      .eq('status', 'completed')
      .gte('updated_at', completedSince)
      .order('updated_at', { ascending: false })
      .limit(3)
    if (completedError) {
      if (isDurableRunsSchemaUnavailable(completedError)) {
        return NextResponse.json({ runs: [], available: false, reason: 'schema_unavailable' })
      }
      throw completedError
    }

    const byId = new Map<string, any>()
    for (const run of [...(activeRuns || []), ...(completedRuns || [])]) {
      byId.set(run.id, run)
    }
    const runs = Array.from(byId.values()).sort((a, b) =>
      String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')),
    )

    return NextResponse.json({ runs, available: true })
  } catch (error) {
    console.error('[llm-runs] GET fatal', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
