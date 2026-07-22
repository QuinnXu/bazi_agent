import { randomUUID } from 'crypto'
import { createServiceClient } from '@/lib/supabase/client'
import { FREE_DAILY_APPLE_LIMIT, PAID_DAILY_APPLE_LIMIT, isFutureTimestamp } from '@/lib/rewards'
import type { MembershipTier } from '@/lib/apple-costs'
import type { UserQuota } from '@/types/database_v2'

const DEFAULT_DAILY_LIMIT = FREE_DAILY_APPLE_LIMIT

interface QuotaRpcRow {
  success: boolean
  user_id: string
  is_paid: boolean
  membership_tier: MembershipTier
  unlimited: boolean
  daily_apple_limit: number
  membership_expires_at: string | null
  next_membership_tier: MembershipTier | null
  next_membership_starts_at: string | null
  bonus_apple_limit: number
  bonus_expires_at: string | null
  apples_used_today: number
  last_reset_date: string
  daily_remaining: number
  wallet_balance: number
  wallet_expires_at: string | null
  remaining: number
  charge_id: string | null
  fair_use_limited: boolean
  retry_after_seconds: number
}

export interface QuotaInfo {
  userId: string
  tier: MembershipTier
  isPaid: boolean
  unlimited: boolean
  dailyLimit: number
  usedToday: number
  dailyRemaining: number
  walletBalance: number
  walletExpiresAt: string | null
  remaining: number
  membershipExpiresAt: string | null
  nextMembershipTier: MembershipTier | null
  nextMembershipStartsAt: string | null
  bonusAppleLimit: number
  bonusExpiresAt: string | null
  dbConnected: boolean
}

export interface AppleChargeResult {
  success: boolean
  quota: QuotaInfo
  chargeId: string | null
  fairUseLimited: boolean
  retryAfterSeconds: number
}

interface ConsumeOptions {
  enforceFairUse?: boolean
  operationKey?: string
}

function isQuotaRpcUnavailable(error: { code?: string; message?: string } | null): boolean {
  const message = String(error?.message || '')
  return error?.code === 'PGRST202' ||
    message.includes('Could not find the function public.consume_user_apples') ||
    message.includes('Could not find the function public.settle_apple_charge')
}

export async function getOrResetQuota(userId: string): Promise<QuotaInfo> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .rpc('consume_user_apples', {
      p_user_id: userId,
      p_count: 0,
      p_enforce_fair_use: false,
      p_operation_key: null,
    })
    .single()

  if (isQuotaRpcUnavailable(error)) return getOrResetQuotaLegacy(userId)
  if (error || !data) {
    console.error('[Quota] Failed to load quota:', error?.message)
    return fallbackQuota(userId)
  }
  return toQuotaInfoFromRpc(data)
}

export async function consumeApples(
  userId: string,
  count = 1,
  options: ConsumeOptions = {},
): Promise<AppleChargeResult> {
  const safeCount = Math.max(0, Math.floor(count))
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .rpc('consume_user_apples', {
      p_user_id: userId,
      p_count: safeCount,
      p_enforce_fair_use: options.enforceFairUse === true,
      p_operation_key: options.operationKey || randomUUID(),
    })
    .single()

  if (isQuotaRpcUnavailable(error)) {
    if (safeCount === 0) {
      return {
        success: true,
        quota: await getOrResetQuotaLegacy(userId),
        chargeId: null,
        fairUseLimited: false,
        retryAfterSeconds: 0,
      }
    }
    const legacy = await consumeApplesLegacy(userId, Math.max(1, safeCount))
    return { ...legacy, chargeId: null, fairUseLimited: false, retryAfterSeconds: 0 }
  }
  if (error || !data) {
    console.error('[Quota] Failed to consume apples:', error?.message)
    return {
      success: false,
      quota: fallbackQuota(userId),
      chargeId: null,
      fairUseLimited: false,
      retryAfterSeconds: 0,
    }
  }
  return {
    success: data.success,
    quota: toQuotaInfoFromRpc(data),
    chargeId: data.charge_id,
    fairUseLimited: data.fair_use_limited,
    retryAfterSeconds: data.retry_after_seconds || 0,
  }
}

export async function consumeApple(userId: string) {
  return consumeApples(userId, 1)
}

export async function settleAppleCharge(
  userId: string,
  chargeId: string | null | undefined,
  refund: boolean,
): Promise<QuotaInfo> {
  if (!chargeId) return getOrResetQuota(userId)
  const supabase = createServiceClient()
  const { error } = await supabase.rpc('settle_apple_charge', {
    p_user_id: userId,
    p_charge_id: chargeId,
    p_refund: refund,
  })
  if (error && !isQuotaRpcUnavailable(error)) {
    throw new Error(`苹果账务结算失败：${error.message}`)
  }
  return getOrResetQuota(userId)
}

export async function completeAppleCharge(
  userId: string,
  chargeId: string | null | undefined,
): Promise<QuotaInfo> {
  return settleAppleCharge(userId, chargeId, false)
}

/**
 * Refund by charge id whenever possible so daily and wallet funding sources are
 * restored exactly. A numeric value remains supported during rolling deploys.
 */
export async function refundApples(
  userId: string,
  chargeIdOrCount: string | number | null | undefined,
): Promise<QuotaInfo> {
  if (typeof chargeIdOrCount === 'string') {
    return settleAppleCharge(userId, chargeIdOrCount, true)
  }

  const safeCount = Math.max(1, Math.floor(chargeIdOrCount || 1))
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .rpc('refund_user_apples', { p_user_id: userId, p_count: safeCount })
    .single()
  if (isQuotaRpcUnavailable(error)) return refundApplesLegacy(userId, safeCount)
  if (error || !data) {
    console.error('[Quota] Legacy refund failed:', error?.message)
    return fallbackQuota(userId)
  }
  return getOrResetQuota(userId)
}

async function getOrResetQuotaLegacy(userId: string): Promise<QuotaInfo> {
  const supabase = createServiceClient()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
  const { data: quota, error } = await supabase
    .from('user_quotas')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[Quota] Legacy quota lookup failed:', error.message)
    return fallbackQuota(userId)
  }
  if (!quota) {
    const { data: created, error: insertError } = await supabase
      .from('user_quotas')
      .upsert({
        user_id: userId,
        is_paid: false,
        membership_tier: 'free',
        daily_apple_limit: DEFAULT_DAILY_LIMIT,
        apples_used_today: 0,
        last_reset_date: today,
      })
      .select()
      .single()
    if (insertError || !created) return fallbackQuota(userId)
    return toQuotaInfo(created)
  }
  if (String(quota.last_reset_date) !== today) {
    const { data: reset } = await supabase
      .from('user_quotas')
      .update({ apples_used_today: 0, last_reset_date: today })
      .eq('user_id', userId)
      .select()
      .single()
    return toQuotaInfo(reset || { ...quota, apples_used_today: 0, last_reset_date: today })
  }
  return toQuotaInfo(quota)
}

async function consumeApplesLegacy(
  userId: string,
  count: number,
): Promise<{ success: boolean; quota: QuotaInfo }> {
  const quota = await getOrResetQuotaLegacy(userId)
  if (!quota.dbConnected || quota.remaining < count) {
    return { success: false, quota }
  }
  const supabase = createServiceClient()
  const { data: updated } = await supabase
    .from('user_quotas')
    .update({ apples_used_today: quota.usedToday + count })
    .eq('user_id', userId)
    .select()
    .single()
  return { success: true, quota: updated ? toQuotaInfo(updated) : quota }
}

async function refundApplesLegacy(userId: string, count: number): Promise<QuotaInfo> {
  const quota = await getOrResetQuotaLegacy(userId)
  if (!quota.dbConnected) return quota
  const supabase = createServiceClient()
  const { data: updated } = await supabase
    .from('user_quotas')
    .update({ apples_used_today: Math.max(0, quota.usedToday - count) })
    .eq('user_id', userId)
    .select()
    .single()
  return updated ? toQuotaInfo(updated) : quota
}

function fallbackQuota(userId: string): QuotaInfo {
  return {
    userId,
    tier: 'free',
    isPaid: false,
    unlimited: false,
    dailyLimit: DEFAULT_DAILY_LIMIT,
    usedToday: 0,
    dailyRemaining: DEFAULT_DAILY_LIMIT,
    walletBalance: 0,
    walletExpiresAt: null,
    remaining: DEFAULT_DAILY_LIMIT,
    membershipExpiresAt: null,
    nextMembershipTier: null,
    nextMembershipStartsAt: null,
    bonusAppleLimit: 0,
    bonusExpiresAt: null,
    dbConnected: false,
  }
}

function toQuotaInfoFromRpc(row: QuotaRpcRow): QuotaInfo {
  return {
    userId: row.user_id,
    tier: row.membership_tier || 'free',
    isPaid: row.is_paid,
    unlimited: row.unlimited,
    dailyLimit: row.daily_apple_limit,
    usedToday: row.apples_used_today,
    dailyRemaining: row.daily_remaining,
    walletBalance: row.wallet_balance || 0,
    walletExpiresAt: row.wallet_expires_at,
    remaining: row.remaining,
    membershipExpiresAt: row.membership_expires_at,
    nextMembershipTier: row.next_membership_tier,
    nextMembershipStartsAt: row.next_membership_starts_at,
    bonusAppleLimit: row.bonus_apple_limit || 0,
    bonusExpiresAt: row.bonus_expires_at,
    dbConnected: true,
  }
}

function toQuotaInfo(row: UserQuota): QuotaInfo {
  const now = new Date()
  const ultraActive = isFutureTimestamp(row.ultra_expires_at, now)
  const plusActive = isFutureTimestamp(row.plus_expires_at, now) || (
    row.is_paid && !row.membership_expires_at
  )
  const tier: MembershipTier = ultraActive ? 'ultra' : plusActive ? 'plus' : 'free'
  const bonusActive = (row.bonus_apple_limit || 0) > 0 && isFutureTimestamp(row.bonus_expires_at, now)
  const baseLimit = tier === 'plus' ? PAID_DAILY_APPLE_LIMIT : DEFAULT_DAILY_LIMIT
  const bonusLimit = bonusActive ? row.bonus_apple_limit || 0 : 0
  const dailyLimit = baseLimit + bonusLimit
  const dailyRemaining = Math.max(0, dailyLimit - row.apples_used_today)

  return {
    userId: row.user_id,
    tier,
    isPaid: tier !== 'free',
    unlimited: tier === 'ultra',
    dailyLimit,
    usedToday: row.apples_used_today,
    dailyRemaining,
    walletBalance: 0,
    walletExpiresAt: null,
    remaining: tier === 'ultra' ? 0 : dailyRemaining,
    membershipExpiresAt: tier === 'ultra' ? row.ultra_expires_at : tier === 'plus' ? row.plus_expires_at : null,
    nextMembershipTier: tier === 'ultra' && row.plus_expires_at && row.ultra_expires_at && row.plus_expires_at > row.ultra_expires_at ? 'plus' : null,
    nextMembershipStartsAt: tier === 'ultra' && row.plus_expires_at && row.ultra_expires_at && row.plus_expires_at > row.ultra_expires_at ? row.ultra_expires_at : null,
    bonusAppleLimit: bonusLimit,
    bonusExpiresAt: bonusActive ? row.bonus_expires_at : null,
    dbConnected: true,
  }
}
