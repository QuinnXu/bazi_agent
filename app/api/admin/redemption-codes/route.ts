import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/client'
import { isAdmin } from '@/lib/admin'
import { generatePromotionCode, normalizeRedemptionCode } from '@/lib/rewards'
import type { RedemptionCodeKind } from '@/types/database_v2'

export const runtime = 'nodejs'

const CODE_KINDS: RedemptionCodeKind[] = ['membership_days', 'bonus_quota', 'combo']

function toNonNegativeInt(value: unknown, fallback = 0): number {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(0, Math.floor(num))
}

function nullablePositiveInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  return Math.floor(num)
}

function toIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const text = String(value)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T23:59:59.999Z`)
    : new Date(text)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

async function requireAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { error: NextResponse.json({ error: '请先登录' }, { status: 401 }), user: null }
  }
  if (!isAdmin(user.email)) {
    return { error: NextResponse.json({ error: '无权限访问' }, { status: 403 }), user: null }
  }
  return { error: null, user }
}

export async function GET() {
  try {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const serviceClient = createServiceClient()
    const { data, error } = await serviceClient
      .from('redemption_codes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) {
      console.error('[Admin Redemption Codes] GET error:', error.message)
      return NextResponse.json({ error: '获取兑换码失败' }, { status: 500 })
    }

    return NextResponse.json({ codes: data || [] })
  } catch (error) {
    console.error('[Admin Redemption Codes] GET exception:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin()
    if (auth.error) return auth.error
    const user = auth.user!

    const body = await req.json().catch(() => ({}))
    const kind = CODE_KINDS.includes(body.kind) ? body.kind as RedemptionCodeKind : 'membership_days'
    const membershipDays = toNonNegativeInt(body.membership_days, kind === 'membership_days' ? 7 : 0)
    const bonusAppleLimit = toNonNegativeInt(body.bonus_apple_limit, 0)
    const bonusDays = toNonNegativeInt(body.bonus_days, 0)

    if (membershipDays <= 0 && !(bonusAppleLimit > 0 && bonusDays > 0)) {
      return NextResponse.json({ error: '请至少配置会员天数，或配置额外额度和有效天数' }, { status: 400 })
    }

    const serviceClient = createServiceClient()
    let code = normalizeRedemptionCode(body.code)

    for (let attempt = 0; !code && attempt < 10; attempt += 1) {
      const candidate = normalizeRedemptionCode(generatePromotionCode(kind))
      const { data: exists } = await serviceClient
        .from('redemption_codes')
        .select('code')
        .eq('code', candidate)
        .maybeSingle()
      if (!exists) code = candidate
    }

    if (!code) {
      return NextResponse.json({ error: '无法生成兑换码' }, { status: 500 })
    }

    const { data: created, error } = await serviceClient
      .from('redemption_codes')
      .insert({
        code,
        description: typeof body.description === 'string' ? body.description.trim() || null : null,
        kind,
        membership_days: membershipDays,
        bonus_apple_limit: bonusAppleLimit,
        bonus_days: bonusDays,
        max_redemptions: nullablePositiveInt(body.max_redemptions),
        starts_at: toIsoOrNull(body.starts_at) || new Date().toISOString(),
        expires_at: toIsoOrNull(body.expires_at),
        is_active: body.is_active !== false,
        created_by: user.id,
      })
      .select()
      .single()

    if (error || !created) {
      console.error('[Admin Redemption Codes] POST error:', error?.message)
      const duplicate = error?.message.toLowerCase().includes('duplicate')
      return NextResponse.json(
        { error: duplicate ? '兑换码已存在' : '创建兑换码失败' },
        { status: duplicate ? 409 : 500 },
      )
    }

    return NextResponse.json({ success: true, code: created })
  } catch (error) {
    console.error('[Admin Redemption Codes] POST exception:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const body = await req.json().catch(() => ({}))
    const code = normalizeRedemptionCode(body.code)
    if (!code) {
      return NextResponse.json({ error: '缺少兑换码' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    if (typeof body.description === 'string') updateData.description = body.description.trim() || null
    if (typeof body.is_active === 'boolean') updateData.is_active = body.is_active
    if ('max_redemptions' in body) updateData.max_redemptions = nullablePositiveInt(body.max_redemptions)
    if ('starts_at' in body) updateData.starts_at = toIsoOrNull(body.starts_at) || new Date().toISOString()
    if ('expires_at' in body) updateData.expires_at = toIsoOrNull(body.expires_at)

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '没有需要更新的字段' }, { status: 400 })
    }

    const serviceClient = createServiceClient()
    const { data: updated, error } = await serviceClient
      .from('redemption_codes')
      .update(updateData)
      .eq('code', code)
      .select()
      .single()

    if (error || !updated) {
      console.error('[Admin Redemption Codes] PATCH error:', error?.message)
      return NextResponse.json({ error: '更新兑换码失败' }, { status: 500 })
    }

    return NextResponse.json({ success: true, code: updated })
  } catch (error) {
    console.error('[Admin Redemption Codes] PATCH exception:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
