import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/client'
import { normalizeReferralCode } from '@/lib/rewards'

export const REFERRAL_ATTRIBUTION_COOKIE = 'bubu_referral_attribution'
export const REFERRAL_ATTRIBUTION_DAYS = 30
export const REFERRAL_REWARD_APPLES = 30
export const REFERRAL_REWARD_EXPIRY_DAYS = 365

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ReferralFunnelStage =
  | 'trial_started_at'
  | 'trial_completed_at'

export interface InviteAttributionResult {
  status: 'created' | 'existing' | 'invalid_code' | 'existing_user'
  attributionId?: string
  referralCode?: string
}
function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export async function getReferralAttributionId(): Promise<string | null> {
  const cookieStore = await cookies()
  const value = cookieStore.get(REFERRAL_ATTRIBUTION_COOKIE)?.value || ''
  return UUID_PATTERN.test(value) ? value : null
}

export async function clearReferralAttributionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(REFERRAL_ATTRIBUTION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}

export async function ensureInviteAttribution(
  rawCode: string,
  currentUserId?: string | null,
): Promise<InviteAttributionResult> {
  if (currentUserId) return { status: 'existing_user' }

  const referralCode = normalizeReferralCode(rawCode)
  if (!referralCode) return { status: 'invalid_code' }

  const client = createServiceClient()
  const { data: referrer } = await client
    .from('profiles')
    .select('id, referral_code')
    .eq('referral_code', referralCode)
    .maybeSingle()

  if (!referrer?.id) return { status: 'invalid_code' }

  const now = new Date()
  const existingId = await getReferralAttributionId()
  if (existingId) {
    const { data: existing } = await client
      .from('referral_attributions')
      .select('id, referral_code, expires_at, referred_user_id')
      .eq('id', existingId)
      .maybeSingle()

    if (
      existing?.id &&
      !existing.referred_user_id &&
      new Date(existing.expires_at).getTime() > now.getTime()
    ) {
      return {
        status: 'existing',
        attributionId: existing.id,
        referralCode: existing.referral_code,
      }
    }
  }

  const expiresAt = addDays(now, REFERRAL_ATTRIBUTION_DAYS)
  const { data: attribution, error } = await client
    .from('referral_attributions')
    .insert({
      referrer_user_id: referrer.id,
      referral_code: referrer.referral_code || referralCode,
      source: 'link',
      clicked_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    } as any)
    .select('id, referral_code')
    .single()

  if (error || !attribution) {
    throw new Error(`创建推广归因失败：${error?.message || '没有返回归因记录'}`)
  }

  const cookieStore = await cookies()
  cookieStore.set(REFERRAL_ATTRIBUTION_COOKIE, attribution.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: REFERRAL_ATTRIBUTION_DAYS * 24 * 60 * 60,
  })

  return {
    status: 'created',
    attributionId: attribution.id,
    referralCode: attribution.referral_code,
  }
}

export async function touchReferralAttribution(stage: ReferralFunnelStage): Promise<void> {
  const attributionId = await getReferralAttributionId()
  if (!attributionId) return

  const client = createServiceClient()
  const now = new Date().toISOString()
  const { error } = await client
    .from('referral_attributions')
    .update({ [stage]: now, updated_at: now } as any)
    .eq('id', attributionId)
    .is(stage, null)
    .is('referred_user_id', null)
    .gt('expires_at', now)

  if (error) {
    console.warn(`[referral] ${stage} funnel update failed:`, error.message)
  }
}
