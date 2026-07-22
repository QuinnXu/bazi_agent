import { NextResponse } from 'next/server'
import { getBillingProduct } from '@/lib/billing-catalog'
import {
  createOttPayCheckout,
  isOttPayCheckoutEnabled,
  OttPayCheckoutError,
} from '@/lib/ottpay'
import { getOrResetQuota } from '@/lib/quota'
import { createServiceClient } from '@/lib/supabase/client'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function publicBaseUrl(req: Request): string {
  const configured = process.env.OTTPAY_PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim()
  return (configured || new URL(req.url).origin).replace(/\/$/, '')
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    if (!isOttPayCheckoutEnabled()) {
      return NextResponse.json({
        error: '支付通道配置尚未通过校验，暂未开放',
        code: 'CHECKOUT_DISABLED',
      }, { status: 503 })
    }

    const body = await req.json().catch(() => ({}))
    const product = getBillingProduct(typeof body.sku === 'string' ? body.sku : '')
    if (!product) return NextResponse.json({ error: '商品不存在' }, { status: 400 })
    if (product.testOnly) return NextResponse.json({ error: '测试商品仅可从支付测试页创建' }, { status: 403 })

    const serviceClient = createServiceClient()
    const quota = await getOrResetQuota(user.id)
    if (product.kind === 'apple_pack' && quota.tier === 'ultra') {
      return NextResponse.json({ error: 'Ultra 有效期内无需购买苹果包' }, { status: 409 })
    }
    if (product.kind === 'membership' && product.trial) {
      const [{ data: claim }, { data: paid }] = await Promise.all([
        serviceClient.from('billing_trial_claims').select('id').eq('user_id', user.id).maybeSingle(),
        serviceClient.from('membership_entitlements').select('id').eq('user_id', user.id)
          .in('source', ['legacy', 'ottpay']).limit(1),
      ])
      if (claim || (paid?.length || 0) > 0) {
        return NextResponse.json({ error: '该账号不符合体验资格' }, { status: 409 })
      }
    }
    if (product.kind === 'membership' && product.trialUpgrade) {
      const { data: claim } = await serviceClient.from('billing_trial_claims')
        .select('upgrade_credit_expires_at, upgrade_credit_redeemed_at')
        .eq('user_id', user.id).maybeSingle()
      const eligible = claim && !claim.upgrade_credit_redeemed_at &&
        new Date(claim.upgrade_credit_expires_at).getTime() > Date.now()
      if (!eligible) return NextResponse.json({ error: '体验抵扣已失效或已使用' }, { status: 409 })
    }

    const baseUrl = publicBaseUrl(req)
    if (process.env.NODE_ENV === 'production' && !baseUrl.startsWith('https://')) {
      return NextResponse.json({ error: 'OTTPAY_PUBLIC_BASE_URL 必须使用 HTTPS' }, { status: 500 })
    }
    const result = await createOttPayCheckout({
      userId: user.id,
      email: user.email,
      product,
      publicBaseUrl: baseUrl,
      client: serviceClient,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[OTT Pay] checkout failed:', error)
    if (error instanceof OttPayCheckoutError) {
      return NextResponse.json({
        error: error.message,
        code: error.code,
        activeOrder: error.activeOrder,
      }, { status: error.httpStatus })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '创建支付失败', code: 'CHECKOUT_FAILED' }, { status: 502 })
  }
}
