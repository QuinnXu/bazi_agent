import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * 处理 Supabase 邮箱确认链接回调（及 OAuth 等 code 交换）。
 * 将 URL 中的 code 换成 session 并重定向回首页。
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase
          .from('profiles')
          .upsert(
            { id: user.id, email: user.email ?? '', display_name: null },
            { onConflict: 'id' }
          )
      }
    } else if (next.startsWith('/auth/reset-password')) {
      // 链接过期或 code 已被使用：让 reset-password 页面给用户友好提示
      const target = new URL(next, requestUrl.origin)
      target.searchParams.set('error', 'invalid_link')
      return NextResponse.redirect(target)
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin))
}
