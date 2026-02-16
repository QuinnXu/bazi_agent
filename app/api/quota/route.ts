import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getOrResetQuota } from '@/lib/quota'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * GET /api/quota
 * Returns the current user's apple quota info.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: '请先登录' },
        { status: 401 }
      )
    }

    const quota = await getOrResetQuota(user.id)

    return NextResponse.json({
      isPaid: quota.isPaid,
      dailyLimit: quota.dailyLimit,
      usedToday: quota.usedToday,
      remaining: quota.remaining,
    })
  } catch (error) {
    console.error('Quota API Error:', error)
    return NextResponse.json(
      { error: '获取配额信息失败' },
      { status: 500 }
    )
  }
}
