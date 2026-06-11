import { createServiceClient } from '@/lib/supabase/client'
import { FREE_DAILY_APPLE_LIMIT, PAID_DAILY_APPLE_LIMIT, isFutureTimestamp } from '@/lib/rewards'
import type { UserQuota } from '@/types/database_v2'

const DEFAULT_DAILY_LIMIT = FREE_DAILY_APPLE_LIMIT

interface QuotaRpcRow {
  success: boolean
  user_id: string
  is_paid: boolean
  daily_apple_limit: number
  membership_expires_at: string | null
  bonus_apple_limit: number
  bonus_expires_at: string | null
  apples_used_today: number
  last_reset_date: string
}

export interface QuotaInfo {
  userId: string
  isPaid: boolean
  dailyLimit: number
  usedToday: number
  remaining: number
  membershipExpiresAt: string | null
  bonusAppleLimit: number
  bonusExpiresAt: string | null
  dbConnected: boolean
}

function isQuotaRpcUnavailable(error: { code?: string; message?: string } | null): boolean {
  return error?.code === 'PGRST202' ||
    String(error?.message || '').includes('Could not find the function public.consume_user_apples') ||
    String(error?.message || '').includes('Could not find the function public.refund_user_apples')
}

/**
 * Get or auto-reset the user's apple quota for today.
 * Uses the service role client to bypass RLS for writes.
 */
export async function getOrResetQuota(userId: string): Promise<QuotaInfo> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .rpc('consume_user_apples', { p_user_id: userId, p_count: 0 })
    .single()

  if (isQuotaRpcUnavailable(error)) {
    return getOrResetQuotaLegacy(userId)
  }

  if (error || !data) {
    console.error('[Quota] Failed to load quota:', error?.message)
    return fallbackQuota(userId)
  }

  return toQuotaInfoFromRpc(data)
}

/**
 * Try to consume N apples atomically. Returns success=false if quota insufficient.
 * Feature/report costs are configured in config/apple-costs.json.
 */
export async function consumeApples(
  userId: string,
  count = 1,
): Promise<{ success: boolean; quota: QuotaInfo }> {
  const safeCount = Math.max(1, Math.floor(count))
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .rpc('consume_user_apples', { p_user_id: userId, p_count: safeCount })
    .single()

  if (isQuotaRpcUnavailable(error)) {
    return consumeApplesLegacy(userId, safeCount)
  }

  if (error || !data) {
    console.error('[Quota] Failed to consume apples:', error?.message)
    const fallback = fallbackQuota(userId)
    return { success: true, quota: fallback }
  }

  return { success: data.success, quota: toQuotaInfoFromRpc(data) }
}

/**
 * Backward-compatible single-apple consumer. Forwards to consumeApples(userId, 1).
 */
export async function consumeApple(userId: string) {
  return consumeApples(userId, 1)
}

/**
 * Refund apples on analysis failure. Will not push usage below 0.
 */
export async function refundApples(
  userId: string,
  count = 1,
): Promise<QuotaInfo> {
  const safeCount = Math.max(1, Math.floor(count))
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .rpc('refund_user_apples', { p_user_id: userId, p_count: safeCount })
    .single()

  if (isQuotaRpcUnavailable(error)) {
    return refundApplesLegacy(userId, safeCount)
  }

  if (error || !data) {
    console.error('[Quota] Failed to refund apples:', error?.message)
    return fallbackQuota(userId)
  }

  return toQuotaInfoFromRpc(data)
}

async function getOrResetQuotaLegacy(userId: string): Promise<QuotaInfo> {
  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]
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
        daily_apple_limit: DEFAULT_DAILY_LIMIT,
        apples_used_today: 0,
        last_reset_date: today,
      })
      .select()
      .single()
    if (insertError || !created) {
      console.error('[Quota] Legacy quota create failed:', insertError?.message)
      return fallbackQuota(userId)
    }
    return toQuotaInfo(created)
  }

  if (String(quota.last_reset_date) !== today) {
    const { data: reset, error: resetError } = await supabase
      .from('user_quotas')
      .update({ apples_used_today: 0, last_reset_date: today })
      .eq('user_id', userId)
      .select()
      .single()
    if (resetError || !reset) {
      console.error('[Quota] Legacy quota reset failed:', resetError?.message)
      return toQuotaInfo({ ...quota, apples_used_today: 0, last_reset_date: today })
    }
    return toQuotaInfo(reset)
  }

  return toQuotaInfo(quota)
}

async function consumeApplesLegacy(
  userId: string,
  count: number,
): Promise<{ success: boolean; quota: QuotaInfo }> {
  const quota = await getOrResetQuotaLegacy(userId)
  if (!quota.dbConnected || quota.remaining < count) {
    return { success: !quota.dbConnected, quota }
  }

  const supabase = createServiceClient()
  const { data: updated, error } = await supabase
    .from('user_quotas')
    .update({ apples_used_today: quota.usedToday + count })
    .eq('user_id', userId)
    .select()
    .single()
  if (error || !updated) {
    console.error('[Quota] Legacy consume failed:', error?.message)
    return { success: true, quota }
  }
  return { success: true, quota: toQuotaInfo(updated) }
}

async function refundApplesLegacy(userId: string, count: number): Promise<QuotaInfo> {
  const quota = await getOrResetQuotaLegacy(userId)
  if (!quota.dbConnected) return quota
  const nextUsed = Math.max(0, quota.usedToday - count)
  if (nextUsed === quota.usedToday) return quota

  const supabase = createServiceClient()
  const { data: updated, error } = await supabase
    .from('user_quotas')
    .update({ apples_used_today: nextUsed })
    .eq('user_id', userId)
    .select()
    .single()
  if (error || !updated) {
    console.error('[Quota] Legacy refund failed:', error?.message)
    return quota
  }
  return toQuotaInfo(updated)
}

function fallbackQuota(userId: string): QuotaInfo {
  return {
    userId,
    isPaid: false,
    dailyLimit: DEFAULT_DAILY_LIMIT,
    usedToday: 0,
    remaining: DEFAULT_DAILY_LIMIT,
    membershipExpiresAt: null,
    bonusAppleLimit: 0,
    bonusExpiresAt: null,
    dbConnected: false,
  }
}

function toQuotaInfoFromRpc(row: QuotaRpcRow): QuotaInfo {
  return toQuotaInfo({
    user_id: row.user_id,
    is_paid: row.is_paid,
    daily_apple_limit: row.daily_apple_limit,
    membership_expires_at: row.membership_expires_at,
    bonus_apple_limit: row.bonus_apple_limit,
    bonus_expires_at: row.bonus_expires_at,
    apples_used_today: row.apples_used_today,
    last_reset_date: row.last_reset_date,
    created_at: '',
    updated_at: '',
  })
}

function toQuotaInfo(row: UserQuota): QuotaInfo {
  const now = new Date()
  const membershipActive = row.is_paid && (
    !row.membership_expires_at || isFutureTimestamp(row.membership_expires_at, now)
  )
  const bonusActive = (row.bonus_apple_limit || 0) > 0 && isFutureTimestamp(row.bonus_expires_at, now)
  const baseLimit = membershipActive
    ? Math.max(row.daily_apple_limit || DEFAULT_DAILY_LIMIT, PAID_DAILY_APPLE_LIMIT)
    : (row.daily_apple_limit || DEFAULT_DAILY_LIMIT)
  const bonusLimit = bonusActive ? row.bonus_apple_limit || 0 : 0
  const effectiveLimit = baseLimit + bonusLimit

  return {
    userId: row.user_id,
    isPaid: membershipActive,
    dailyLimit: effectiveLimit,
    usedToday: row.apples_used_today,
    remaining: Math.max(0, effectiveLimit - row.apples_used_today),
    membershipExpiresAt: row.membership_expires_at,
    bonusAppleLimit: bonusLimit,
    bonusExpiresAt: row.bonus_expires_at,
    dbConnected: true,
  }
}
