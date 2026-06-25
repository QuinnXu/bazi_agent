import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/client'
import { isAdmin } from '@/lib/admin'
import { ensureUserProfileAndReferralCode, normalizeReferralCode } from '@/lib/rewards'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * GET /api/admin/quotas
 * Returns all user quotas joined with profile emails.
 * Admin only.
 */
function toIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const text = String(value)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T23:59:59.999Z`)
    : new Date(text)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export async function GET(req: Request) {
  try {
    // Auth + admin check
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    if (!isAdmin(user.email)) {
      return NextResponse.json({ error: '无权限访问' }, { status: 403 })
    }

    // Use service role to query across tables
    const serviceClient = createServiceClient()

    // Get confirmed users from auth (only those with verified emails)
    const { data: { users: authUsers }, error: authListError } = await serviceClient.auth.admin.listUsers({
      perPage: 1000,
    })

    if (authListError) {
      console.error('[Admin] Failed to list auth users:', authListError.message)
      return NextResponse.json({ error: '获取用户列表失败' }, { status: 500 })
    }

    // Filter to only email-confirmed users
    const confirmedUsers = (authUsers || []).filter(u => u.email_confirmed_at)

    for (let i = 0; i < confirmedUsers.length; i += 25) {
      await Promise.all(confirmedUsers.slice(i, i + 25).map(u =>
        ensureUserProfileAndReferralCode(serviceClient, {
          id: u.id,
          email: u.email,
          displayName: typeof u.user_metadata?.display_name === 'string'
            ? u.user_metadata.display_name
            : null,
        }),
      ))
    }

    // Get all quotas
    const { data: quotas, error: quotasError } = await serviceClient
      .from('user_quotas')
      .select('*')

    if (quotasError) {
      console.error('[Admin] Failed to fetch quotas:', quotasError.message)
      return NextResponse.json({ error: '获取配额列表失败' }, { status: 500 })
    }

    const { data: profiles, error: profilesError } = await serviceClient
      .from('profiles')
      .select('id, email, display_name, referral_code, referred_by, referral_bound_at')

    if (profilesError) {
      console.error('[Admin] Failed to fetch profiles:', profilesError.message)
      return NextResponse.json({ error: '获取用户推荐信息失败' }, { status: 500 })
    }

    const { data: referrals, error: referralsError } = await serviceClient
      .from('referrals')
      .select('referrer_user_id, referred_user_id, status')

    if (referralsError) {
      console.warn('[Admin] Failed to fetch referral stats:', referralsError.message)
    }

    const { data: redemptions, error: redemptionsError } = await serviceClient
      .from('redemption_redemptions')
      .select('user_id')

    if (redemptionsError) {
      console.warn('[Admin] Failed to fetch redemption stats:', redemptionsError.message)
    }

    // Build a map of quotas by user_id
    const quotaMap = new Map<string, typeof quotas[0]>()
    for (const q of quotas || []) {
      quotaMap.set(q.user_id, q)
    }

    const profileMap = new Map<string, typeof profiles[0]>()
    const emailMap = new Map<string, string>()
    for (const u of confirmedUsers) {
      emailMap.set(u.id, u.email || '')
    }
    for (const p of profiles || []) {
      profileMap.set(p.id, p)
      if (p.email) emailMap.set(p.id, p.email)
    }

    const referralCountMap = new Map<string, number>()
    for (const r of referrals || []) {
      if (r.status !== 'rewarded') continue
      referralCountMap.set(r.referrer_user_id, (referralCountMap.get(r.referrer_user_id) || 0) + 1)
    }

    const redemptionCountMap = new Map<string, number>()
    for (const r of redemptions || []) {
      redemptionCountMap.set(r.user_id, (redemptionCountMap.get(r.user_id) || 0) + 1)
    }

    const origin = new URL(req.url).origin

    // Merge: confirmed auth users + their quota info
    const result = confirmedUsers.map(u => {
      const q = quotaMap.get(u.id)
      const p = profileMap.get(u.id)
      const referralCode = p?.referral_code || ''
      const referredByEmail = p?.referred_by ? emailMap.get(p.referred_by) || p.referred_by.slice(0, 8) : null
      const membershipActive = !!q?.is_paid && (
        !q.membership_expires_at || new Date(q.membership_expires_at).getTime() > Date.now()
      )
      return {
        user_id: u.id,
        email: u.email || '',
        display_name: p?.display_name || u.user_metadata?.display_name || null,
        is_paid: membershipActive,
        daily_apple_limit: q?.daily_apple_limit ?? 5,
        membership_expires_at: q?.membership_expires_at ?? null,
        bonus_apple_limit: q?.bonus_apple_limit ?? 0,
        bonus_expires_at: q?.bonus_expires_at ?? null,
        apples_used_today: q?.apples_used_today ?? 0,
        last_reset_date: q?.last_reset_date ?? null,
        has_quota_record: !!q,
        referral_code: referralCode,
        invite_link: referralCode ? `${origin}/?ref=${encodeURIComponent(referralCode)}` : '',
        referred_by: p?.referred_by ?? null,
        referred_by_email: referredByEmail,
        referral_bound_at: p?.referral_bound_at ?? null,
        referral_count: referralCountMap.get(u.id) || 0,
        redemption_count: redemptionCountMap.get(u.id) || 0,
        created_at: u.created_at,
      }
    })

    return NextResponse.json({ users: result })
  } catch (error) {
    console.error('[Admin] GET error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/quotas
 * Update a single user's quota.
 * Body: { user_id, is_paid?, daily_apple_limit? }
 * Admin only.
 */
export async function PATCH(req: Request) {
  try {
    // Auth + admin check
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    if (!isAdmin(user.email)) {
      return NextResponse.json({ error: '无权限访问' }, { status: 403 })
    }

    const body = await req.json()
    const {
      user_id,
      is_paid,
      daily_apple_limit,
      membership_expires_at,
      bonus_apple_limit,
      bonus_expires_at,
      referral_code,
    } = body

    if (!user_id) {
      return NextResponse.json({ error: '缺少 user_id' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // Build the update object
    const updateData: Record<string, any> = {}
    if (typeof is_paid === 'boolean') updateData.is_paid = is_paid
    if (typeof daily_apple_limit === 'number') updateData.daily_apple_limit = daily_apple_limit
    if ('membership_expires_at' in body) updateData.membership_expires_at = toIsoOrNull(membership_expires_at)
    if (typeof bonus_apple_limit === 'number') updateData.bonus_apple_limit = Math.max(0, Math.floor(bonus_apple_limit))
    if ('bonus_expires_at' in body) updateData.bonus_expires_at = toIsoOrNull(bonus_expires_at)

    if (updateData.membership_expires_at && new Date(updateData.membership_expires_at).getTime() > Date.now()) {
      updateData.is_paid = true
      updateData.daily_apple_limit = Math.max(Number(updateData.daily_apple_limit || daily_apple_limit || 5), 999)
    }

    if (typeof is_paid === 'boolean' && !is_paid && !('membership_expires_at' in body)) {
      updateData.membership_expires_at = null
    }

    if (typeof referral_code === 'string') {
      const normalizedReferralCode = normalizeReferralCode(referral_code)
      if (!normalizedReferralCode) {
        return NextResponse.json({ error: '推荐码不能为空' }, { status: 400 })
      }

      const { error: profileError } = await serviceClient
        .from('profiles')
        .update({ referral_code: normalizedReferralCode })
        .eq('id', user_id)

      if (profileError) {
        console.error('[Admin] Failed to update referral code:', profileError.message)
        const duplicate = profileError.message.toLowerCase().includes('duplicate')
        return NextResponse.json(
          { error: duplicate ? '推荐码已被其他用户使用' : '更新推荐码失败' },
          { status: duplicate ? 409 : 500 },
        )
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: true })
    }

    // Upsert: create the quota record if it doesn't exist
    const { data: updated, error: updateError } = await serviceClient
      .from('user_quotas')
      .upsert({
        user_id,
        ...updateData,
      })
      .select()
      .single()

    if (updateError) {
      console.error('[Admin] Failed to update quota:', updateError.message)
      return NextResponse.json({ error: '更新失败: ' + updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, quota: updated })
  } catch (error) {
    console.error('[Admin] PATCH error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
