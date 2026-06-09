import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/client'
import { ensureUserProfileAndReferralCode } from '@/lib/rewards'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    const serviceClient = createServiceClient()
    const profile = await ensureUserProfileAndReferralCode(serviceClient, {
      id: user.id,
      email: user.email,
      displayName: typeof user.user_metadata?.display_name === 'string'
        ? user.user_metadata.display_name
        : null,
    })

    const { data: referrals, error: referralsError } = await serviceClient
      .from('referrals')
      .select('id, status, created_at, rewarded_at, referred_user_id')
      .eq('referrer_user_id', user.id)
      .order('created_at', { ascending: false })

    if (referralsError) {
      console.error('[Referrals] Failed to fetch stats:', referralsError.message)
    }

    const origin = new URL(req.url).origin
    const referralCode = profile.referral_code || ''
    const inviteLink = referralCode ? `${origin}/?ref=${encodeURIComponent(referralCode)}` : ''
    const rewardedCount = (referrals || []).filter(row => row.status === 'rewarded').length

    return NextResponse.json({
      referralCode,
      inviteLink,
      stats: {
        total: referrals?.length || 0,
        rewarded: rewardedCount,
      },
      referrals: referrals || [],
    })
  } catch (error) {
    console.error('[Referrals] me error:', error)
    return NextResponse.json({ error: '获取推荐信息失败' }, { status: 500 })
  }
}
