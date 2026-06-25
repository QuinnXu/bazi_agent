import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/client'
import { exchangeAfdianOAuthCode } from '@/lib/afdian'

export const runtime = 'nodejs'

function redirectUri(req: Request) {
  return process.env.AFDIAN_OAUTH_REDIRECT_URI || `${new URL(req.url).origin}/api/afdian/oauth/callback`
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieState = req.headers.get('cookie')?.match(/(?:^|;\s*)afdian_oauth_state=([^;]+)/)?.[1]

  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.redirect(new URL('/?auth=required', req.url))
    }

    if (!code || !state || !cookieState || state !== decodeURIComponent(cookieState)) {
      return NextResponse.redirect(new URL('/?afdian=state_error', req.url))
    }

    const identity = await exchangeAfdianOAuthCode(code, redirectUri(req))
    const serviceClient = createServiceClient()
    await serviceClient
      .from('afdian_bindings')
      .upsert({
        user_id: user.id,
        afdian_user_id: identity.afdianUserId,
        user_private_id: identity.userPrivateId,
        binding_method: 'oauth',
      }, { onConflict: 'user_id' })

    const res = NextResponse.redirect(new URL('/?afdian=bound', req.url))
    res.cookies.delete('afdian_oauth_state')
    return res
  } catch (error) {
    console.error('[Afdian] oauth callback error:', error)
    return NextResponse.redirect(new URL('/?afdian=oauth_failed', req.url))
  }
}
