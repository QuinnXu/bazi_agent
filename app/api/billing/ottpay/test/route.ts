import { NextResponse } from 'next/server'
import { getBillingProduct, getOttPayTestProduct, type BillingProductKind } from '@/lib/billing-catalog'
import {
  createOttPayCheckout,
  getOttPayCheckoutBlockers,
  getOttPayMissingConfig,
  isOttPayCheckoutEnabled,
  isOttPayConfigured,
  OttPayCheckoutError,
  quoteOttPayProduct,
  syncAndFulfillOttPayOrder,
} from '@/lib/ottpay'
import { getOrResetQuota, type QuotaInfo } from '@/lib/quota'
import { createServiceClient } from '@/lib/supabase/client'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function testUserIds(): Set<string> {
  return new Set(
    (process.env.OTTPAY_TEST_USER_IDS || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
  )
}

async function requireTestUser() {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { error: NextResponse.json({ error: '请先登录测试账号' }, { status: 401 }) }
  const allowedIds = testUserIds()
  if (allowedIds.size === 0) {
    return { error: NextResponse.json({ error: '支付测试账号白名单尚未配置' }, { status: 503 }) }
  }
  if (!allowedIds.has(user.id)) {
    return { error: NextResponse.json({ error: '当前账号不在支付测试白名单中' }, { status: 403 }) }
  }
  return { user }
}

function publicBaseUrl(req: Request): string {
  return (
    process.env.OTTPAY_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    new URL(req.url).origin
  ).replace(/\/$/, '')
}

function productSummary(product: ReturnType<typeof getOttPayTestProduct>, quota: QuotaInfo) {
  const quote = quoteOttPayProduct(product)
  return {
    sku: product.sku,
    kind: product.kind,
    name: product.name,
    priceCny: product.priceCny,
    settlementCurrency: quote.settlementCurrency,
    settlementAmountMinor: quote.settlementAmountMinor,
    settlementAmount: quote.settlementAmount,
    available: product.kind !== 'apple_pack' || quota.tier !== 'ultra',
    benefit: product.kind === 'membership'
      ? `${product.tier === 'ultra' ? 'Ultra' : 'Plus'} 会员 ${product.durationDays} 天`
      : `${product.appleAmount} 个苹果（${product.appleExpiryDays} 天有效）`,
  }
}

function testStatus(quota: QuotaInfo) {
  const membershipProduct = getOttPayTestProduct(
    'membership',
    quota.tier === 'ultra' ? 'ultra' : 'plus',
  )
  const appleProduct = getOttPayTestProduct('apple_pack')
  return {
    configured: isOttPayConfigured(),
    enabled: isOttPayCheckoutEnabled() && process.env.OTTPAY_LIVE_TEST_CONFIRM === 'YES',
    missing: isOttPayCheckoutEnabled() ? getOttPayMissingConfig() : getOttPayCheckoutBlockers(),
    currency: 'CAD',
    amountMinor: 1,
    paymentMethod: 'ALIPAY' as const,
    products: [productSummary(membershipProduct, quota), productSummary(appleProduct, quota)],
    quota,
  }
}

export async function GET(req: Request) {
  const auth = await requireTestUser()
  if (auth.error) return auth.error

  const prepayOrderId = new URL(req.url).searchParams.get('prepayOrderId')?.trim()
  if (!prepayOrderId) {
    const quota = await getOrResetQuota(auth.user.id)
    return NextResponse.json(testStatus(quota))
  }

  try {
    const client = createServiceClient()
    const { data: order } = await client.from('ottpay_orders')
      .select('user_id, sku')
      .eq('prepay_order_id', prepayOrderId)
      .maybeSingle()
    const product = getBillingProduct(order?.sku)
    if (!order || order.user_id !== auth.user.id || !product?.testOnly) {
      return NextResponse.json({ error: '测试订单不存在' }, { status: 404 })
    }

    const result = await syncAndFulfillOttPayOrder(prepayOrderId, client)
    const quota = await getOrResetQuota(auth.user.id)
    return NextResponse.json({
      ...result,
      product: productSummary(product, quota),
      quota,
    })
  } catch (error) {
    console.error('[OTT Pay] test order sync failed:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : '查单失败' }, { status: 502 })
  }
}

export async function POST(req: Request) {
  const auth = await requireTestUser()
  if (auth.error) return auth.error

  const quota = await getOrResetQuota(auth.user.id)
  const status = testStatus(quota)
  if (!status.configured || !status.enabled) {
    return NextResponse.json({
      error: !status.configured ? 'OTT Pay 必填配置不完整' : '真实支付测试开关未开启',
      ...status,
    }, { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  const kind: BillingProductKind | null = body.kind === 'membership' || body.kind === 'apple_pack'
    ? body.kind
    : null
  if (!kind) return NextResponse.json({ error: '请选择会员或苹果充值测试' }, { status: 400 })
  if (kind === 'apple_pack' && quota.tier === 'ultra') {
    return NextResponse.json({ error: 'Ultra 有效期内不能购买苹果包，请切换到 Plus 测试账号测试充值' }, { status: 409 })
  }

  try {
    const product = getOttPayTestProduct(kind, quota.tier === 'ultra' ? 'ultra' : 'plus')
    const baseUrl = publicBaseUrl(req)
    if (process.env.NODE_ENV === 'production' && !baseUrl.startsWith('https://')) {
      return NextResponse.json({ error: 'OTTPAY_PUBLIC_BASE_URL 必须使用 HTTPS' }, { status: 500 })
    }
    const result = await createOttPayCheckout({
      userId: auth.user.id,
      email: auth.user.email,
      product,
      publicBaseUrl: baseUrl,
      client: createServiceClient(),
      redirectPath: '/payment-test',
    })
    return NextResponse.json({
      ...result,
      paymentMethod: 'ALIPAY',
      amountMinor: 1,
      currency: 'CAD',
      product: productSummary(product, quota),
    })
  } catch (error) {
    console.error('[OTT Pay] entitlement test checkout failed:', error)
    if (error instanceof OttPayCheckoutError) {
      return NextResponse.json({
        error: error.message,
        code: error.code,
        activeOrder: error.activeOrder,
      }, { status: error.httpStatus })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '创建测试订单失败', code: 'CHECKOUT_FAILED' }, { status: 502 })
  }
}
