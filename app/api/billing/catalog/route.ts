import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/client'
import { BILLING_PRODUCTS } from '@/lib/billing-catalog'
import { isOttPayCheckoutEnabled, isOttPayConfigured, quoteOttPayProduct } from '@/lib/ottpay'
import { getOrResetQuota } from '@/lib/quota'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    const serviceClient = createServiceClient()
    const paymentConfigured = isOttPayConfigured()
    const paymentEnabled = isOttPayCheckoutEnabled()
    const exchangeRateCadPerCny = paymentConfigured ? Number(process.env.OTTPAY_CAD_PER_CNY) : null
    const exchangeRateAsOf = paymentConfigured ? process.env.OTTPAY_EXCHANGE_RATE_DATE || null : null

    let tier: 'guest' | 'free' | 'plus' | 'ultra' = user ? 'free' : 'guest'
    let trialEligible = false
    let trialUpgradeEligible = false

    if (user) {
      const [quota, claimResult, paidResult] = await Promise.all([
        getOrResetQuota(user.id),
        serviceClient
          .from('billing_trial_claims')
          .select('upgrade_credit_expires_at, upgrade_credit_redeemed_at')
          .eq('user_id', user.id)
          .maybeSingle(),
        serviceClient
          .from('membership_entitlements')
          .select('id')
          .eq('user_id', user.id)
          .in('source', ['legacy', 'ottpay'])
          .limit(1),
      ])
      tier = quota.tier
      const claim = claimResult.data
      trialEligible = !claim && (paidResult.data?.length || 0) === 0
      trialUpgradeEligible = Boolean(
        claim &&
        !claim.upgrade_credit_redeemed_at &&
        new Date(claim.upgrade_credit_expires_at).getTime() > Date.now()
      )
    }

    const products = BILLING_PRODUCTS.map(product => {
      const membershipProduct = product.kind === 'membership' ? product : null
      const eligible = user && (
        product.kind === 'apple_pack'
          ? tier !== 'ultra'
          : membershipProduct?.trial
            ? trialEligible
            : membershipProduct?.trialUpgrade
              ? trialUpgradeEligible
              : true
      )
      return {
        ...product,
        ...(paymentConfigured ? quoteOttPayProduct(product, {
          cadPerCny: exchangeRateCadPerCny || undefined,
          exchangeRateAsOf: exchangeRateAsOf || undefined,
        }) : {}),
        planId: product.sku,
        available: Boolean(paymentEnabled && eligible),
        eligibilityReason: !user
          ? 'login_required'
          : product.kind === 'apple_pack' && tier === 'ultra'
            ? 'ultra_active'
            : membershipProduct?.trial && !trialEligible
              ? 'trial_unavailable'
            : membershipProduct?.trialUpgrade && !trialUpgradeEligible
                ? 'trial_credit_unavailable'
                : !paymentEnabled
                  ? paymentConfigured ? 'payment_paused' : 'payment_unconfigured'
                  : null,
      }
    })

    return NextResponse.json({
      currency: 'CNY',
      settlementCurrency: 'CAD',
      exchangeRateCadPerCny,
      exchangeRateAsOf,
      exchangeRateSource: 'Bank of Canada daily average',
      renewal: 'fixed_term',
      timezone: 'Asia/Shanghai',
      tier,
      trialEligible,
      trialUpgradeEligible,
      paymentProvider: 'ottpay',
      paymentConfigured,
      paymentEnabled,
      products,
    })
  } catch (error) {
    console.error('[Billing Catalog] failed:', error)
    return NextResponse.json({ error: '获取商品目录失败' }, { status: 500 })
  }
}
