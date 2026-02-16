import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/client'
import { isAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * GET /api/admin/quotas
 * Returns all user quotas joined with profile emails.
 * Admin only.
 */
export async function GET() {
  try {
    // Auth + admin check
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    if (!isAdmin(user.email)) {
      return NextResponse.json({ error: '无权限访问' }, { status: 403 })
    }

    // Use service role to query across tables
    const serviceClient = createServiceClient()

    // Get confirmed users from auth (only those with verified emails)
    const { data: { users: authUsers }, error: authListError } = await serviceClient.auth.admin.listUsers({
      perPage: 1000,
    })

    if (authListError) {
      console.error('[Admin] Failed to list auth users:', authListError.message)
      return NextResponse.json({ error: '获取用户列表失败' }, { status: 500 })
    }

    // Filter to only email-confirmed users
    const confirmedUsers = (authUsers || []).filter(u => u.email_confirmed_at)

    // Get all quotas
    const { data: quotas, error: quotasError } = await serviceClient
      .from('user_quotas')
      .select('*')

    if (quotasError) {
      console.error('[Admin] Failed to fetch quotas:', quotasError.message)
      return NextResponse.json({ error: '获取配额列表失败' }, { status: 500 })
    }

    // Build a map of quotas by user_id
    const quotaMap = new Map<string, typeof quotas[0]>()
    for (const q of quotas || []) {
      quotaMap.set(q.user_id, q)
    }

    // Merge: confirmed auth users + their quota info
    const result = confirmedUsers.map(u => {
      const q = quotaMap.get(u.id)
      return {
        user_id: u.id,
        email: u.email || '',
        display_name: u.user_metadata?.display_name || null,
        is_paid: q?.is_paid ?? false,
        daily_apple_limit: q?.daily_apple_limit ?? 5,
        apples_used_today: q?.apples_used_today ?? 0,
        last_reset_date: q?.last_reset_date ?? null,
        has_quota_record: !!q,
        created_at: u.created_at,
      }
    })

    return NextResponse.json({ users: result })
  } catch (error) {
    console.error('[Admin] GET error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/quotas
 * Update a single user's quota.
 * Body: { user_id, is_paid?, daily_apple_limit? }
 * Admin only.
 */
export async function PATCH(req: Request) {
  try {
    // Auth + admin check
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    if (!isAdmin(user.email)) {
      return NextResponse.json({ error: '无权限访问' }, { status: 403 })
    }

    const body = await req.json()
    const { user_id, is_paid, daily_apple_limit } = body

    if (!user_id) {
      return NextResponse.json({ error: '缺少 user_id' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // Build the update object
    const updateData: Record<string, any> = {}
    if (typeof is_paid === 'boolean') updateData.is_paid = is_paid
    if (typeof daily_apple_limit === 'number') updateData.daily_apple_limit = daily_apple_limit

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '没有需要更新的字段' }, { status: 400 })
    }

    // Upsert: create the quota record if it doesn't exist
    const { data: updated, error: updateError } = await serviceClient
      .from('user_quotas')
      .upsert({
        user_id,
        ...updateData,
      })
      .select()
      .single()

    if (updateError) {
      console.error('[Admin] Failed to update quota:', updateError.message)
      return NextResponse.json({ error: '更新失败: ' + updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, quota: updated })
  } catch (error) {
    console.error('[Admin] PATCH error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
