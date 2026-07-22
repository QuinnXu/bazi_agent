import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/client'
import { ensureUserProfileAndReferralCode } from '@/lib/rewards'
import {
  REFERRAL_ATTRIBUTION_DAYS,
  REFERRAL_REWARD_APPLES,
  REFERRAL_REWARD_EXPIRY_DAYS,
} from '@/lib/referral-attribution'

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
      .select('id, status, reward_policy_version, created_at, new_user_rewarded_at, activated_at, referrer_rewarded_at')
      .eq('referrer_user_id', user.id)
      .order('created_at', { ascending: false })

    if (referralsError) {
      console.error('[Referrals] Failed to fetch stats:', referralsError.message)
    }

    const { data: attributions, error: attributionError } = await serviceClient
      .from('referral_attributions')
      .select('clicked_at, trial_started_at, trial_completed_at, registered_at, activated_at')
      .eq('referrer_user_id', user.id)

    if (attributionError) {
      console.error('[Referrals] Failed to fetch funnel:', attributionError.message)
    }

    const origin = new URL(req.url).origin
    const referralCode = profile.referral_code || ''
    const inviteLink = referralCode ? `${origin}/invite/${encodeURIComponent(referralCode)}` : ''
    const appleReferrals = (referrals || []).filter(row => row.reward_policy_version === 'apple_v2')
    const rewardedCount = appleReferrals.filter(row => row.status === 'rewarded').length
    const pendingCount = appleReferrals.filter(row => row.status === 'pending').length

    return NextResponse.json({
      referralCode,
      inviteLink,
      reward: {
        inviteeApples: REFERRAL_REWARD_APPLES,
        referrerApples: REFERRAL_REWARD_APPLES,
        expiryDays: REFERRAL_REWARD_EXPIRY_DAYS,
        attributionDays: REFERRAL_ATTRIBUTION_DAYS,
      },
      stats: {
        clicks: (attributions || []).filter(row => row.clicked_at).length,
        trialStarted: (attributions || []).filter(row => row.trial_started_at).length,
        trialCompleted: (attributions || []).filter(row => row.trial_completed_at).length,
        registered: (attributions || []).filter(row => row.registered_at).length,
        activated: (attributions || []).filter(row => row.activated_at).length,
        pending: pendingCount,
        rewarded: rewardedCount,
      },
      referrals: appleReferrals.map(row => ({
        id: row.id,
        status: row.status,
        createdAt: row.created_at,
        newUserRewardedAt: row.new_user_rewarded_at,
        activatedAt: row.activated_at,
        referrerRewardedAt: row.referrer_rewarded_at,
      })),
    })
  } catch (error) {
    console.error('[Referrals] me error:', error)
    return NextResponse.json({ error: '获取推荐信息失败' }, { status: 500 })
  }
}
