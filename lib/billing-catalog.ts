import type { MembershipTier } from '@/lib/apple-costs'

export type BillingDurationId = 'trial' | 'test' | 'week' | 'month' | 'quarter' | 'year'
export type BillingProductKind = 'membership' | 'apple_pack'

interface BillingProductBase {
  sku: string
  kind: BillingProductKind
  name: string
  priceCny: number
  highlighted?: boolean
  testOnly?: boolean
}

export interface MembershipBillingProduct extends BillingProductBase {
  kind: 'membership'
  tier: Exclude<MembershipTier, 'free'>
  duration: BillingDurationId
  durationDays: number
  trial?: boolean
  trialUpgrade?: boolean
}

export interface ApplePackBillingProduct extends BillingProductBase {
  kind: 'apple_pack'
  appleAmount: number
  appleExpiryDays: number
}

export type BillingProduct = MembershipBillingProduct | ApplePackBillingProduct

export const MEMBERSHIP_PRODUCTS: readonly MembershipBillingProduct[] = [
  { sku: 'plus-trial-3d', kind: 'membership', name: 'Plus 3 天体验', priceCny: 3, tier: 'plus', duration: 'trial', durationDays: 3, trial: true },
  { sku: 'plus-week', kind: 'membership', name: 'Plus 周卡', priceCny: 7, tier: 'plus', duration: 'week', durationDays: 7 },
  { sku: 'plus-month', kind: 'membership', name: 'Plus 月卡', priceCny: 19, tier: 'plus', duration: 'month', durationDays: 30, highlighted: true },
  { sku: 'plus-month-trial-upgrade', kind: 'membership', name: 'Plus 月卡体验升级', priceCny: 16, tier: 'plus', duration: 'month', durationDays: 30, trialUpgrade: true },
  { sku: 'plus-quarter', kind: 'membership', name: 'Plus 季卡', priceCny: 49, tier: 'plus', duration: 'quarter', durationDays: 90 },
  { sku: 'plus-year', kind: 'membership', name: 'Plus 年卡', priceCny: 169, tier: 'plus', duration: 'year', durationDays: 365 },
  { sku: 'ultra-week', kind: 'membership', name: 'Ultra 周卡', priceCny: 19, tier: 'ultra', duration: 'week', durationDays: 7 },
  { sku: 'ultra-month', kind: 'membership', name: 'Ultra 月卡', priceCny: 49, tier: 'ultra', duration: 'month', durationDays: 30, highlighted: true },
  { sku: 'ultra-quarter', kind: 'membership', name: 'Ultra 季卡', priceCny: 129, tier: 'ultra', duration: 'quarter', durationDays: 90 },
  { sku: 'ultra-year', kind: 'membership', name: 'Ultra 年卡', priceCny: 399, tier: 'ultra', duration: 'year', durationDays: 365 },
] as const

export const APPLE_PACK_PRODUCTS: readonly ApplePackBillingProduct[] = [
  { sku: 'apple-pack-10', kind: 'apple_pack', name: '10 个苹果', priceCny: 3, appleAmount: 10, appleExpiryDays: 90 },
  { sku: 'apple-pack-30', kind: 'apple_pack', name: '30 个苹果', priceCny: 8, appleAmount: 30, appleExpiryDays: 90, highlighted: true },
  { sku: 'apple-pack-100', kind: 'apple_pack', name: '100 个苹果', priceCny: 22, appleAmount: 100, appleExpiryDays: 90 },
] as const

export const OTTPAY_TEST_PRODUCTS: readonly BillingProduct[] = [
  { sku: 'test-plus-1d', kind: 'membership', name: 'Plus 1 天支付测试', priceCny: 0.01, tier: 'plus', duration: 'test', durationDays: 1, testOnly: true },
  { sku: 'test-ultra-1d', kind: 'membership', name: 'Ultra 1 天支付测试', priceCny: 0.01, tier: 'ultra', duration: 'test', durationDays: 1, testOnly: true },
  { sku: 'test-apple-1', kind: 'apple_pack', name: '1 个苹果充值测试', priceCny: 0.01, appleAmount: 1, appleExpiryDays: 7, testOnly: true },
] as const

export const BILLING_PRODUCTS: readonly BillingProduct[] = [
  ...MEMBERSHIP_PRODUCTS,
  ...APPLE_PACK_PRODUCTS,
]

export function getBillingProduct(sku: string | null | undefined): BillingProduct | null {
  if (!sku) return null
  return [...BILLING_PRODUCTS, ...OTTPAY_TEST_PRODUCTS].find(product => product.sku === sku) || null
}

export function getOttPayTestProduct(
  kind: BillingProductKind,
  membershipTier: 'plus' | 'ultra' = 'plus',
): BillingProduct {
  const sku = kind === 'apple_pack' ? 'test-apple-1' : `test-${membershipTier}-1d`
  const product = OTTPAY_TEST_PRODUCTS.find(item => item.sku === sku)
  if (!product) throw new Error('测试商品配置不存在')
  return product
}

export function getMembershipProduct(
  tier: Exclude<MembershipTier, 'free'>,
  duration: BillingDurationId,
): MembershipBillingProduct | null {
  return MEMBERSHIP_PRODUCTS.find(product => (
    product.tier === tier && product.duration === duration && !product.trialUpgrade
  )) || null
}
