import { randomBytes } from 'crypto'
import type { User } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/client'
import type { Database } from '@/types/database_v2'

type ServiceClient = ReturnType<typeof createServiceClient>
type ProfileRow = Database['public']['Tables']['profiles']['Row']

export const FREE_DAILY_APPLE_LIMIT = 5
export const PAID_DAILY_APPLE_LIMIT = 30
export const REFERRAL_NEW_USER_REWARD_DAYS = 7
export const REFERRAL_REFERRER_REWARD_DAYS = 7

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export interface BenefitGrant {
  membershipDays?: number
  bonusAppleLimit?: number
  bonusDays?: number
}

export interface BenefitResult {
  membershipTier?: 'free' | 'plus' | 'ultra'
  membershipExpiresAt: string | null
  bonusAppleLimit: number
  bonusExpiresAt: string | null
  walletBalance?: number
  walletExpiresAt?: string | null
}

export interface RegistrationRewardResult {
  referralApplied: boolean
  reason?: 'none' | 'invalid_code' | 'self_referral' | 'already_bound' | 'missing_profile'
  referralCode: string | null
  referrerUserId?: string
  newUserRewardApples?: number
  referrerRewardApples?: number
  rewardExpiryDays?: number
  newUserRewardExpiresAt?: string
  referrerRewardPending?: boolean
}

export interface ReferralActivationResult {
  activated: boolean
  referralId?: string
  referrerUserId?: string
  referrerRewardApples?: number
  rewardExpiresAt?: string
}

export interface RedemptionResult {
  ok: boolean
  status: number
  message: string
  code?: string
  benefits?: BenefitResult
}

export function normalizeReferralCode(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 32)
}

export function normalizeRedemptionCode(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 40)
}

export function generateReadableCode(prefix: string, length = 8): string {
  const bytes = randomBytes(length)
  let suffix = ''
  for (let i = 0; i < length; i += 1) {
    suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return `${prefix}${suffix}`
}

export function generateReferralCode(): string {
  return generateReadableCode('BB', 8)
}

export function generatePromotionCode(kind: string): string {
  const prefix =
    kind === 'apple_wallet' ? 'APPLE' :
    kind === 'bonus_quota' ? 'PLUS' :
    kind === 'combo' ? 'GIFT' :
    'VIP'
  return generateReadableCode(prefix, 8)
}

export function isFutureTimestamp(value: string | null | undefined, now = new Date()): boolean {
  if (!value) return false
  const time = new Date(value).getTime()
  return Number.isFinite(time) && time > now.getTime()
}

export function addDays(base: Date, days: number): Date {
  const next = new Date(base)
  next.setUTCDate(next.getUTCDate() + Math.max(0, Math.floor(days)))
  return next
}

async function getUniqueReferralCode(client: ServiceClient): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateReferralCode()
    const { data } = await client
      .from('profiles')
      .select('id')
      .eq('referral_code', code)
      .maybeSingle()
    if (!data) return code
  }
  throw new Error('无法生成唯一推荐码')
}

export async function ensureUserProfileAndReferralCode(
  client: ServiceClient,
  input: { id: string; email?: string | null; displayName?: string | null },
): Promise<ProfileRow> {
  const { data: existing, error: existingError } = await client
    .from('profiles')
    .select('*')
    .eq('id', input.id)
    .maybeSingle()

  if (existingError) {
    throw new Error(`读取用户档案失败：${existingError.message}`)
  }

  if (existing?.referral_code) {
    return existing
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const referralCode = await getUniqueReferralCode(client)
    const payload = {
      id: input.id,
      email: input.email || existing?.email || '',
      display_name: input.displayName ?? existing?.display_name ?? null,
      referral_code: referralCode,
    }

    const query = existing
      ? client.from('profiles').update({ referral_code: referralCode }).eq('id', input.id)
      : client.from('profiles').upsert(payload, { onConflict: 'id' })

    const { error: saveError } = await query
    if (!saveError) {
      const { data: saved, error: refetchError } = await client
        .from('profiles')
        .select('*')
        .eq('id', input.id)
        .single()
      if (refetchError || !saved) {
        throw new Error(`读取推荐码失败：${refetchError?.message || '没有返回档案'}`)
      }
      return saved
    }

    if (!saveError.message.toLowerCase().includes('duplicate')) {
      throw new Error(`保存推荐码失败：${saveError.message}`)
    }
  }

  throw new Error('保存推荐码失败：推荐码冲突过多')
}

export async function grantUserBenefits(
  userId: string,
  grant: BenefitGrant,
  client: ServiceClient = createServiceClient(),
): Promise<BenefitResult> {
  const { data, error } = await client
    .rpc('apply_user_benefits', {
      p_user_id: userId,
      p_membership_days: Math.max(0, Math.floor(grant.membershipDays || 0)),
      p_bonus_apple_limit: Math.max(0, Math.floor(grant.bonusAppleLimit || 0)),
      p_bonus_days: Math.max(0, Math.floor(grant.bonusDays || 0)),
    })
    .single()

  if (error || !data) {
    throw new Error(`发放奖励失败：${error?.message || '没有返回额度记录'}`)
  }

  return {
    membershipExpiresAt: data.membership_expires_at,
    bonusAppleLimit: data.bonus_apple_limit || 0,
    bonusExpiresAt: data.bonus_expires_at,
  }
}

export async function completeUserRegistration(
  user: User,
  explicitReferralCode?: string | null,
  attributionId?: string | null,
): Promise<RegistrationRewardResult> {
  const client = createServiceClient()
  const profile = await ensureUserProfileAndReferralCode(client, {
    id: user.id,
    email: user.email,
    displayName: typeof user.user_metadata?.display_name === 'string'
      ? user.user_metadata.display_name
      : null,
  })

  // Referral binding is based only on the server attribution cookie or the
  // explicit registration form value. User metadata is user-editable and is
  // intentionally not trusted for delayed settlement.
  const referralCode = normalizeReferralCode(explicitReferralCode)

  const { data, error } = await client
    .rpc('settle_referral_reward', {
      p_referred_user_id: profile.id,
      p_referral_code: referralCode,
      p_attribution_id: attributionId || null,
    })
    .single()

  if (error || !data) {
    throw new Error(`注册奖励结算失败：${error?.message || '没有返回结算结果'}`)
  }

  return {
    referralApplied: data.referral_applied,
    reason: data.reason as RegistrationRewardResult['reason'],
    referralCode: data.referral_code,
    referrerUserId: data.referrer_user_id || undefined,
    newUserRewardApples: data.new_user_reward_apples || undefined,
    referrerRewardApples: data.referrer_reward_apples || undefined,
    rewardExpiryDays: data.reward_expiry_days || undefined,
    newUserRewardExpiresAt: data.new_user_reward_expires_at || undefined,
    referrerRewardPending: data.referrer_reward_pending === true,
  }
}

export async function activateReferralRewardAfterAnswer(
  userId: string,
  client: ServiceClient = createServiceClient(),
): Promise<ReferralActivationResult> {
  const { data, error } = await client
    .rpc('activate_referral_reward', { p_referred_user_id: userId })
    .single()

  if (error || !data) {
    throw new Error(`推荐奖励激活失败：${error?.message || '没有返回激活结果'}`)
  }

  return {
    activated: data.activated,
    referralId: data.referral_id || undefined,
    referrerUserId: data.referrer_user_id || undefined,
    referrerRewardApples: data.referrer_reward_apples || undefined,
    rewardExpiresAt: data.reward_expires_at || undefined,
  }
}

export async function redeemPromotionCode(userId: string, rawCode: string): Promise<RedemptionResult> {
  const code = normalizeRedemptionCode(rawCode)
  if (!code) {
    return { ok: false, status: 400, message: '请输入兑换码' }
  }

  const client = createServiceClient()
  const { data, error } = await client
    .rpc('redeem_redemption_code', {
      p_user_id: userId,
      p_code: code,
    })
    .single()

  if (error || !data) {
    throw new Error(`兑换失败：${error?.message || '没有返回兑换结果'}`)
  }

  if (!data.ok) {
    return {
      ok: false,
      status: data.status,
      message: data.message,
      code: data.code || code,
    }
  }

  return {
    ok: true,
    status: data.status,
    message: data.message,
    code: data.code || code,
    benefits: {
      membershipTier: data.membership_tier || 'free',
      membershipExpiresAt: data.membership_expires_at,
      bonusAppleLimit: data.bonus_apple_limit || 0,
      bonusExpiresAt: data.bonus_expires_at,
      walletBalance: data.apple_wallet_balance || 0,
      walletExpiresAt: data.apple_wallet_expires_at,
    },
  }
}
