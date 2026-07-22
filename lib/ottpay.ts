import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto'
import { getBillingProduct, type BillingProduct } from '@/lib/billing-catalog'
import { createServiceClient } from '@/lib/supabase/client'
import type { OttPayOrder } from '@/types/database_v2'

const DEFAULT_API_URL = 'https://frontapi.ottpay.com:443/processV2'
const CHECKOUT_ACTION = 'PREPAY_INIT'
const QUERY_ACTION = 'PREPAY_QUERY'
const API_VERSION = '2.0'
export const OTTPAY_ORDER_DURATION_SECONDS = 900

type ServiceClient = ReturnType<typeof createServiceClient>
type JsonRecord = Record<string, unknown>
type OttPayOrderStatus = OttPayOrder['status']

interface OttPayEnvelope {
  rsp_code?: string
  rsp_msg?: string
  merchant_id?: string
  data?: string
  md5?: string
}

export interface OttPayConfig {
  apiUrl: string
  merchantId: string
  shopId: string
  operatorId: string
  signKey: string
  currency: 'CAD'
  cadPerCny: number
  exchangeRateAsOf: string
}

export interface OttPayProductQuote {
  displayCurrency: 'CNY'
  displayAmountCny: number
  settlementCurrency: 'CAD'
  settlementAmountMinor: number
  settlementAmount: number
  exchangeRateCadPerCny: number | null
  exchangeRateAsOf: string | null
  pricingMode: 'fixed_exchange_rate' | 'fixed_test'
}

type StoredBillingBenefit =
  | {
      kind: 'membership'
      sku: string
      tier: 'plus' | 'ultra'
      durationDays: number
      trial: boolean
      trialUpgrade: boolean
    }
  | {
      kind: 'apple_pack'
      sku: string
      appleAmount: number
      appleExpiryDays: number
    }

export interface OttPayOrderProductSummary {
  sku: string
  kind: BillingProduct['kind']
  name: string
  priceCny: number
  settlementCurrency: 'CAD'
  settlementAmountMinor: number
  settlementAmount: number
  exchangeRateCadPerCny: number | null
  exchangeRateAsOf: string | null
}

export interface OttPayOrderResult {
  prepayOrderId: string
  status: OttPayOrderStatus
  payUrl?: string | null
  message?: string | null
  expiresAt?: string | null
  reused?: boolean
  product?: OttPayOrderProductSummary | null
  cancelled?: boolean
}

export class OttPayCheckoutError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus = 502,
    readonly activeOrder?: OttPayOrderResult,
  ) {
    super(message)
    this.name = 'OttPayCheckoutError'
  }
}

interface ProviderOrderFacts {
  status: string
  amountCents: number
  currency: 'CAD' | 'USD' | 'CNY' | null
  merchantId: string
  shopId: string
  providerOrderId: string | null
  paymentReference: string | null
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`缺少 OTT Pay 配置：${name}`)
  return value
}

export function isOttPayConfigured(): boolean {
  return Boolean(
    process.env.OTTPAY_MERCHANT_ID?.trim() &&
    process.env.OTTPAY_SHOP_ID?.trim() &&
    process.env.OTTPAY_OPERATOR_ID?.trim() &&
    process.env.OTTPAY_SIGN_KEY?.trim() &&
    (process.env.OTTPAY_CURRENCY?.trim().toUpperCase() || 'CAD') === 'CAD' &&
    validCadPerCny(process.env.OTTPAY_CAD_PER_CNY) !== null &&
    validExchangeRateDate(process.env.OTTPAY_EXCHANGE_RATE_DATE),
  )
}

export function isOttPayCheckoutEnabled(): boolean {
  return isOttPayConfigured() && process.env.OTTPAY_CHECKOUT_ENABLED === 'YES'
}

export function getOttPayMissingConfig(): string[] {
  const missing = ['OTTPAY_MERCHANT_ID', 'OTTPAY_SHOP_ID', 'OTTPAY_OPERATOR_ID', 'OTTPAY_SIGN_KEY']
    .filter(name => !process.env[name]?.trim())
  if ((process.env.OTTPAY_CURRENCY?.trim().toUpperCase() || 'CAD') !== 'CAD') {
    missing.push('OTTPAY_CURRENCY=CAD')
  }
  if (validCadPerCny(process.env.OTTPAY_CAD_PER_CNY) === null) missing.push('OTTPAY_CAD_PER_CNY')
  if (!validExchangeRateDate(process.env.OTTPAY_EXCHANGE_RATE_DATE)) missing.push('OTTPAY_EXCHANGE_RATE_DATE')
  return missing
}

export function getOttPayCheckoutBlockers(): string[] {
  const blockers = getOttPayMissingConfig()
  if (process.env.OTTPAY_CHECKOUT_ENABLED !== 'YES') blockers.push('OTTPAY_CHECKOUT_ENABLED=YES')
  return blockers
}

function validCadPerCny(value: string | undefined): number | null {
  const rate = Number(value)
  return Number.isFinite(rate) && rate > 0 && rate < 10 ? rate : null
}

function validExchangeRateDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)))
}

export function resolveOttPayCurrency(value = process.env.OTTPAY_CURRENCY): 'CAD' {
  const currency = value?.trim().toUpperCase() || 'CAD'
  if (currency !== 'CAD') {
    throw new Error('当前 OTT Pay 商户以 CAD 结算，OTTPAY_CURRENCY 必须为 CAD')
  }
  return 'CAD'
}

export function resolveCadPerCny(value = process.env.OTTPAY_CAD_PER_CNY): number {
  const rate = validCadPerCny(value)
  if (rate === null) throw new Error('OTTPAY_CAD_PER_CNY 必须是有效的正数汇率')
  return rate
}

export function resolveExchangeRateAsOf(value = process.env.OTTPAY_EXCHANGE_RATE_DATE): string {
  if (!validExchangeRateDate(value)) throw new Error('OTTPAY_EXCHANGE_RATE_DATE 必须使用 YYYY-MM-DD')
  return value
}

export function getOttPayConfig(): OttPayConfig {
  const currency = resolveOttPayCurrency()
  return {
    apiUrl: process.env.OTTPAY_API_URL?.trim() || DEFAULT_API_URL,
    merchantId: requiredEnv('OTTPAY_MERCHANT_ID'),
    shopId: requiredEnv('OTTPAY_SHOP_ID'),
    operatorId: requiredEnv('OTTPAY_OPERATOR_ID'),
    signKey: requiredEnv('OTTPAY_SIGN_KEY'),
    currency,
    cadPerCny: resolveCadPerCny(),
    exchangeRateAsOf: resolveExchangeRateAsOf(),
  }
}

function md5Upper(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex').toUpperCase()
}

function canonicalValue(value: unknown): string {
  if (typeof value === 'number') return `${value}.0`
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function ottPayDigest(data: JsonRecord): string {
  const source = Object.keys(data)
    .sort()
    .map(key => canonicalValue(data[key]))
    .join('')
  return md5Upper(source)
}

function aesKey(digest: string, signKey: string): Buffer {
  return Buffer.from(md5Upper(`${digest}${signKey}`).slice(8, 24), 'utf8')
}

export function encryptOttPayData(data: JsonRecord, signKey: string): { data: string; md5: string } {
  const md5 = ottPayDigest(data)
  const cipher = createCipheriv('aes-128-ecb', aesKey(md5, signKey), null)
  cipher.setAutoPadding(true)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), 'utf8'),
    cipher.final(),
  ])
  return { data: encrypted.toString('base64'), md5 }
}

export function decryptOttPayData(encrypted: string, digest: string, signKey: string): JsonRecord {
  const decipher = createDecipheriv('aes-128-ecb', aesKey(digest, signKey), null)
  decipher.setAutoPadding(true)
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.replace(/\s/g, ''), 'base64')),
    decipher.final(),
  ]).toString('utf8')
  const parsed = JSON.parse(plaintext) as JsonRecord
  const actual = Buffer.from(ottPayDigest(parsed), 'utf8')
  const expected = Buffer.from(digest.toUpperCase(), 'utf8')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('OTT Pay 响应签名校验失败')
  }
  return parsed
}

export function decodeOttPayEnvelope(envelope: OttPayEnvelope, config = getOttPayConfig()): JsonRecord {
  if (envelope.merchant_id && envelope.merchant_id !== config.merchantId) {
    throw new Error('OTT Pay 商户号不匹配')
  }
  if (!envelope.data || !envelope.md5) throw new Error('OTT Pay 响应缺少加密数据')
  return decryptOttPayData(envelope.data, envelope.md5, config.signKey)
}

async function callOttPay(action: string, data: JsonRecord, config = getOttPayConfig()): Promise<{
  envelope: OttPayEnvelope
  data: JsonRecord
}> {
  const encrypted = encryptOttPayData(data, config.signKey)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        version: API_VERSION,
        merchant_id: config.merchantId,
        ...encrypted,
      }),
      cache: 'no-store',
      signal: controller.signal,
    })
    const envelope = await response.json().catch(() => ({})) as OttPayEnvelope
    if (!response.ok) throw new Error(`OTT Pay HTTP ${response.status}`)
    if ((envelope.rsp_code || '').toUpperCase() !== 'SUCCESS') {
      throw new Error(envelope.rsp_msg || envelope.rsp_code || 'OTT Pay 请求失败')
    }
    return { envelope, data: decodeOttPayEnvelope(envelope, config) }
  } finally {
    clearTimeout(timeout)
  }
}

export function quoteOttPayProduct(
  product: BillingProduct,
  pricing: { cadPerCny?: number; exchangeRateAsOf?: string } = {},
): OttPayProductQuote {
  if (product.testOnly) {
    return {
      displayCurrency: 'CNY',
      displayAmountCny: product.priceCny,
      settlementCurrency: 'CAD',
      settlementAmountMinor: 1,
      settlementAmount: 0.01,
      exchangeRateCadPerCny: null,
      exchangeRateAsOf: null,
      pricingMode: 'fixed_test',
    }
  }
  const cadPerCny = pricing.cadPerCny ?? resolveCadPerCny()
  const exchangeRateAsOf = pricing.exchangeRateAsOf ?? resolveExchangeRateAsOf()
  const settlementAmountMinor = Math.max(1, Math.round(product.priceCny * cadPerCny * 100))
  return {
    displayCurrency: 'CNY',
    displayAmountCny: product.priceCny,
    settlementCurrency: 'CAD',
    settlementAmountMinor,
    settlementAmount: settlementAmountMinor / 100,
    exchangeRateCadPerCny: cadPerCny,
    exchangeRateAsOf,
    pricingMode: 'fixed_exchange_rate',
  }
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null
}

export function parseOttPayProductSnapshot(
  value: unknown,
  expectedSku: string,
): StoredBillingBenefit {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('订单缺少有效的商品快照，请人工核对')
  }

  const snapshot = value as Record<string, unknown>
  const sku = typeof snapshot.sku === 'string' ? snapshot.sku : ''
  if (!sku || sku !== expectedSku) {
    throw new Error('订单商品快照与订单 SKU 不一致，请人工核对')
  }

  if (snapshot.kind === 'membership') {
    const durationDays = positiveInteger(snapshot.durationDays)
    if ((snapshot.tier !== 'plus' && snapshot.tier !== 'ultra') || !durationDays) {
      throw new Error('订单会员权益快照无效，请人工核对')
    }
    return {
      kind: 'membership',
      sku,
      tier: snapshot.tier,
      durationDays,
      trial: snapshot.trial === true,
      trialUpgrade: snapshot.trialUpgrade === true,
    }
  }

  if (snapshot.kind === 'apple_pack') {
    const appleAmount = positiveInteger(snapshot.appleAmount)
    const appleExpiryDays = positiveInteger(snapshot.appleExpiryDays)
    if (!appleAmount || !appleExpiryDays) {
      throw new Error('订单苹果权益快照无效，请人工核对')
    }
    return { kind: 'apple_pack', sku, appleAmount, appleExpiryDays }
  }

  throw new Error('订单商品快照类型无效，请人工核对')
}

export function generateOttPayOrderId(): string {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  return `BBX${stamp}${randomBytes(5).toString('hex').toUpperCase()}`
}

function productSummary(
  sku: string,
  storedQuote?: Partial<OttPayProductQuote> | null,
): OttPayOrderProductSummary | null {
  const product = getBillingProduct(sku)
  if (!product) return null
  const quote = storedQuote?.settlementCurrency === 'CAD' && Number.isSafeInteger(storedQuote.settlementAmountMinor)
    ? storedQuote as OttPayProductQuote
    : quoteOttPayProduct(product)
  return {
    sku: product.sku,
    kind: product.kind,
    name: product.name,
    priceCny: product.priceCny,
    settlementCurrency: 'CAD',
    settlementAmountMinor: quote.settlementAmountMinor,
    settlementAmount: quote.settlementAmountMinor / 100,
    exchangeRateCadPerCny: quote.exchangeRateCadPerCny ?? null,
    exchangeRateAsOf: quote.exchangeRateAsOf ?? null,
  }
}

function orderResult(order: Pick<OttPayOrder, 'prepay_order_id' | 'status' | 'pay_url' | 'expires_at' | 'sku' | 'product_snapshot'>, reused = false): OttPayOrderResult {
  const snapshot = order.product_snapshot as { pricing?: Partial<OttPayProductQuote> } | null
  return {
    prepayOrderId: order.prepay_order_id,
    status: order.status,
    payUrl: order.pay_url,
    expiresAt: order.expires_at,
    reused,
    product: productSummary(order.sku, snapshot?.pricing),
  }
}

function providerText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

export function normalizeOttPayProviderStatus(value: unknown): string {
  return providerText(value).toUpperCase().replace(/[\s-]+/g, '_')
}

export function mapOttPayProviderStatus(value: unknown, expired = false): OttPayOrderStatus {
  const status = normalizeOttPayProviderStatus(value)
  if (status === 'SUCCESS' || status === 'TRADE_FINISHED') return 'succeeded'
  if (['ORDERCLOSE', 'ORDERCLOSED', 'ORDER_CLOSED', 'CLOSED'].includes(status)) return 'closed'
  if (expired) return 'closed'
  if (status === 'PROCESSING') return 'processing'
  return 'pending'
}

function responseAmountCents(value: unknown): number | null {
  const amount = Number(value)
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null
}

function providerFacts(query: JsonRecord): ProviderOrderFacts {
  const rawCurrency = providerText(query.currency_type || query.currency).toUpperCase()
  const currency = rawCurrency === 'CAD' || rawCurrency === 'USD' || rawCurrency === 'CNY'
    ? rawCurrency
    : null
  return {
    status: normalizeOttPayProviderStatus(query.status || query.order_status),
    amountCents: responseAmountCents(query.amount ?? query.total_amount) ?? -1,
    currency,
    merchantId: providerText(query.merchant_id),
    shopId: providerText(query.shop_id),
    providerOrderId: providerText(query.order_id) || null,
    paymentReference: providerText(
      query.bizpay_order_id || query.payNo || query.pay_no || query.out_trade_no,
    ) || null,
  }
}

function validateProviderFacts(
  facts: ProviderOrderFacts,
  expected: { amountCents: number; currency: string; merchantId: string; shopId: string },
): string | null {
  if (facts.merchantId !== expected.merchantId) return 'OTT Pay 查单商户号不匹配'
  if (facts.shopId !== expected.shopId) return 'OTT Pay 查单门店号不匹配'
  if (facts.currency !== expected.currency) {
    return `OTT Pay 商户实际币种为 ${facts.currency || '未知'}，期望 ${expected.currency}`
  }
  if (facts.amountCents !== expected.amountCents) {
    return `支付金额校验失败：期望 ${expected.amountCents} 分，实际 ${facts.amountCents < 0 ? '缺失' : `${facts.amountCents} 分`}`
  }
  return null
}

export function validateOttPayQuery(
  query: JsonRecord,
  expected: { amountCents: number; currency: 'CAD' | 'CNY'; merchantId: string; shopId: string },
): string | null {
  return validateProviderFacts(providerFacts(query), expected)
}

export async function queryOttPayOrder(prepayOrderId: string): Promise<JsonRecord> {
  const config = getOttPayConfig()
  const result = await callOttPay(QUERY_ACTION, {
    merchant_id: config.merchantId,
    prepay_order_id: prepayOrderId,
  }, config)
  return result.data
}

async function findActiveOrder(userId: string, client: ServiceClient): Promise<OttPayOrder | null> {
  const { data, error } = await client.from('ottpay_orders')
    .select('*')
    .eq('user_id', userId)
    .is('user_cancelled_at', null)
    .in('status', ['created', 'pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`读取未完成支付订单失败：${error.message}`)
  return data
}

export async function getActiveOttPayOrder(
  userId: string,
  client: ServiceClient = createServiceClient(),
  syncExpired = true,
): Promise<OttPayOrderResult | null> {
  const active = await findActiveOrder(userId, client)
  if (!active) return null
  if (syncExpired && new Date(active.expires_at).getTime() <= Date.now()) {
    const synced = await syncAndFulfillOttPayOrder(active.prepay_order_id, client)
    if (['succeeded', 'failed', 'closed'].includes(synced.status)) return null
    return synced
  }
  return orderResult(active, true)
}

export async function createOttPayCheckout(input: {
  userId: string
  email?: string | null
  product: BillingProduct
  publicBaseUrl: string
  client?: ServiceClient
  redirectPath?: '/membership' | '/payment-test'
}): Promise<OttPayOrderResult> {
  if (!isOttPayCheckoutEnabled()) {
    throw new OttPayCheckoutError('支付通道配置尚未通过校验，暂未开放', 'CHECKOUT_DISABLED', 503)
  }

  const client = input.client || createServiceClient()
  const config = getOttPayConfig()
  const existing = await findActiveOrder(input.userId, client)
  if (existing) {
    const existingResult = orderResult(existing, true)
    if (new Date(existing.expires_at).getTime() <= Date.now()) {
      const synced = await syncAndFulfillOttPayOrder(existing.prepay_order_id, client)
      if (!['succeeded', 'failed', 'closed'].includes(synced.status)) {
        throw new OttPayCheckoutError('上一笔订单仍在确认，请稍后重试', 'ACTIVE_ORDER_PENDING', 409, synced)
      }
    } else if (existing.sku === input.product.sku && existing.pay_url) {
      return existingResult
    } else {
      throw new OttPayCheckoutError(
        existing.sku === input.product.sku ? '订单正在创建，请稍后重试' : '你已有一笔未完成订单，请先继续支付或等待订单关闭',
        'ACTIVE_ORDER_EXISTS',
        409,
        existingResult,
      )
    }
  }

  const prepayOrderId = generateOttPayOrderId()
  const quote = quoteOttPayProduct(input.product, {
    cadPerCny: config.cadPerCny,
    exchangeRateAsOf: config.exchangeRateAsOf,
  })
  const amountCents = quote.settlementAmountMinor
  const baseUrl = input.publicBaseUrl.replace(/\/$/, '')
  const redirectPath = input.redirectPath || '/membership'
  const redirectUrl = `${baseUrl}${redirectPath}?ottpay_order=${encodeURIComponent(prepayOrderId)}`
  const callbackUrl = `${baseUrl}/api/billing/ottpay/webhook`
  const now = Date.now()
  const expiresAt = new Date(now + OTTPAY_ORDER_DURATION_SECONDS * 1000).toISOString()
  const productSnapshot = input.product.kind === 'membership'
    ? {
        kind: input.product.kind,
        sku: input.product.sku,
        tier: input.product.tier,
        durationDays: input.product.durationDays,
        trial: input.product.trial === true,
        trialUpgrade: input.product.trialUpgrade === true,
        pricing: quote,
      }
    : {
        kind: input.product.kind,
        sku: input.product.sku,
        appleAmount: input.product.appleAmount,
        appleExpiryDays: input.product.appleExpiryDays,
        pricing: quote,
      }

  const { error: insertError } = await client.from('ottpay_orders').insert({
    prepay_order_id: prepayOrderId,
    user_id: input.userId,
    sku: input.product.sku,
    amount_cents: amountCents,
    currency: config.currency,
    status: 'created',
    expires_at: expiresAt,
    product_snapshot: productSnapshot,
  })
  if (insertError) {
    if (insertError.code === '23505') {
      const active = await findActiveOrder(input.userId, client)
      const activeResult = active ? orderResult(active, true) : undefined
      throw new OttPayCheckoutError('你已有一笔未完成订单', 'ACTIVE_ORDER_EXISTS', 409, activeResult)
    }
    throw new Error(`创建本地支付订单失败：${insertError.message}`)
  }

  try {
    const requestData: JsonRecord = {
      amount: String(amountCents),
      sale_num: prepayOrderId,
      operator_id: config.operatorId,
      prepay_order_id: prepayOrderId,
      biz_type: 'PREPAY',
      merchant_id: config.merchantId,
      duration: String(OTTPAY_ORDER_DURATION_SECONDS),
      shop_id: config.shopId,
      currency_type: config.currency,
      redirect_url: redirectUrl,
      call_back_url: callbackUrl,
      remarks: input.product.sku,
    }
    if (input.email) requestData.email = input.email

    const result = await callOttPay(CHECKOUT_ACTION, requestData, config)
    const rawPayUrl = String(result.data.payInfo || result.data.payinfo || '')
    if (!rawPayUrl.startsWith('https://')) throw new Error('OTT Pay 未返回有效的 HTTPS 支付链接')

    const query = await queryOttPayOrder(prepayOrderId)
    const facts = providerFacts(query)
    const validationError = validateProviderFacts(facts, {
      amountCents,
      currency: config.currency,
      merchantId: config.merchantId,
      shopId: config.shopId,
    })
    if (validationError) {
      await client.from('ottpay_orders').update({
        status: 'failed',
        provider_status: facts.status,
        provider_order_id: facts.providerOrderId,
        provider_currency: facts.currency || null,
        provider_payment_reference: facts.paymentReference,
        raw_response: result.envelope,
        raw_query: query,
        last_synced_at: new Date().toISOString(),
        sync_attempts: 1,
        error_message: validationError,
      }).eq('prepay_order_id', prepayOrderId)
      throw new OttPayCheckoutError(validationError, 'PROVIDER_VALIDATION_FAILED', 502)
    }

    const alipayUrl = new URL(rawPayUrl)
    alipayUrl.searchParams.set('selected', 'ALIPAY')
    const payUrl = alipayUrl.toString()
    const providerExpireTime = result.data.expire_time ? String(result.data.expire_time) : null
    await client.from('ottpay_orders').update({
      status: mapOttPayProviderStatus(facts.status) === 'processing' ? 'processing' : 'pending',
      pay_url: payUrl,
      provider_expires_at: providerExpireTime,
      provider_status: facts.status,
      provider_order_id: facts.providerOrderId,
      provider_currency: facts.currency,
      provider_payment_reference: facts.paymentReference,
      raw_response: result.envelope,
      raw_query: query,
      last_synced_at: new Date().toISOString(),
      sync_attempts: 1,
      error_message: null,
    }).eq('prepay_order_id', prepayOrderId)
    return {
      prepayOrderId,
      status: 'pending',
      payUrl,
      expiresAt,
      reused: false,
      product: productSummary(input.product.sku, quote),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建 OTT Pay 支付失败'
    if (!(error instanceof OttPayCheckoutError && error.code === 'PROVIDER_VALIDATION_FAILED')) {
      await client.from('ottpay_orders').update({ status: 'failed', error_message: message })
        .eq('prepay_order_id', prepayOrderId)
    }
    throw error
  }
}

async function markSyncFailure(
  client: ServiceClient,
  order: OttPayOrder,
  message: string,
): Promise<void> {
  await client.from('ottpay_orders').update({
    error_message: message,
    last_synced_at: new Date().toISOString(),
    sync_attempts: (order.sync_attempts || 0) + 1,
  }).eq('prepay_order_id', order.prepay_order_id)
}

export async function syncAndFulfillOttPayOrder(
  prepayOrderId: string,
  client: ServiceClient = createServiceClient(),
): Promise<OttPayOrderResult> {
  const { data: order, error } = await client.from('ottpay_orders')
    .select('*')
    .eq('prepay_order_id', prepayOrderId)
    .single()
  if (error || !order) throw new Error('支付订单不存在')
  if (order.status === 'succeeded') return orderResult(order)
  if (order.status === 'failed' || order.status === 'closed') return orderResult(order)

  let query: JsonRecord
  try {
    query = await queryOttPayOrder(prepayOrderId)
  } catch (queryError) {
    const message = queryError instanceof Error ? queryError.message : 'OTT Pay 查单失败'
    await markSyncFailure(client, order, message)
    throw queryError
  }

  const config = getOttPayConfig()
  const facts = providerFacts(query)
  const validationError = validateProviderFacts(facts, {
    amountCents: order.amount_cents,
    currency: order.currency,
    merchantId: config.merchantId,
    shopId: config.shopId,
  })
  const syncFields = {
    provider_status: facts.status,
    provider_order_id: facts.providerOrderId,
    provider_currency: facts.currency || null,
    provider_payment_reference: facts.paymentReference,
    raw_query: query,
    last_synced_at: new Date().toISOString(),
    sync_attempts: (order.sync_attempts || 0) + 1,
  }

  if (validationError) {
    await client.from('ottpay_orders').update({
      ...syncFields,
      status: 'failed',
      error_message: validationError,
    }).eq('prepay_order_id', prepayOrderId)
    throw new OttPayCheckoutError(validationError, 'PROVIDER_VALIDATION_FAILED', 502)
  }

  const expired = new Date(order.expires_at).getTime() <= Date.now()
  const localStatus = mapOttPayProviderStatus(facts.status, expired)
  if (localStatus !== 'succeeded') {
    await client.from('ottpay_orders').update({
      ...syncFields,
      status: localStatus,
      error_message: null,
    }).eq('prepay_order_id', prepayOrderId)
    return { ...orderResult({ ...order, status: localStatus }), status: localStatus }
  }

  const { data: claimed } = await client.from('ottpay_orders').update({
    ...syncFields,
    status: 'processing',
    error_message: null,
  }).eq('prepay_order_id', prepayOrderId)
    .in('status', ['created', 'pending', 'processing'])
    .select('*')
    .maybeSingle()

  if (!claimed) {
    const { data: latest } = await client.from('ottpay_orders').select('*')
      .eq('prepay_order_id', prepayOrderId).single()
    if (!latest) throw new Error('支付订单状态读取失败')
    return orderResult(latest)
  }

  if (!claimed.user_id) {
    const message = '订单所属账户已注销，无法自动发放权益，请人工退款'
    await client.from('ottpay_orders').update({ status: 'failed', error_message: message })
      .eq('prepay_order_id', prepayOrderId)
    throw new Error(message)
  }

  let product: StoredBillingBenefit
  try {
    product = parseOttPayProductSnapshot(claimed.product_snapshot, claimed.sku)
  } catch (snapshotError) {
    const message = snapshotError instanceof Error ? snapshotError.message : '订单商品快照无效'
    await client.from('ottpay_orders').update({ status: 'failed', error_message: message })
      .eq('prepay_order_id', prepayOrderId)
    throw snapshotError
  }

  const metadata = {
    provider: 'ottpay',
    providerOrderId: facts.providerOrderId,
    providerPaymentReference: facts.paymentReference,
    amountCents: claimed.amount_cents,
    currency: facts.currency,
    pricing: (claimed.product_snapshot as { pricing?: OttPayProductQuote } | null)?.pricing || null,
    prepayOrderId,
  }

  try {
    if (product.kind === 'membership') {
      const { error: grantError } = await client.rpc('grant_membership_entitlement', {
        p_user_id: claimed.user_id,
        p_tier: product.tier,
        p_duration_days: product.durationDays,
        p_sku: product.sku,
        p_source: 'ottpay',
        p_external_order_id: prepayOrderId,
        p_external_buyer_id: null,
        p_is_trial: product.trial === true,
        p_is_trial_upgrade: product.trialUpgrade === true,
        p_metadata: metadata,
      })
      if (grantError) throw new Error(grantError.message)
    } else {
      const { error: grantError } = await client.rpc('grant_apple_wallet', {
        p_user_id: claimed.user_id,
        p_amount: product.appleAmount,
        p_expiry_days: product.appleExpiryDays,
        p_sku: product.sku,
        p_source: 'ottpay',
        p_external_order_id: prepayOrderId,
        p_metadata: metadata,
      })
      if (grantError) throw new Error(grantError.message)
    }
  } catch (grantError) {
    const message = grantError instanceof Error ? grantError.message : '支付成功但权益发放失败'
    await client.from('ottpay_orders').update({ status: 'processing', error_message: message })
      .eq('prepay_order_id', prepayOrderId)
    throw grantError
  }

  const processedAt = new Date().toISOString()
  await client.from('ottpay_orders').update({
    status: 'succeeded',
    processed_at: processedAt,
    error_message: null,
  }).eq('prepay_order_id', prepayOrderId)
  return orderResult({ ...claimed, status: 'succeeded' })
}

export async function cancelOttPayOrder(
  prepayOrderId: string,
  userId: string,
  client: ServiceClient = createServiceClient(),
): Promise<OttPayOrderResult> {
  const { data: ownedOrder, error } = await client.from('ottpay_orders')
    .select('*')
    .eq('prepay_order_id', prepayOrderId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`读取支付订单失败：${error.message}`)
  if (!ownedOrder) throw new OttPayCheckoutError('订单不存在', 'ORDER_NOT_FOUND', 404)

  if (ownedOrder.status === 'succeeded') return orderResult(ownedOrder)
  if (ownedOrder.status === 'failed' || ownedOrder.status === 'closed') return orderResult(ownedOrder)
  if (ownedOrder.user_cancelled_at) {
    return { ...orderResult(ownedOrder), payUrl: null, cancelled: true }
  }

  // Query first so a payment completed immediately before cancellation is fulfilled.
  // The provider has no documented Checkout close-order API, so we keep the row
  // reconcilable after releasing it from the user's active-order constraint.
  const synced = await syncAndFulfillOttPayOrder(prepayOrderId, client)
  if (['succeeded', 'failed', 'closed'].includes(synced.status)) return synced

  const cancelledAt = new Date().toISOString()
  const { data: cancelledOrder, error: cancelError } = await client.from('ottpay_orders').update({
    user_cancelled_at: cancelledAt,
    user_cancel_reason: 'user_abandoned_checkout',
    pay_url: null,
  })
    .eq('prepay_order_id', prepayOrderId)
    .eq('user_id', userId)
    .is('user_cancelled_at', null)
    .in('status', ['created', 'pending', 'processing'])
    .select('*')
    .maybeSingle()
  if (cancelError) throw new Error(`取消支付订单失败：${cancelError.message}`)

  if (cancelledOrder) {
    return {
      ...orderResult(cancelledOrder),
      payUrl: null,
      cancelled: true,
      message: '当前订单已取消，可以选择其他商品',
    }
  }

  const { data: latest } = await client.from('ottpay_orders')
    .select('*')
    .eq('prepay_order_id', prepayOrderId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!latest) throw new OttPayCheckoutError('订单不存在', 'ORDER_NOT_FOUND', 404)
  return latest.user_cancelled_at
    ? { ...orderResult(latest), payUrl: null, cancelled: true }
    : orderResult(latest)
}

export async function reconcileOttPayOrders(
  client: ServiceClient = createServiceClient(),
  limit = 10,
): Promise<{ checked: number; succeeded: number; closed: number; failed: number; pending: number; errors: number }> {
  const safeLimit = Math.max(1, Math.min(10, Math.floor(limit)))
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: orders, error } = await client.from('ottpay_orders')
    .select('prepay_order_id')
    .in('status', ['created', 'pending', 'processing'])
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: true })
    .limit(safeLimit)
  if (error) throw new Error(`读取待补单订单失败：${error.message}`)

  const summary = { checked: orders?.length || 0, succeeded: 0, closed: 0, failed: 0, pending: 0, errors: 0 }
  const queue = [...(orders || [])]
  const worker = async () => {
    while (queue.length > 0) {
      const order = queue.shift()
      if (!order) return
      try {
        const result = await syncAndFulfillOttPayOrder(order.prepay_order_id, client)
        if (result.status === 'succeeded') summary.succeeded += 1
        else if (result.status === 'closed') summary.closed += 1
        else if (result.status === 'failed') summary.failed += 1
        else summary.pending += 1
      } catch {
        summary.errors += 1
      }
    }
  }
  await Promise.all([worker(), worker(), worker()])
  return summary
}
