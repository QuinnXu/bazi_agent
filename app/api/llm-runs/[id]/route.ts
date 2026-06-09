// Runtime configuration for Vercel
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/client'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient()
    const serviceSupabase = createServiceClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { searchParams } = new URL(req.url)
    const afterSeq = Number(searchParams.get('after_seq') || '0')
    const eventsOnly = searchParams.get('events_only') === '1'

    const { data: run, error: runError } = await serviceSupabase
      .from('llm_runs')
      .select('id, session_id, kind, status, final_metadata, assistant_message_id, model, task, input_tokens, apple_cost, error_message, started_at, completed_at, canceled_at, created_at, updated_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    if (runError || !run) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const includeOutputText = !eventsOnly || ['completed', 'failed', 'canceled'].includes(String(run.status))
    let outputText = ''
    if (includeOutputText) {
      const { data: outputRow, error: outputError } = await serviceSupabase
        .from('llm_runs')
        .select('output_text')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()
      if (outputError) throw outputError
      outputText = String(outputRow?.output_text || '')
    }

    let eventsQuery = serviceSupabase
      .from('llm_run_events')
      .select('seq, event_type, content, payload, created_at')
      .eq('run_id', id)
      .order('seq', { ascending: true })
      .limit(200)
    if (Number.isFinite(afterSeq) && afterSeq > 0) {
      eventsQuery = eventsQuery.gt('seq', afterSeq)
    }
    const { data: events, error: eventsError } = await eventsQuery
    if (eventsError) throw eventsError

    return NextResponse.json({
      id: run.id,
      session_id: run.session_id,
      kind: run.kind,
      status: run.status,
      output_text: outputText,
      final_metadata: run.final_metadata || {},
      assistant_message_id: run.assistant_message_id,
      model: run.model,
      task: run.task,
      input_tokens: run.input_tokens,
      apple_cost: run.apple_cost,
      error: run.error_message,
      started_at: run.started_at,
      completed_at: run.completed_at,
      canceled_at: run.canceled_at,
      events: events || [],
    })
  } catch (error) {
    console.error('[llm-runs/:id] GET fatal', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
