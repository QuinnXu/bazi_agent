import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { createServiceClient } from '@/lib/supabase/client'
import { grantUserBenefits } from '@/lib/rewards'
import type { AfdianOrderProcessStatus, Database } from '@/types/database_v2'

type ServiceClient = ReturnType<typeof createServiceClient>
type AfdianOrderInsert = Database['public']['Tables']['afdian_orders']['Insert']
type AfdianOrderUpdate = Database['public']['Tables']['afdian_orders']['Update']

const AFDIAN_API_BASE = 'https://afdian.com/api/open'
const AFDIAN_OAUTH_BASE = 'https://afdian.net'
const BINDING_CODE_PREFIX = 'BUBU'
const BINDING_CODE_TTL_HOURS = 72

export interface AfdianApiEnvelope<T = unknown> {
  ec: number
  em: string
  data?: T
}

export interface AfdianProcessResult {
  outTradeNo: string | null
  status: AfdianOrderProcessStatus
  message: string
  userId?: string | null
  appliedMembershipDays?: number
}

interface NormalizedAfdianOrder {
  outTradeNo: string | null
  afdianUserId: string | null
  userPrivateId: string | null
  planId: string | null
  month: number
  totalAmount: number | null
  showAmount: number | null
  status: number | null
  remark: string | null
  bindingCode: string | null
  raw: Record<string, unknown>
}

function env(name: string): string {
  return process.env[name] || ''
}

function md5(value: string): string {
  return createHash('md5').update(value).digest('hex')
}

function safeJsonStringify(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value ?? {})
}

export function signAfdianParams(params: string, ts: string | number, userId = env('AFDIAN_USER_ID')): string {
  return md5(`${env('AFDIAN_API_TOKEN')}params${params}ts${ts}user_id${userId}`)
}

export function verifyAfdianSign(input: {
  params: unknown
  ts: string | number
  userId?: string
  sign?: string | null
}): boolean {
  if (!input.sign) return false
  const expected = signAfdianParams(safeJsonStringify(input.params), input.ts, input.userId || env('AFDIAN_USER_ID'))
  const a = Buffer.from(expected)
  const b = Buffer.from(input.sign)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function getAfdianCreatorUrl(): string {
  return process.env.NEXT_PUBLIC_AFDIAN_CREATOR_URL || 'https://afdian.com'
}

export function getAfdianOAuthAuthorizeUrl(state: string, redirectUri: string): string {
  const url = new URL('/oauth2/authorize', AFDIAN_OAUTH_BASE)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'basic')
  url.searchParams.set('client_id', env('AFDIAN_OAUTH_CLIENT_ID'))
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  return url.toString()
}

export async function exchangeAfdianOAuthCode(code: string, redirectUri: string): Promise<{
  afdianUserId: string
  userPrivateId: string | null
}> {
  const form = new URLSearchParams()
  form.set('grant_type', 'authorization_code')
  form.set('client_id', env('AFDIAN_OAUTH_CLIENT_ID'))
  form.set('client_secret', env('AFDIAN_OAUTH_CLIENT_SECRET'))
  form.set('code', code)
  form.set('redirect_uri', redirectUri)

  const res = await fetch(`${AFDIAN_OAUTH_BASE}/api/oauth2/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  })
  const json = await res.json().catch(() => ({})) as AfdianApiEnvelope<Record<string, string>>
  if (!res.ok || json.ec !== 200 || !json.data?.user_id) {
    throw new Error(json.em || '爱发电授权失败')
  }

  return {
    afdianUserId: String(json.data.user_id),
    userPrivateId: json.data.user_private_id ? String(json.data.user_private_id) : null,
  }
}

export async function callAfdianOpenApi<T>(path: string, params: Record<string, unknown> = {}): Promise<AfdianApiEnvelope<T>> {
  const userId = env('AFDIAN_USER_ID')
  const ts = Math.floor(Date.now() / 1000).toString()
  const paramsText = JSON.stringify(params)
  const form = new URLSearchParams()
  form.set('user_id', userId)
  form.set('params', paramsText)
  form.set('ts', ts)
  form.set('sign', signAfdianParams(paramsText, ts, userId))

  const res = await fetch(`${AFDIAN_API_BASE}/${path.replace(/^\//, '')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  })
  return await res.json().catch(() => ({ ec: res.status, em: '爱发电接口返回异常' })) as AfdianApiEnvelope<T>
}

export function generateAfdianBindingCode(): string {
  return `${BINDING_CODE_PREFIX}${randomBytes(5).toString('hex').toUpperCase()}`
}

export async function createBindingCode(userId: string, client: ServiceClient = createServiceClient()) {
  for (let i = 0; i < 8; i += 1) {
    const code = generateAfdianBindingCode()
    const expiresAt = new Date(Date.now() + BINDING_CODE_TTL_HOURS * 60 * 60 * 1000).toISOString()
    const { data, error } = await client
      .from('afdian_binding_codes')
      .insert({ code, user_id: userId, expires_at: expiresAt })
      .select()
      .single()
    if (!error && data) return data
    if (!error?.message.toLowerCase().includes('duplicate')) {
      throw new Error(`生成绑定码失败：${error?.message || '没有返回绑定码'}`)
    }
  }
  throw new Error('生成绑定码失败：冲突过多')
}

function textValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  return String(value)
}

function numberValue(value: unknown): number | null {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function intValue(value: unknown, fallback = 1): number {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback
}

function findBindingCode(text: string | null): string | null {
  if (!text) return null
  const match = text.toUpperCase().match(/\bBUBU[A-Z0-9]{8,12}\b/)
  return match?.[0] || null
}

function normalizeOrder(rawInput: unknown): NormalizedAfdianOrder {
  const raw = (rawInput && typeof rawInput === 'object' ? rawInput : {}) as Record<string, any>
  const sku = Array.isArray(raw.sku_detail) ? raw.sku_detail[0] || {} : raw.sku_detail || {}
  const planId = textValue(raw.plan_id ?? sku.plan_id ?? raw.product_id ?? sku.product_id)
  const remark = textValue(raw.remark ?? raw.user_remark ?? raw.address_person ?? raw.custom_order_id)
  return {
    outTradeNo: textValue(raw.out_trade_no ?? raw.order_id ?? raw.trade_no),
    afdianUserId: textValue(raw.user_id ?? raw.sponsor_user_id),
    userPrivateId: textValue(raw.user_private_id),
    planId,
    month: intValue(raw.month ?? sku.month, 1),
    totalAmount: numberValue(raw.total_amount),
    showAmount: numberValue(raw.show_amount),
    status: numberValue(raw.status),
    remark,
    bindingCode: findBindingCode(remark),
    raw: raw as Record<string, unknown>,
  }
}

async function bindFromCodeIfPossible(order: NormalizedAfdianOrder, client: ServiceClient): Promise<string | null> {
  if (!order.bindingCode || !order.afdianUserId) return null
  const { data: codeRow } = await client
    .from('afdian_binding_codes')
    .select('*')
    .eq('code', order.bindingCode)
    .gt('expires_at', new Date().toISOString())
    .is('used_at', null)
    .maybeSingle()

  if (!codeRow) return null

  await client
    .from('afdian_bindings')
    .upsert({
      user_id: codeRow.user_id,
      afdian_user_id: order.afdianUserId,
      user_private_id: order.userPrivateId,
      binding_method: 'binding_code',
    }, { onConflict: 'user_id' })

  await client
    .from('afdian_binding_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('code', codeRow.code)

  return codeRow.user_id
}

async function resolveBoundUser(order: NormalizedAfdianOrder, client: ServiceClient): Promise<string | null> {
  if (order.afdianUserId) {
    const { data } = await client
      .from('afdian_bindings')
      .select('user_id')
      .eq('afdian_user_id', order.afdianUserId)
      .maybeSingle()
    if (data?.user_id) return data.user_id
  }

  if (order.userPrivateId) {
    const { data } = await client
      .from('afdian_bindings')
      .select('user_id')
      .eq('user_private_id', order.userPrivateId)
      .maybeSingle()
    if (data?.user_id) return data.user_id
  }

  return await bindFromCodeIfPossible(order, client)
}

async function updateOrderStatus(
  outTradeNo: string,
  status: AfdianOrderProcessStatus,
  errorMessage: string | null,
  client: ServiceClient,
  extra: AfdianOrderUpdate = {},
) {
  await client
    .from('afdian_orders')
    .update({
      process_status: status,
      error_message: errorMessage,
      processing_started_at: null,
      ...extra,
    })
    .eq('out_trade_no', outTradeNo)
}

export async function processAfdianOrder(rawInput: unknown, client: ServiceClient = createServiceClient()): Promise<AfdianProcessResult> {
  const order = normalizeOrder(rawInput)
  if (!order.outTradeNo) {
    return { outTradeNo: null, status: 'ignored', message: '订单缺少 out_trade_no' }
  }

  const insert: AfdianOrderInsert = {
    out_trade_no: order.outTradeNo,
    afdian_user_id: order.afdianUserId,
    user_private_id: order.userPrivateId,
    binding_code: order.bindingCode,
    plan_id: order.planId,
    month: order.month,
    total_amount: order.totalAmount,
    show_amount: order.showAmount,
    status: order.status,
    remark: order.remark,
    raw: order.raw,
  }

  await client.from('afdian_orders').upsert(insert, { onConflict: 'out_trade_no' })

  const { data: locked } = await client
    .from('afdian_orders')
    .update({ process_status: 'processing', processing_started_at: new Date().toISOString(), error_message: null })
    .eq('out_trade_no', order.outTradeNo)
    .neq('process_status', 'processed')
    .select()
    .maybeSingle()

  if (!locked) {
    return { outTradeNo: order.outTradeNo, status: 'processed', message: '订单已处理，跳过重复通知' }
  }

  if (order.status !== 2) {
    await updateOrderStatus(order.outTradeNo, 'ignored', '订单不是支付成功状态', client)
    return { outTradeNo: order.outTradeNo, status: 'ignored', message: '订单不是支付成功状态' }
  }

  const userId = await resolveBoundUser(order, client)
  if (!userId) {
    await updateOrderStatus(order.outTradeNo, 'unmatched', '没有找到已绑定的站内用户', client)
    return { outTradeNo: order.outTradeNo, status: 'unmatched', message: '没有找到已绑定的站内用户' }
  }

  if (!order.planId) {
    await updateOrderStatus(order.outTradeNo, 'needs_mapping', '订单没有 plan_id，需人工处理', client, { user_id: userId })
    return { outTradeNo: order.outTradeNo, status: 'needs_mapping', message: '订单没有 plan_id，需人工处理', userId }
  }

  const { data: mapping } = await client
    .from('afdian_plan_mappings')
    .select('*')
    .eq('plan_id', order.planId)
    .eq('is_active', true)
    .maybeSingle()

  if (!mapping) {
    await updateOrderStatus(order.outTradeNo, 'needs_mapping', `未配置或未启用套餐映射：${order.planId}`, client, { user_id: userId })
    return { outTradeNo: order.outTradeNo, status: 'needs_mapping', message: `未配置或未启用套餐映射：${order.planId}`, userId }
  }

  const membershipDays = Math.max(0, mapping.membership_days * order.month)
  const bonusDays = Math.max(0, mapping.bonus_days * order.month)
  await grantUserBenefits(userId, {
    membershipDays,
    bonusAppleLimit: mapping.bonus_apple_limit,
    bonusDays,
  }, client)

  await updateOrderStatus(order.outTradeNo, 'processed', null, client, {
    user_id: userId,
    applied_membership_days: membershipDays,
    applied_bonus_apple_limit: mapping.bonus_apple_limit,
    applied_bonus_days: bonusDays,
    processed_at: new Date().toISOString(),
  })

  return {
    outTradeNo: order.outTradeNo,
    status: 'processed',
    message: '订单已处理并发放权益',
    userId,
    appliedMembershipDays: membershipDays,
  }
}

export function normalizeWebhookParams(value: unknown): { paramsText: string; parsed: any } {
  const paramsText = safeJsonStringify(value)
  const parsed = typeof value === 'string'
    ? JSON.parse(value || '{}')
    : value
  return { paramsText, parsed }
}
