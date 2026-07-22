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

    if (!quota.dbConnected) {
      return NextResponse.json(
        { error: '苹果额度服务暂时不可用' },
        {
          status: 503,
          headers: { 'Cache-Control': 'private, no-store, max-age=0' },
        },
      )
    }

    return NextResponse.json({
      tier: quota.tier,
      isPaid: quota.isPaid,
      unlimited: quota.unlimited,
      dailyLimit: quota.dailyLimit,
      usedToday: quota.usedToday,
      dailyRemaining: quota.dailyRemaining,
      walletBalance: quota.walletBalance,
      walletExpiresAt: quota.walletExpiresAt,
      remaining: quota.remaining,
      membershipExpiresAt: quota.membershipExpiresAt,
      nextMembershipTier: quota.nextMembershipTier,
      nextMembershipStartsAt: quota.nextMembershipStartsAt,
      bonusAppleLimit: quota.bonusAppleLimit,
      bonusExpiresAt: quota.bonusExpiresAt,
    }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    })
  } catch (error) {
    console.error('Quota API Error:', error)
    return NextResponse.json(
      { error: '获取配额信息失败' },
      { status: 500 }
    )
  }
}
