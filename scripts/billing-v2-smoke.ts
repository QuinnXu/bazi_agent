import assert from 'node:assert/strict'
import {
  APPLE_PACK_PRODUCTS,
  BILLING_PRODUCTS,
  MEMBERSHIP_PRODUCTS,
  OTTPAY_TEST_PRODUCTS,
  getBillingProduct,
} from '@/lib/billing-catalog'
import {
  decryptOttPayData,
  encryptOttPayData,
  mapOttPayProviderStatus,
  normalizeOttPayProviderStatus,
  ottPayDigest,
  parseOttPayProductSnapshot,
  quoteOttPayProduct,
  resolveCadPerCny,
  resolveExchangeRateAsOf,
  resolveOttPayCurrency,
  validateOttPayQuery,
} from '@/lib/ottpay'
import {
  AGENT_REPORT_APPLE_COSTS_BY_PLAN,
  CLASSIC_CHAT_APPLE_COSTS,
  FEATURE_APPLE_COSTS_BY_PLAN,
  LIUYAO_APPLE_COSTS_BY_PLAN,
} from '@/lib/apple-costs'
import { createChargeSettledStream } from '@/lib/quota-stream'
import { getMembershipEntryLabel } from '@/lib/membership-plans'
import {
  getAppleChargeDetail,
  getAppleChargeStatus,
  getAppleCreditTitle,
  getPaymentProductSummary,
  resolvePaymentHistoryStatus,
} from '@/lib/billing-history'

const expectedMemberships = [
  ['plus-trial-3d', 'plus', 3, 3],
  ['plus-week', 'plus', 7, 7],
  ['plus-month', 'plus', 30, 19],
  ['plus-month-trial-upgrade', 'plus', 30, 16],
  ['plus-quarter', 'plus', 90, 49],
  ['plus-year', 'plus', 365, 169],
  ['ultra-week', 'ultra', 7, 19],
  ['ultra-month', 'ultra', 30, 49],
  ['ultra-quarter', 'ultra', 90, 129],
  ['ultra-year', 'ultra', 365, 399],
] as const

const expectedPacks = [
  ['apple-pack-10', 10, 3],
  ['apple-pack-30', 30, 8],
  ['apple-pack-100', 100, 22],
] as const

assert.equal(new Set(BILLING_PRODUCTS.map(product => product.sku)).size, BILLING_PRODUCTS.length)
assert.equal(MEMBERSHIP_PRODUCTS.length, expectedMemberships.length)
assert.equal(APPLE_PACK_PRODUCTS.length, expectedPacks.length)
assert.equal(OTTPAY_TEST_PRODUCTS.length, 3)
assert.equal(BILLING_PRODUCTS.some(product => product.testOnly), false)
assert.equal(getBillingProduct('test-plus-1d')?.priceCny, 0.01)
assert.equal(getBillingProduct('test-ultra-1d')?.priceCny, 0.01)
assert.equal(getBillingProduct('test-apple-1')?.priceCny, 0.01)
assert.equal(getMembershipEntryLabel(), '会员套餐')
assert.equal(getMembershipEntryLabel('free'), '升级会员')
assert.equal(getMembershipEntryLabel('plus'), '升级 / 续费')
assert.equal(getMembershipEntryLabel('ultra'), '会员权益')
assert.equal(resolvePaymentHistoryStatus('succeeded'), 'succeeded')
assert.equal(resolvePaymentHistoryStatus('pending', '2026-07-22T00:00:00Z'), 'cancelled')
assert.deepEqual(getPaymentProductSummary('test-apple-1'), {
  name: '1 个苹果充值测试',
  kind: 'apple_pack',
})
assert.equal(getAppleCreditTitle('referral'), '邀请奖励')
assert.equal(getAppleChargeStatus({ settledAt: null, refundedAt: '2026-07-22T00:00:00Z' }), 'refunded')
assert.equal(getAppleChargeDetail({ dailyAmount: 1, walletAmount: 2, membershipTier: 'plus' }), '每日额度 1 · 充值余额 2 · Plus')

for (const [sku, tier, durationDays, priceCny] of expectedMemberships) {
  const product = getBillingProduct(sku)
  assert(product && product.kind === 'membership', `${sku} must be a membership product`)
  assert.equal(product.tier, tier)
  assert.equal(product.durationDays, durationDays)
  assert.equal(product.priceCny, priceCny)
}

for (const [sku, appleAmount, priceCny] of expectedPacks) {
  const product = getBillingProduct(sku)
  assert(product && product.kind === 'apple_pack', `${sku} must be an apple pack`)
  assert.equal(product.appleAmount, appleAmount)
  assert.equal(product.priceCny, priceCny)
  assert.equal(product.appleExpiryDays, 90)
}

const trialProduct = getBillingProduct('plus-trial-3d')
const upgradeProduct = getBillingProduct('plus-month-trial-upgrade')
assert.equal(trialProduct?.kind === 'membership' && trialProduct.trial, true)
assert.equal(upgradeProduct?.kind === 'membership' && upgradeProduct.trialUpgrade, true)

const ottPayFixture = {
  amount: '1',
  biz_type: 'PREPAY',
  merchant_id: 'TEST0001',
  prepay_order_id: 'BBXTEST0001',
}
assert.equal(ottPayDigest(ottPayFixture), ottPayDigest({
  prepay_order_id: 'BBXTEST0001',
  merchant_id: 'TEST0001',
  biz_type: 'PREPAY',
  amount: '1',
}))
const encryptedFixture = encryptOttPayData(ottPayFixture, 'TEST-SIGN-KEY')
assert.deepEqual(
  decryptOttPayData(encryptedFixture.data, encryptedFixture.md5, 'TEST-SIGN-KEY'),
  ottPayFixture,
)
assert.throws(
  () => decryptOttPayData(encryptedFixture.data, encryptedFixture.md5, 'WRONG-SIGN-KEY'),
)

assert.equal(resolveOttPayCurrency(), 'CAD')
assert.equal(resolveOttPayCurrency('cad'), 'CAD')
assert.throws(() => resolveOttPayCurrency('CNY'))
assert.equal(resolveCadPerCny('0.2077'), 0.2077)
assert.throws(() => resolveCadPerCny('0'))
assert.equal(resolveExchangeRateAsOf('2026-07-20'), '2026-07-20')
assert.throws(() => resolveExchangeRateAsOf('07/20/2026'))
const plusMonthQuote = quoteOttPayProduct(getBillingProduct('plus-month')!, {
  cadPerCny: 0.2077,
  exchangeRateAsOf: '2026-07-20',
})
assert.equal(plusMonthQuote.settlementAmountMinor, 395)
assert.equal(plusMonthQuote.settlementAmount, 3.95)
assert.equal(plusMonthQuote.settlementCurrency, 'CAD')
assert.equal(plusMonthQuote.exchangeRateCadPerCny, 0.2077)
assert.equal(quoteOttPayProduct(getBillingProduct('test-plus-1d')!).settlementAmountMinor, 1)
assert.equal(normalizeOttPayProviderStatus('orderclosed'), 'ORDERCLOSED')
assert.equal(mapOttPayProviderStatus('ORDERCLOSE'), 'closed')
assert.equal(mapOttPayProviderStatus('orderclosed'), 'closed')
assert.equal(mapOttPayProviderStatus('ORDER_CLOSED'), 'closed')
assert.equal(mapOttPayProviderStatus('processing'), 'processing')
assert.equal(mapOttPayProviderStatus('unknown', true), 'closed')
assert.equal(mapOttPayProviderStatus('SUCCESS', true), 'succeeded')
const expectedProviderOrder = {
  status: 'processing',
  amount: '1',
  currency_type: 'CAD',
  merchant_id: 'ONTEST',
  shop_id: 'ONTEST001',
}
assert.equal(validateOttPayQuery(expectedProviderOrder, {
  amountCents: 1,
  currency: 'CAD',
  merchantId: 'ONTEST',
  shopId: 'ONTEST001',
}), null)
assert.match(validateOttPayQuery({ ...expectedProviderOrder, currency_type: 'CNY' }, {
  amountCents: 1,
  currency: 'CAD',
  merchantId: 'ONTEST',
  shopId: 'ONTEST001',
}) || '', /CNY/)
assert.deepEqual(
  parseOttPayProductSnapshot({
    kind: 'membership',
    sku: 'retired-plus-plan',
    tier: 'plus',
    durationDays: 30,
    trial: false,
    trialUpgrade: false,
  }, 'retired-plus-plan'),
  {
    kind: 'membership',
    sku: 'retired-plus-plan',
    tier: 'plus',
    durationDays: 30,
    trial: false,
    trialUpgrade: false,
  },
)
assert.throws(() => parseOttPayProductSnapshot({
  kind: 'apple_pack',
  sku: 'apple-pack-10',
  appleAmount: 10,
  appleExpiryDays: 90,
}, 'different-sku'))

assert.deepEqual(CLASSIC_CHAT_APPLE_COSTS, { free: 1, plus: 1, ultra: 0 })
assert.deepEqual(AGENT_REPORT_APPLE_COSTS_BY_PLAN, {
  concise: { free: 1, plus: 0, ultra: 0 },
  balanced: { free: 3, plus: 2, ultra: 0 },
  detailed: { free: 6, plus: 4, ultra: 0 },
})
assert.deepEqual(FEATURE_APPLE_COSTS_BY_PLAN, {
  hepan: { free: 4, plus: 3, ultra: 0 },
  fortune: { free: 3, plus: 2, ultra: 0 },
  avatar: { free: 2, plus: 1, ultra: 0 },
  lifepath: { free: 6, plus: 4, ultra: 0 },
})
assert.deepEqual(LIUYAO_APPLE_COSTS_BY_PLAN, {
  reading: { free: 5, plus: 3, ultra: 0 },
  followUp: { free: 0, plus: 0, ultra: 0 },
})

async function verifyChargeSettlementRetry() {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let completeAttempts = 0
  let refundAttempts = 0
  const retryingStream = createChargeSettledStream(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('ok'))
        controller.close()
      },
    }),
    { userId: 'user-1', chargeId: 'charge-1' },
    {
      complete: async () => {
        completeAttempts += 1
        if (completeAttempts === 1) throw new Error('transient settlement failure')
      },
      refund: async () => {
        refundAttempts += 1
      },
    },
  )
  const reader = retryingStream.getReader()
  let streamedText = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    streamedText += decoder.decode(value, { stream: true })
  }
  streamedText += decoder.decode()
  assert.equal(streamedText, 'ok')
  assert.equal(completeAttempts, 2)
  assert.equal(refundAttempts, 0)
}

verifyChargeSettlementRetry()
  .then(() => {
    console.log(`Billing V2 smoke passed: ${BILLING_PRODUCTS.length} SKUs and all tier rates verified.`)
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
