import { getBillingProduct } from '@/lib/billing-catalog'

export type PaymentHistoryStatus = 'creating' | 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'closed'
export type AppleHistoryStatus = 'credited' | 'processing' | 'settled' | 'refunded'

export interface PaymentHistoryItem {
  id: string
  sku: string
  productName: string
  productKind: 'membership' | 'apple_pack' | 'unknown'
  amountCents: number
  currency: string
  status: PaymentHistoryStatus
  providerReference: string | null
  createdAt: string
  completedAt: string | null
}

export interface AppleHistoryItem {
  id: string
  kind: 'credit' | 'charge'
  title: string
  amount: number
  status: AppleHistoryStatus
  detail: string
  createdAt: string
  expiresAt: string | null
}

export interface BillingHistoryData {
  walletBalance: number
  walletExpiresAt: string | null
  payments: PaymentHistoryItem[]
  apples: AppleHistoryItem[]
}

export function resolvePaymentHistoryStatus(
  status: string,
  userCancelledAt?: string | null,
): PaymentHistoryStatus {
  if (userCancelledAt && status !== 'succeeded') return 'cancelled'
  if (status === 'created') return 'creating'
  if (status === 'pending') return 'pending'
  if (status === 'processing') return 'processing'
  if (status === 'succeeded') return 'succeeded'
  if (status === 'failed') return 'failed'
  return 'closed'
}

export function getPaymentProductSummary(sku: string): {
  name: string
  kind: PaymentHistoryItem['productKind']
} {
  const product = getBillingProduct(sku)
  return {
    name: product?.name || sku || '历史商品',
    kind: product?.kind || 'unknown',
  }
}

export function getAppleCreditTitle(source: string): string {
  const titles: Record<string, string> = {
    ottpay: '支付充值',
    redemption: '兑换码充值',
    referral: '邀请奖励',
    admin: '运营赠送',
    refund: '消费退款',
    legacy: '历史余额转入',
  }
  return titles[source] || '苹果入账'
}

export function getAppleChargeStatus(input: {
  settledAt: string | null
  refundedAt: string | null
}): AppleHistoryStatus {
  if (input.refundedAt) return 'refunded'
  if (input.settledAt) return 'settled'
  return 'processing'
}

export function getAppleChargeDetail(input: {
  dailyAmount: number
  walletAmount: number
  membershipTier: string
}): string {
  const parts: string[] = []
  if (input.dailyAmount > 0) parts.push(`每日额度 ${input.dailyAmount}`)
  if (input.walletAmount > 0) parts.push(`充值余额 ${input.walletAmount}`)
  if (parts.length === 0) parts.push('会员权益')
  const tier = input.membershipTier === 'ultra' ? 'Ultra' : input.membershipTier === 'plus' ? 'Plus' : 'Free'
  return `${parts.join(' · ')} · ${tier}`
}
