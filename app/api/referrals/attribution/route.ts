import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import {
  getReferralAttributionId,
  REFERRAL_REWARD_APPLES,
  REFERRAL_REWARD_EXPIRY_DAYS,
} from '@/lib/referral-attribution'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const attributionId = await getReferralAttributionId()
    if (!attributionId) {
      return NextResponse.json({ attributed: false })
    }

    const now = new Date().toISOString()
    const client = createServiceClient()
    const { data, error } = await client
      .from('referral_attributions')
      .select('referral_code, expires_at, referred_user_id')
      .eq('id', attributionId)
      .gt('expires_at', now)
      .is('referred_user_id', null)
      .maybeSingle()

    if (error || !data) {
      return NextResponse.json({ attributed: false })
    }

    return NextResponse.json({
      attributed: true,
      referralCode: data.referral_code,
      expiresAt: data.expires_at,
      reward: {
        apples: REFERRAL_REWARD_APPLES,
        expiryDays: REFERRAL_REWARD_EXPIRY_DAYS,
      },
    })
  } catch (error) {
    console.warn('[referral] attribution lookup failed:', error)
    return NextResponse.json({ attributed: false })
  }
}
