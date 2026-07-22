import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { BillingHistoryView } from '@/components/billing-history-view'
import {
  getAppleChargeDetail,
  getAppleChargeStatus,
  getAppleCreditTitle,
  getPaymentProductSummary,
  resolvePaymentHistoryStatus,
  type AppleHistoryItem,
  type BillingHistoryData,
  type PaymentHistoryItem,
} from '@/lib/billing-history'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: '充值与消费记录 - 卜卜象',
  description: '查询当前账户的支付订单、苹果充值与消费记录。',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function BillingHistoryPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) redirect('/')

  const now = new Date().toISOString()
  const [ordersResult, creditsResult, chargesResult, activeLotsResult] = await Promise.all([
    supabase
      .from('ottpay_orders')
      .select('prepay_order_id, sku, amount_cents, currency, status, provider_payment_reference, user_cancelled_at, processed_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('apple_wallet_lots')
      .select('id, source, sku, initial_amount, expires_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('apple_charge_transactions')
      .select('id, membership_tier, requested_amount, daily_amount, wallet_amount, settled_at, refunded_at, created_at')
      .eq('user_id', user.id)
      .gt('requested_amount', 0)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('apple_wallet_lots')
      .select('remaining_amount, expires_at')
      .eq('user_id', user.id)
      .gt('remaining_amount', 0)
      .gt('expires_at', now),
  ])

  const firstError = ordersResult.error || creditsResult.error || chargesResult.error || activeLotsResult.error
  if (firstError) console.error('[BillingHistory] Failed to load records:', firstError.message)

  const payments: PaymentHistoryItem[] = (ordersResult.data || []).map((order) => {
    const product = getPaymentProductSummary(order.sku)
    return {
      id: order.prepay_order_id,
      sku: order.sku,
      productName: product.name,
      productKind: product.kind,
      amountCents: order.amount_cents,
      currency: order.currency,
      status: resolvePaymentHistoryStatus(order.status, order.user_cancelled_at),
      providerReference: order.provider_payment_reference,
      createdAt: order.created_at,
      completedAt: order.processed_at,
    }
  })

  const credits: AppleHistoryItem[] = (creditsResult.data || []).map((lot) => ({
    id: lot.id,
    kind: 'credit',
    title: getAppleCreditTitle(lot.source),
    amount: lot.initial_amount,
    status: 'credited',
    detail: lot.sku,
    createdAt: lot.created_at,
    expiresAt: lot.expires_at,
  }))

  const charges: AppleHistoryItem[] = (chargesResult.data || []).map((charge) => ({
    id: charge.id,
    kind: 'charge',
    title: '苹果消费',
    amount: charge.requested_amount,
    status: getAppleChargeStatus({ settledAt: charge.settled_at, refundedAt: charge.refunded_at }),
    detail: getAppleChargeDetail({
      dailyAmount: charge.daily_amount,
      walletAmount: charge.wallet_amount,
      membershipTier: charge.membership_tier,
    }),
    createdAt: charge.created_at,
    expiresAt: null,
  }))

  const activeLots = activeLotsResult.data || []
  const data: BillingHistoryData = {
    walletBalance: activeLots.reduce((sum, lot) => sum + lot.remaining_amount, 0),
    walletExpiresAt: activeLots.length > 0
      ? activeLots.reduce<string | null>((earliest, lot) => (
          !earliest || lot.expires_at < earliest ? lot.expires_at : earliest
        ), null)
      : null,
    payments,
    apples: [...credits, ...charges].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100),
  }

  return <BillingHistoryView data={data} hasLoadError={Boolean(firstError)} />
}
