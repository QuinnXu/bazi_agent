import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin'
import { callAfdianOpenApi, processAfdianOrder } from '@/lib/afdian'

export const runtime = 'nodejs'

async function requireAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: '请先登录' }, { status: 401 })
  if (!isAdmin(user.email)) return NextResponse.json({ error: '无权限访问' }, { status: 403 })
  return null
}

export async function POST(req: Request) {
  const authError = await requireAdmin()
  if (authError) return authError

  if (!process.env.AFDIAN_USER_ID || !process.env.AFDIAN_API_TOKEN) {
    return NextResponse.json({ error: '缺少 AFDIAN_USER_ID 或 AFDIAN_API_TOKEN' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const page = Math.max(1, Math.floor(Number(body.page || 1)))
  const perPage = Math.min(100, Math.max(1, Math.floor(Number(body.per_page || 50))))
  const api = await callAfdianOpenApi<{ list?: unknown[] }>('query-order', {
    page,
    per_page: perPage,
  })

  if (api.ec !== 200) {
    return NextResponse.json({ error: api.em || '同步爱发电订单失败' }, { status: 502 })
  }

  const list = Array.isArray(api.data?.list) ? api.data.list : []
  const results = []
  for (const order of list) {
    results.push(await processAfdianOrder(order))
  }

  return NextResponse.json({
    success: true,
    count: results.length,
    results,
  })
}
