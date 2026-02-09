import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database_v2'

/** 在每次请求时刷新 Supabase auth cookies，必须返回带更新后 cookie 的 response */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return response

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, ...options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  // 触发 token 刷新并写回 cookie，必须在 createServerClient 之后立即调用
  await supabase.auth.getSession()

  return response
}
