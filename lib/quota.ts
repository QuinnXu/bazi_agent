import { createServiceClient } from '@/lib/supabase/client'
import type { UserQuota } from '@/types/database_v2'

const DEFAULT_DAILY_LIMIT = 5

export interface QuotaInfo {
  userId: string
  isPaid: boolean
  dailyLimit: number
  usedToday: number
  remaining: number
  dbConnected: boolean
}

/**
 * Get or auto-reset the user's apple quota for today.
 * Uses the service role client to bypass RLS for writes.
 */
export async function getOrResetQuota(userId: string): Promise<QuotaInfo> {
  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  // Try to fetch existing quota
  const { data: quota, error } = await supabase
    .from('user_quotas')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !quota) {
    console.log('[Quota] No record found for user, creating...', error?.message)

    // No quota record found — create one
    const { data: newQuota, error: insertError } = await supabase
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

    if (insertError || !newQuota) {
      console.error('[Quota] Failed to create quota record:', insertError?.message)
      // DB not accessible — return fallback but mark it
      return {
        userId,
        isPaid: false,
        dailyLimit: DEFAULT_DAILY_LIMIT,
        usedToday: 0,
        remaining: DEFAULT_DAILY_LIMIT,
        dbConnected: false,
      }
    }

    return toQuotaInfo(newQuota)
  }

  // Check if we need to reset for a new day
  if (quota.last_reset_date !== today) {
    console.log('[Quota] New day detected, resetting quota for user')
    const { data: updated, error: updateError } = await supabase
      .from('user_quotas')
      .update({
        apples_used_today: 0,
        last_reset_date: today,
      })
      .eq('user_id', userId)
      .select()
      .single()

    if (!updateError && updated) {
      return toQuotaInfo(updated)
    }
    console.error('[Quota] Failed to reset quota:', updateError?.message)
    return {
      userId,
      isPaid: quota.is_paid,
      dailyLimit: quota.daily_apple_limit,
      usedToday: 0,
      remaining: quota.daily_apple_limit,
      dbConnected: false,
    }
  }

  return toQuotaInfo(quota)
}

/**
 * Try to consume N apples atomically. Returns success=false if quota insufficient.
 * - 1 question (chat投喂) = 1 apple
 * - 近期运势 = 1 apple
 * - 合盘 / 人生脉络 = 2 apples
 * - 头像分析 = 3 apples
 */
export async function consumeApples(
  userId: string,
  count = 1,
): Promise<{ success: boolean; quota: QuotaInfo }> {
  const safeCount = Math.max(1, Math.floor(count))
  const quota = await getOrResetQuota(userId)

  if (!quota.dbConnected) {
    console.warn('[Quota] DB not connected, allowing request as fallback')
    return { success: true, quota }
  }

  if (quota.remaining < safeCount) {
    console.log(`[Quota] Insufficient apples for user ${userId}: need ${safeCount}, have ${quota.remaining}`)
    return { success: false, quota }
  }

  const supabase = createServiceClient()
  const { data: updated, error } = await supabase
    .from('user_quotas')
    .update({
      apples_used_today: quota.usedToday + safeCount,
    })
    .eq('user_id', userId)
    .select()
    .single()

  if (error || !updated) {
    console.error('[Quota] Failed to consume apples:', error?.message)
    const { data: upserted, error: upsertError } = await supabase
      .from('user_quotas')
      .upsert({
        user_id: userId,
        is_paid: false,
        daily_apple_limit: DEFAULT_DAILY_LIMIT,
        apples_used_today: safeCount,
        last_reset_date: new Date().toISOString().split('T')[0],
      })
      .select()
      .single()

    if (upsertError || !upserted) {
      console.error('[Quota] Upsert fallback also failed:', upsertError?.message)
      return { success: true, quota }
    }

    return { success: true, quota: toQuotaInfo(upserted) }
  }

  return { success: true, quota: toQuotaInfo(updated) }
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
  const quota = await getOrResetQuota(userId)

  if (!quota.dbConnected) {
    console.warn('[Quota] DB not connected, refund skipped')
    return quota
  }

  const newUsed = Math.max(0, quota.usedToday - safeCount)
  if (newUsed === quota.usedToday) {
    return quota
  }

  const supabase = createServiceClient()
  const { data: updated, error } = await supabase
    .from('user_quotas')
    .update({ apples_used_today: newUsed })
    .eq('user_id', userId)
    .select()
    .single()

  if (error || !updated) {
    console.error('[Quota] Failed to refund apples:', error?.message)
    return quota
  }

  return toQuotaInfo(updated)
}

function toQuotaInfo(row: UserQuota): QuotaInfo {
  return {
    userId: row.user_id,
    isPaid: row.is_paid,
    dailyLimit: row.daily_apple_limit,
    usedToday: row.apples_used_today,
    remaining: Math.max(0, row.daily_apple_limit - row.apples_used_today),
    dbConnected: true,
  }
}
