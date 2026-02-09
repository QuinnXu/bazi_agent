import { createBrowserClient as createClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database_v2'

// 浏览器端单例，确保全应用共用一个 Supabase 客户端，避免 onAuthStateChange 与 auth 操作实例不一致
let browserClient: ReturnType<typeof createClient<Database>> | null = null

// 客户端组件使用（单例模式）
export const createBrowserClient = () => {
  if (typeof window !== 'undefined' && browserClient) {
    return browserClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    if (typeof window !== 'undefined') {
      console.warn(
        '⚠️ 警告：缺少 Supabase 环境变量。应用功能可能受限。',
        '\n请在 Vercel Dashboard 中配置以下环境变量：',
        '\n- NEXT_PUBLIC_SUPABASE_URL',
        '\n- NEXT_PUBLIC_SUPABASE_ANON_KEY'
      )
    }
    const placeholder = createClient<Database>(
      'https://placeholder.supabase.co',
      'placeholder-key',
      {
        cookies: {
          getAll() { return [] },
          setAll() { }
        }
      }
    )
    if (typeof window !== 'undefined') browserClient = placeholder
    return placeholder
  }

  const client = createClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          if (typeof document === 'undefined') return []
          return document.cookie.split('; ').map(cookie => {
            const [name, ...rest] = cookie.split('=')
            return { name, value: rest.join('=') }
          })
        },
        setAll(cookiesToSet) {
          if (typeof document === 'undefined') return
          cookiesToSet.forEach(({ name, value, options }) => {
            let cookie = `${name}=${value}`
            if (options?.maxAge) cookie += `; max-age=${options.maxAge}`
            if (options?.path) cookie += `; path=${options.path}`
            if (options?.sameSite) cookie += `; samesite=${options.sameSite}`
            if (options?.secure) cookie += `; secure`
            document.cookie = cookie
          })
        },
      },
    }
  )
  if (typeof window !== 'undefined') browserClient = client
  return client
}

// 服务端使用（带 service role key）
export const createServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
  return createSupabaseClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}
