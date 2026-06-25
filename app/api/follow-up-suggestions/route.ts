export const runtime = 'nodejs'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateFollowUpSuggestions } from '@/lib/follow-up-suggestion-service'

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ suggestions: [] }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const suggestions = await generateFollowUpSuggestions(
      {
        userId: user.id,
        assistantContent: String(body.assistantContent || ''),
        previousUserContent: typeof body.previousUserContent === 'string' ? body.previousUserContent : null,
        recentMessages: Array.isArray(body.recentMessages) ? body.recentMessages : [],
        mode: body.mode === 'agent' || body.mode === 'feature' ? body.mode : 'classic',
        reportType: typeof body.reportType === 'string' ? body.reportType : null,
        featureContext: body.featureContext && typeof body.featureContext === 'object' ? body.featureContext : null,
        participants: Array.isArray(body.participants) ? body.participants : [],
        pendingKind: typeof body.pendingKind === 'string' ? body.pendingKind : null,
      },
      { signal: req.signal },
    )

    return NextResponse.json({ suggestions })
  } catch (error) {
    console.warn('[follow-up-suggestions] request failed', error)
    return NextResponse.json({ suggestions: [] })
  }
}
