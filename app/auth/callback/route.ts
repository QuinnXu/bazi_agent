import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { completeUserRegistration } from '@/lib/rewards'

/**
 * 处理 Supabase 邮箱确认链接回调（及 OAuth 等 code 交换）。
 * 将 URL 中的 code 换成 session 并重定向回首页。
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const nextParam = requestUrl.searchParams.get('next') ?? '/'
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/'

  if (next.startsWith('/auth/reset-password')) {
    const target = new URL(next, requestUrl.origin)
    ;['code', 'token_hash', 'type', 'error', 'error_code', 'error_description'].forEach((key) => {
      const value = requestUrl.searchParams.get(key)
      if (value) target.searchParams.set(key, value)
    })
    return NextResponse.redirect(target)
  }

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await completeUserRegistration(user)
      }
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin))
}
