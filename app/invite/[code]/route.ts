import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ensureInviteAttribution } from '@/lib/referral-attribution'
import { GUEST_FIRST_QA_FLOW } from '@/lib/guest-first-qa-flow'

export const runtime = 'nodejs'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const url = new URL(req.url)
  const { code } = await params

  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    const result = await ensureInviteAttribution(code, user?.id)

    if (result.status === 'invalid_code') {
      return NextResponse.redirect(new URL('/?inviteError=invalid', url.origin))
    }
    if (result.status === 'existing_user') {
      return NextResponse.redirect(new URL('/?inviteError=existing_user', url.origin))
    }

    const destination = new URL('/', url.origin)
    destination.searchParams.set('from', 'invite')
    destination.searchParams.set('trialFlow', GUEST_FIRST_QA_FLOW.id)
    destination.searchParams.set('invited', '1')
    return NextResponse.redirect(destination)
  } catch (error) {
    console.error('[invite] attribution failed:', error)
    return NextResponse.redirect(new URL('/?inviteError=unavailable', url.origin))
  }
}
