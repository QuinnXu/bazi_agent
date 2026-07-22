import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/client'

export const runtime = 'nodejs'

const FEATURE_ENTRY_TASK_PREFIX = 'feature_entry_select:'

const FEATURE_KINDS = new Set(['hepan', 'fortune', 'avatar', 'lifepath', 'liuyao'])
const ENTRY_ORIGINS = new Set(['sidebar', 'composer_launcher', 'empty_home', 'mode_switch'])

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({})) as {
      kind?: string
      origin?: string
    }
    const kind = String(body.kind || '').trim()
    const origin = String(body.origin || '').trim()

    if (!FEATURE_KINDS.has(kind)) {
      return NextResponse.json({ error: 'invalid_feature_kind' }, { status: 400 })
    }
    if (!ENTRY_ORIGINS.has(origin)) {
      return NextResponse.json({ error: 'invalid_entry_origin' }, { status: 400 })
    }

    const serviceClient = createServiceClient()
    const { error } = await serviceClient
      .from('llm_usage_events')
      .insert({
        user_id: user.id,
        source: 'feature_page',
        mode: 'feature',
        feature_kind: kind,
        model: 'ui_event',
        task: `${FEATURE_ENTRY_TASK_PREFIX}${origin}`,
        status: 'completed',
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      } as any)

    if (error) {
      console.warn('[feature-entry] record failed:', error.message)
      return NextResponse.json({ error: 'record_failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.warn('[feature-entry] unexpected error:', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
