import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/client'
import { isAdmin } from '@/lib/admin'

export const runtime = 'nodejs'

async function requireAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: '请先登录' }, { status: 401 })
  if (!isAdmin(user.email)) return NextResponse.json({ error: '无权限访问' }, { status: 403 })
  return null
}

function nonNegativeInt(value: unknown, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? Math.max(0, Math.floor(num)) : fallback
}

export async function GET() {
  const authError = await requireAdmin()
  if (authError) return authError

  const { data, error } = await createServiceClient()
    .from('afdian_plan_mappings')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: '获取订阅套餐配置失败' }, { status: 500 })
  }
  return NextResponse.json({ mappings: data || [] })
}

export async function POST(req: Request) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => ({}))
  const planId = typeof body.plan_id === 'string' ? body.plan_id.trim() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!planId || !name) {
    return NextResponse.json({ error: '缺少 plan_id 或方案名称' }, { status: 400 })
  }

  const { data, error } = await createServiceClient()
    .from('afdian_plan_mappings')
    .upsert({
      plan_id: planId,
      name,
      membership_days: nonNegativeInt(body.membership_days, 30),
      bonus_apple_limit: nonNegativeInt(body.bonus_apple_limit, 0),
      bonus_days: nonNegativeInt(body.bonus_days, 0),
      is_active: body.is_active !== false,
    }, { onConflict: 'plan_id' })
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json({ error: '保存订阅套餐配置失败' }, { status: 500 })
  }
  return NextResponse.json({ success: true, mapping: data })
}

export async function PATCH(req: Request) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => ({}))
  const planId = typeof body.plan_id === 'string' ? body.plan_id.trim() : ''
  if (!planId) {
    return NextResponse.json({ error: '缺少 plan_id' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (typeof body.name === 'string') update.name = body.name.trim()
  if ('membership_days' in body) update.membership_days = nonNegativeInt(body.membership_days, 30)
  if ('bonus_apple_limit' in body) update.bonus_apple_limit = nonNegativeInt(body.bonus_apple_limit, 0)
  if ('bonus_days' in body) update.bonus_days = nonNegativeInt(body.bonus_days, 0)
  if (typeof body.is_active === 'boolean') update.is_active = body.is_active

  const { data, error } = await createServiceClient()
    .from('afdian_plan_mappings')
    .update(update)
    .eq('plan_id', planId)
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json({ error: '更新订阅套餐配置失败' }, { status: 500 })
  }
  return NextResponse.json({ success: true, mapping: data })
}
