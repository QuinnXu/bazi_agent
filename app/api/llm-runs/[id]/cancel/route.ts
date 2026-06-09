// Runtime configuration for Vercel
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/client'
import { abortActiveLlmRun } from '@/lib/llm-runner'

export async function POST(
  _req: Request,
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
    const { data: run, error: runError } = await serviceSupabase
      .from('llm_runs')
      .select('id, status')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    if (runError || !run) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    if (!['completed', 'failed', 'canceled'].includes(run.status)) {
      const now = new Date().toISOString()
      const { data: updated, error: updateError } = await serviceSupabase
        .from('llm_runs')
        .update({ status: 'canceled', canceled_at: now, completed_at: now })
        .eq('id', id)
        .eq('user_id', user.id)
        .select('status')
        .single()
      if (updateError) throw updateError
      abortActiveLlmRun(id)
      return NextResponse.json({ success: true, status: updated?.status || 'canceled' })
    }

    return NextResponse.json({ success: true, status: run.status })
  } catch (error) {
    console.error('[llm-runs/:id/cancel] fatal', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
