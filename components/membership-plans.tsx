"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  Check,
  Crown,
  ExternalLink,
  Infinity as InfinityIcon,
  MessageCircle,
  RefreshCw,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { OttPayCancelOrderButton } from "@/components/ottpay-cancel-order-button"
import { toast } from "@/hooks/use-toast"
import { useOttPayPayment } from "@/hooks/use-ottpay-payment"
import {
  applePricingRows,
  membershipPlans,
  type MembershipPlan,
  type MembershipPlanId,
} from "@/lib/membership-plans"
import type {
  ApplePackBillingProduct,
  BillingDurationId,
  MembershipBillingProduct,
} from "@/lib/billing-catalog"
import { cn } from "@/lib/utils"

export interface MembershipAppleQuota {
  tier?: 'free' | 'plus' | 'ultra'
  remaining: number
  dailyRemaining?: number
  dailyLimit: number
  walletBalance?: number
  walletExpiresAt?: string | null
  unlimited?: boolean
  isPaid: boolean
  membershipExpiresAt?: string | null
  nextMembershipTier?: 'free' | 'plus' | 'ultra' | null
  nextMembershipStartsAt?: string | null
  bonusAppleLimit?: number
  bonusExpiresAt?: string | null
}

interface CatalogMetadata {
  planId: string | null
  available: boolean
  eligibilityReason: string | null
  settlementCurrency?: 'CAD'
  settlementAmountMinor?: number
  settlementAmount?: number
  exchangeRateCadPerCny?: number | null
  exchangeRateAsOf?: string | null
}

type CatalogMembershipProduct = MembershipBillingProduct & CatalogMetadata
type CatalogApplePackProduct = ApplePackBillingProduct & CatalogMetadata
type CatalogProduct = CatalogMembershipProduct | CatalogApplePackProduct

interface BillingCatalogResponse {
  tier: 'guest' | 'free' | 'plus' | 'ultra'
  trialEligible: boolean
  trialUpgradeEligible: boolean
  paymentProvider: 'ottpay'
  paymentConfigured: boolean
  paymentEnabled: boolean
  settlementCurrency: 'CAD'
  exchangeRateCadPerCny: number | null
  exchangeRateAsOf: string | null
  products: CatalogProduct[]
}

interface MembershipPlansSurfaceProps {
  appleQuota?: MembershipAppleQuota | null
  isAuthenticated?: boolean
  isQuotaLoading?: boolean
  onClose?: () => void
  closeHref?: string
  variant?: 'dialog' | 'page'
  className?: string
}

export interface MembershipDialogProps {
  isOpen: boolean
  onClose: () => void
  appleQuota?: MembershipAppleQuota | null
}

const durations: { id: Exclude<BillingDurationId, 'trial'>; label: string; hint: string }[] = [
  { id: 'week', label: '周', hint: '7 天' },
  { id: 'month', label: '月', hint: '30 天' },
  { id: 'quarter', label: '季度', hint: '90 天' },
  { id: 'year', label: '年度', hint: '365 天' },
]

const planIcons: Record<MembershipPlanId, typeof MessageCircle> = {
  guest: Sparkles,
  free: MessageCircle,
  plus: Crown,
  ultra: InfinityIcon,
}

function formatDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatCad(amountMinor?: number | null) {
  return typeof amountMinor === 'number' ? `CAD ${(amountMinor / 100).toFixed(2)}` : 'CAD —'
}

function getRenewalReminder(value?: string | null) {
  if (!value) return null
  const expiresAt = new Date(value).getTime()
  if (!Number.isFinite(expiresAt)) return null
  const remainingMs = expiresAt - Date.now()
  if (remainingMs <= 0 || remainingMs > 3 * 24 * 60 * 60 * 1000) return null
  const remainingDays = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)))
  return `会员将在 ${remainingDays} 天内到期，可提前续期并从当前到期时间顺延。`
}

function PlanCard({
  plan,
  currentPlanId,
  product,
  isQuotaLoading,
  purchaseBlocked,
  isCreating,
  onPurchase,
}: {
  plan: MembershipPlan
  currentPlanId: MembershipPlanId | null
  product: CatalogMembershipProduct | null
  isQuotaLoading: boolean
  purchaseBlocked: boolean
  isCreating: boolean
  onPurchase: (product: CatalogProduct) => void
}) {
  const isCurrent = plan.id === currentPlanId
  const PlanIcon = planIcons[plan.id]
  const isPaidPlan = plan.id === 'plus' || plan.id === 'ultra'
  const priceLabel = product ? `¥${product.priceCny}` : plan.priceLabel
  const ctaLabel = isQuotaLoading
    ? '读取中'
    : isPaidPlan
      ? product?.available
        ? isCurrent ? `续期 ${plan.name}` : `选择 ${plan.name}`
        : '商品待开放'
      : isCurrent
        ? '当前层级'
        : plan.ctaLabel

  return (
    <section
      className={cn(
        "relative flex min-w-0 flex-col rounded-2xl border bg-card p-5 shadow-sm sm:p-6",
        plan.highlighted
          ? "border-primary/35 bg-primary/[0.055] shadow-primary/10 dark:bg-primary/[0.09]"
          : "border-border/80",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
            plan.highlighted ? "border-primary/25 bg-primary/10 text-primary" : "border-border bg-secondary/60 text-foreground",
          )}>
            <PlanIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground">{plan.eyebrow}</p>
            <h2 className="mt-0.5 text-xl font-semibold text-foreground">{plan.name}</h2>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {plan.badge && <Badge className="border-primary/20 bg-primary/10 text-primary hover:bg-primary/10">{plan.badge}</Badge>}
          {isCurrent && <Badge variant="outline" className="border-accent/50 bg-accent/15 text-foreground">当前</Badge>}
        </div>
      </div>

      <p className="mt-4 min-h-10 text-sm leading-5 text-muted-foreground">{plan.description}</p>

      <div className="mt-5 rounded-xl border border-border/70 bg-background/65 p-4">
        <div className="flex items-end gap-1.5">
          <div className="text-2xl font-semibold leading-none text-foreground">{priceLabel}</div>
          {product && <span className="text-xs text-muted-foreground">/ {product.durationDays} 天</span>}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {product ? '固定期购买 · 不自动续费' : plan.priceHint}
        </div>
        {product?.settlementAmountMinor !== undefined && (
          <div className="mt-1 text-xs font-medium text-foreground">支付宝实扣 {formatCad(product.settlementAmountMinor)}</div>
        )}
        <div className="mt-3 border-t border-border/65 pt-3 text-sm font-medium text-foreground">{plan.quotaLabel}</div>
      </div>

      <ul className="mt-5 space-y-3">
        {plan.features.map(feature => (
          <li key={feature} className="flex items-start gap-2.5 text-sm leading-5 text-foreground">
            <span className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
              plan.highlighted ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground",
            )}>
              <Check className="h-3.5 w-3.5" />
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-6">
        <Button
          type="button"
          variant={plan.highlighted ? "default" : "outline"}
          disabled={isQuotaLoading || purchaseBlocked || !isPaidPlan || !product?.available}
          onClick={() => product && onPurchase(product)}
          className="h-11 w-full rounded-xl text-sm font-medium"
        >
          {product && isCreating ? '正在创建订单…' : ctaLabel}
          {product?.available && <ExternalLink className="ml-2 h-3.5 w-3.5" />}
        </Button>
      </div>
    </section>
  )
}

function PricingTable() {
  return (
    <section className="mt-10 w-full" aria-labelledby="apple-pricing-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.14em] text-primary">苹果消耗表</p>
          <h2 id="apple-pricing-title" className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">层级越高，使用越从容</h2>
        </div>
        <p className="max-w-lg text-xs leading-5 text-muted-foreground sm:text-right">失败且未返回内容会按原扣费来源自动退回。</p>
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-sm">
        <table className="w-full min-w-[800px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border/80 bg-secondary/35">
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground sm:px-5">功能</th>
              <th className="w-24 px-3 py-3 text-center text-xs font-medium text-muted-foreground">游客</th>
              <th className="w-24 px-3 py-3 text-center text-xs font-medium text-muted-foreground">免费</th>
              <th className="w-24 bg-primary/[0.06] px-3 py-3 text-center text-xs font-semibold text-primary">Plus</th>
              <th className="w-28 px-3 py-3 text-center text-xs font-semibold text-foreground">Ultra</th>
            </tr>
          </thead>
          <tbody>
            {applePricingRows.map(row => (
              <tr key={row.label} className="border-b border-border/65 last:border-b-0">
                <th scope="row" className="px-4 py-3.5 font-normal sm:px-5">
                  <div className="text-sm font-medium text-foreground">{row.label}</div>
                  <div className="mt-0.5 text-xs leading-4 text-muted-foreground">{row.detail}</div>
                </th>
                <td className="px-3 py-3.5 text-center text-sm text-muted-foreground">{row.guest}</td>
                <td className="px-3 py-3.5 text-center text-sm font-medium text-foreground">{row.free}</td>
                <td className="bg-primary/[0.035] px-3 py-3.5 text-center text-sm font-semibold text-primary">{row.plus}</td>
                <td className="px-3 py-3.5 text-center text-sm font-semibold text-foreground">{row.ultra}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function MembershipPlansSurface({
  appleQuota,
  isAuthenticated = Boolean(appleQuota),
  isQuotaLoading = false,
  onClose,
  closeHref = "/",
  variant = 'dialog',
  className,
}: MembershipPlansSurfaceProps) {
  const [duration, setDuration] = useState<Exclude<BillingDurationId, 'trial'>>('month')
  const [catalog, setCatalog] = useState<BillingCatalogResponse | null>(null)
  const payment = useOttPayPayment({
    enabled: isAuthenticated,
    onSucceeded: () => {
      const url = new URL(window.location.href)
      url.searchParams.delete('ottpay_order')
      window.history.replaceState({}, '', url)
      toast({ title: '支付成功', description: '权益已到账，正在刷新。' })
      window.setTimeout(() => window.location.reload(), 700)
    },
    onTerminal: order => {
      toast({
        title: '支付未完成',
        description: order.status === 'closed' ? '订单已关闭，未发放权益。' : '订单校验失败，未发放权益。',
        variant: 'destructive',
      })
    },
  })

  useEffect(() => {
    let cancelled = false
    fetch('/api/billing/catalog').then(res => res.ok ? res.json() : null).then(catalogData => {
      if (cancelled) return
      setCatalog(catalogData)
    }).catch(error => console.warn('[Membership] billing context failed:', error))
    return () => { cancelled = true }
  }, [isAuthenticated])

  const currentPlanId: MembershipPlanId | null = isQuotaLoading
    ? null
    : appleQuota?.tier || (appleQuota?.isPaid ? 'plus' : isAuthenticated ? 'free' : 'guest')
  const membershipEnds = formatDate(appleQuota?.membershipExpiresAt)
  const renewalReminder = getRenewalReminder(appleQuota?.membershipExpiresAt)
  const nextStarts = formatDate(appleQuota?.nextMembershipStartsAt)
  const walletExpiry = formatDate(appleQuota?.walletExpiresAt)

  const productsByTier = useMemo(() => {
    const products = catalog?.products || []
    const membershipProducts = products.filter((product): product is CatalogMembershipProduct => product.kind === 'membership')
    const applePacks = products.filter((product): product is CatalogApplePackProduct => product.kind === 'apple_pack')
    const trialUpgrade = membershipProducts.find(product => product.trialUpgrade) || null
    return {
      plus: duration === 'month' && trialUpgrade?.available
        ? trialUpgrade
        : membershipProducts.find(product => product.tier === 'plus' && product.duration === duration && !product.trialUpgrade) || null,
      ultra: membershipProducts.find(product => product.tier === 'ultra' && product.duration === duration) || null,
      trial: membershipProducts.find(product => product.trial) || null,
      trialUpgrade,
      applePacks,
    }
  }, [catalog, duration])

  const openPurchase = async (product: CatalogProduct) => {
    if (!isAuthenticated) {
      toast({ title: '请先登录', description: '登录后才能购买会员或充值苹果。' })
      return
    }
    if (!product.available || !catalog?.paymentEnabled) {
      toast({ title: '支付暂未开放', description: 'CAD 结算配置校验完成后即可购买。' })
      return
    }
    try {
      const opened = await payment.startPayment(product.sku, '/api/billing/ottpay/checkout', { sku: product.sku })
      if (opened) toast({ title: '支付宝已打开', description: opened.reused ? '已重新打开原订单，完成支付后本页会自动确认。' : '完成支付后，本页会自动确认并刷新权益。' })
    } catch (error) {
      toast({
        title: '暂时无法支付',
        description: error instanceof Error ? error.message : '请稍后重试。',
        variant: 'destructive',
      })
    }
  }

  const cancelCurrentOrder = async () => {
    try {
      const result = await payment.cancelOrder()
      if (result?.status === 'succeeded') {
        toast({ title: '订单已支付', description: '已确认到账，不能取消。' })
        return
      }
      toast({ title: '订单已取消', description: '现在可以选择其他会员或充值商品。' })
    } catch (error) {
      toast({
        title: '暂时无法取消',
        description: error instanceof Error ? error.message : '请稍后重试。',
        variant: 'destructive',
      })
    }
  }

  const hasActiveOrder = Boolean(payment.order && !['succeeded', 'failed', 'closed'].includes(payment.order.status))
  const purchaseBlocked = payment.phase === 'creating' || hasActiveOrder

  const quotaText = isQuotaLoading
    ? '正在读取当前层级'
    : appleQuota?.unlimited
      ? '当前 Ultra：全功能不扣苹果'
      : appleQuota
        ? `今日 ${appleQuota.dailyRemaining ?? appleQuota.remaining}/${appleQuota.dailyLimit} 🍎 · 充值余额 ${appleQuota.walletBalance || 0} 🍎`
        : '注册后每日领取 5 个苹果'

  return (
    <div className={cn("relative min-h-dvh overflow-x-hidden overflow-y-auto bg-background text-foreground", className)}>
      {variant === 'page' && (
        <Link href={closeHref} className="fixed left-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-10 inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card/90 px-2.5 text-sm text-muted-foreground shadow-sm backdrop-blur-xl hover:text-foreground sm:left-6 sm:top-6 sm:h-10 sm:px-3">
          <ArrowLeft className="h-4 w-4" />返回
        </Link>
      )}
      {onClose && (
        <button type="button" onClick={onClose} className="fixed right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/90 text-muted-foreground shadow-sm backdrop-blur-xl hover:text-foreground sm:right-6 sm:top-6 sm:h-10 sm:w-10" aria-label="关闭会员套餐">
          <X className="h-4 w-4" />
        </button>
      )}

      <main className="mx-auto w-full max-w-7xl px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-[calc(env(safe-area-inset-top)+4.75rem)] sm:px-6 sm:pb-16 sm:pt-20 lg:px-8">
        <header className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium tracking-[0.16em] text-primary">会员与苹果</p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight text-foreground sm:text-4xl">按你的使用节奏选择</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">基础聊天保持免费，深度推理与专题分析按层级计费。{quotaText}。</p>
          {catalog?.exchangeRateCadPerCny && catalog.exchangeRateAsOf && (
            <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-muted-foreground">
              支付以 CAD 结算 · 1 CNY = {catalog.exchangeRateCadPerCny} CAD（加拿大央行 {catalog.exchangeRateAsOf} 日均牌价）
            </p>
          )}
          {(membershipEnds || nextStarts) && (
            <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-xl border border-border bg-card px-4 py-2 text-xs text-muted-foreground">
              {membershipEnds && <span>当前权益至 {membershipEnds}</span>}
              {appleQuota?.nextMembershipTier && nextStarts && <span>随后切换为 {appleQuota.nextMembershipTier === 'plus' ? 'Plus' : 'Ultra'} · {nextStarts}</span>}
            </div>
          )}
          {renewalReminder && (
            <p className="mx-auto mt-2 max-w-xl rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-200">
              {renewalReminder}
            </p>
          )}
        </header>

        {hasActiveOrder && payment.order && (
          <section className="mx-auto mt-6 flex max-w-3xl flex-col gap-4 rounded-2xl border border-primary/25 bg-primary/[0.055] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" aria-live="polite">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{payment.paymentWindowOpen ? '支付宝窗口已打开' : '你有一笔待支付订单'}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {payment.order.product?.name || payment.order.prepayOrderId}
                {payment.order.product?.settlementAmountMinor !== undefined ? ` · 实扣 ${formatCad(payment.order.product.settlementAmountMinor)}` : ''}
                {payment.order.expiresAt ? ` · ${formatDate(payment.order.expiresAt)} 前有效` : ''}
                {!payment.paymentWindowOpen ? '。关闭窗口不会新建订单，可继续支付。' : '。本页正在等待支付结果。'}
              </p>
              {payment.error && <p className="mt-1 text-xs text-destructive">{payment.error}</p>}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {!payment.paymentWindowOpen && <Button type="button" onClick={payment.continuePayment}>继续支付</Button>}
              <Button type="button" variant="outline" disabled={payment.phase === 'confirming'} onClick={() => payment.checkOrder(true).catch(() => undefined)}>
                <RefreshCw className={cn("mr-2 h-4 w-4", payment.phase === 'confirming' && "animate-spin")} />查询状态
              </Button>
              <OttPayCancelOrderButton
                cancelling={payment.phase === 'cancelling'}
                disabled={payment.phase === 'confirming'}
                onCancel={cancelCurrentOrder}
              />
            </div>
          </section>
        )}

        {productsByTier.trial?.available && (
          <section className="mx-auto mt-7 flex max-w-3xl flex-col gap-3 rounded-2xl border border-primary/25 bg-primary/[0.055] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold text-foreground">新用户 Plus 体验</h2></div>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">¥3 使用 3 天，每个站内账号和支付账号仅一次；随后 7 天内升级月卡可抵扣 ¥3。</p>
            </div>
            <Button disabled={purchaseBlocked} className="shrink-0 rounded-xl" onClick={() => openPurchase(productsByTier.trial!)}>{payment.creatingSku === productsByTier.trial.sku ? '正在创建订单…' : '¥3 体验 3 天'}</Button>
          </section>
        )}

        <div className="mx-auto mt-8 flex max-w-xl rounded-xl border border-border bg-card p-1">
          {durations.map(item => (
            <button key={item.id} type="button" onClick={() => setDuration(item.id)} className={cn(
              "flex flex-1 flex-col items-center rounded-lg px-2 py-2 text-xs transition-colors",
              duration === item.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}>
              <span className="font-medium">{item.label}</span><span className="mt-0.5 text-[10px] opacity-75">{item.hint}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 lg:gap-5">
          {membershipPlans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              currentPlanId={currentPlanId}
              product={plan.id === 'plus' ? productsByTier.plus : plan.id === 'ultra' ? productsByTier.ultra : null}
              isQuotaLoading={isQuotaLoading}
              purchaseBlocked={purchaseBlocked}
              isCreating={payment.creatingSku === (plan.id === 'plus' ? productsByTier.plus?.sku : plan.id === 'ultra' ? productsByTier.ultra?.sku : null)}
              onPurchase={openPurchase}
            />
          ))}
        </div>

        {productsByTier.trialUpgrade?.available && duration === 'month' && (
          <p className="mt-3 text-center text-xs text-primary">你的 ¥3 体验抵扣仍有效：Plus 月卡当前实付 ¥16。</p>
        )}

        <section className="mt-10" aria-labelledby="apple-packs-title">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-medium tracking-[0.14em] text-primary">临时补量</p><h2 id="apple-packs-title" className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">一次性苹果充值</h2></div>
            <p className="max-w-lg text-xs leading-5 text-muted-foreground sm:text-right">先用每日额度，再用最早到期的充值苹果；每批自到账起 90 天有效。</p>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {productsByTier.applePacks.map(product => (
              <article key={product.sku} className={cn("rounded-2xl border bg-card p-5", product.highlighted ? "border-primary/35 bg-primary/[0.045]" : "border-border/80")}>
                <div className="flex items-center justify-between"><WalletCards className="h-5 w-5 text-primary" />{product.highlighted && <Badge variant="outline">常用</Badge>}</div>
                <div className="mt-4 text-2xl font-semibold text-foreground">{product.appleAmount} 🍎</div>
                <div className="mt-1 text-sm text-muted-foreground">¥{product.priceCny} · {product.appleExpiryDays} 天有效</div>
                {product.settlementAmountMinor !== undefined && <div className="mt-1 text-xs font-medium text-foreground">支付宝实扣 {formatCad(product.settlementAmountMinor)}</div>}
                <Button variant="outline" disabled={!product.available || purchaseBlocked} onClick={() => openPurchase(product)} className="mt-5 w-full rounded-xl">{payment.creatingSku === product.sku ? '正在创建订单…' : product.available ? '立即充值' : currentPlanId === 'ultra' ? 'Ultra 期间无需充值' : '支付待开放'}</Button>
              </article>
            ))}
          </div>
          {(appleQuota?.walletBalance || 0) > 0 && <p className="mt-3 text-xs text-muted-foreground">当前充值余额 {appleQuota?.walletBalance} 🍎{walletExpiry ? `，最近一批将于 ${walletExpiry} 到期` : ''}。</p>}
        </section>

        <PricingTable />
        <p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-5 text-muted-foreground">每日苹果按北京时间 00:00 刷新且不结转。Ultra 不设苹果额度，但单账号同时仅运行一个生成任务，并受每小时 60 次、滚动 24 小时 300 次的合理使用保护。</p>
      </main>
    </div>
  )
}

export function MembershipDialog({ isOpen, onClose, appleQuota }: MembershipDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent showCloseButton={false} className="inset-0 left-0 top-0 h-dvh max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-background p-0 sm:max-w-none">
        <DialogTitle className="sr-only">会员与苹果方案</DialogTitle>
        <MembershipPlansSurface appleQuota={appleQuota} isAuthenticated={Boolean(appleQuota)} onClose={onClose} variant="dialog" />
      </DialogContent>
    </Dialog>
  )
}
