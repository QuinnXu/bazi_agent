import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getAfdianOAuthAuthorizeUrl } from '@/lib/afdian'

export const runtime = 'nodejs'

function redirectUri(req: Request) {
  return process.env.AFDIAN_OAUTH_REDIRECT_URI || `${new URL(req.url).origin}/api/afdian/oauth/callback`
}

export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.redirect(new URL('/?auth=required', req.url))
  }

  if (!process.env.AFDIAN_OAUTH_CLIENT_ID || !process.env.AFDIAN_OAUTH_CLIENT_SECRET) {
    return NextResponse.redirect(new URL('/?afdian=oauth_unconfigured', req.url))
  }

  const state = randomBytes(16).toString('hex')
  const res = NextResponse.redirect(getAfdianOAuthAuthorizeUrl(state, redirectUri(req)))
  res.cookies.set('afdian_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: new URL(req.url).protocol === 'https:',
    maxAge: 10 * 60,
    path: '/',
  })
  return res
}
