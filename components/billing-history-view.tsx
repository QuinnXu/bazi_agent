"use client"

import { useMemo, useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Apple,
  ArrowLeft,
  CircleAlert,
  Crown,
  LoaderCircle,
  PackageOpen,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingBag,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type {
  AppleHistoryItem,
  BillingHistoryData,
  PaymentHistoryItem,
  PaymentHistoryStatus,
} from '@/lib/billing-history'

interface BillingHistoryViewProps {
  data: BillingHistoryData
  hasLoadError?: boolean
}

const paymentStatusLabels: Record<PaymentHistoryStatus, string> = {
  creating: '创建中',
  pending: '待支付',
  processing: '支付确认中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
  closed: '已关闭',
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function paymentBadgeClass(status: PaymentHistoryStatus): string {
  if (status === 'succeeded') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (status === 'processing') return 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  if (status === 'pending' || status === 'creating') return 'border-primary/20 bg-primary/10 text-primary'
  if (status === 'failed') return 'border-destructive/25 bg-destructive/10 text-destructive'
  return 'border-border bg-muted/55 text-muted-foreground'
}

function PaymentRow({ item }: { item: PaymentHistoryItem }) {
  const ProductIcon = item.productKind === 'membership' ? Crown : item.productKind === 'apple_pack' ? Apple : ShoppingBag

  return (
    <article className="rounded-2xl border border-border/80 bg-card/80 p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3 sm:gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:h-11 sm:w-11">
          <ProductIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-medium text-foreground sm:text-base">{item.productName}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</p>
            </div>
            <div className="flex items-center gap-2 sm:flex-col sm:items-end">
              <span className="text-base font-medium tabular-nums text-foreground">
                {item.currency} {(item.amountCents / 100).toFixed(2)}
              </span>
              <Badge variant="outline" className={paymentBadgeClass(item.status)}>
                {paymentStatusLabels[item.status]}
              </Badge>
            </div>
          </div>
          <div className="mt-3 space-y-1 border-t border-border/70 pt-3 text-xs leading-5 text-muted-foreground">
            <p className="break-all">订单号 · {item.id}</p>
            {item.providerReference && <p className="break-all">支付参考号 · {item.providerReference}</p>}
            {item.completedAt && <p>完成时间 · {formatDateTime(item.completedAt)}</p>}
          </div>
        </div>
      </div>
    </article>
  )
}

function AppleRow({ item }: { item: AppleHistoryItem }) {
  const isCredit = item.kind === 'credit'
  const isRefunded = item.status === 'refunded'
  const statusLabel = item.status === 'credited'
    ? '已入账'
    : item.status === 'settled'
      ? '已完成'
      : item.status === 'refunded'
        ? '已退款'
        : '处理中'

  return (
    <article className="rounded-2xl border border-border/80 bg-card/80 p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3 sm:gap-4">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 ${
          isCredit ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-primary/10 text-primary'
        }`}>
          <Apple className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-medium text-foreground sm:text-base">{item.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className={`text-base font-medium tabular-nums ${isCredit ? 'text-emerald-600 dark:text-emerald-300' : 'text-foreground'} ${isRefunded ? 'line-through opacity-60' : ''}`}>
                {isCredit ? '+' : '−'}{item.amount} 🍎
              </p>
              <Badge
                variant="outline"
                className={`mt-1.5 ${
                  isCredit
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : item.status === 'processing'
                      ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'border-border bg-muted/55 text-muted-foreground'
                }`}
              >
                {statusLabel}
              </Badge>
            </div>
          </div>
          <div className="mt-3 border-t border-border/70 pt-3 text-xs leading-5 text-muted-foreground">
            <p>{item.detail}</p>
            {item.expiresAt && <p>有效期至 · {formatDateTime(item.expiresAt)}</p>}
          </div>
        </div>
      </div>
    </article>
  )
}

function EmptyState({ type }: { type: 'payments' | 'apples' }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/35 px-6 py-12 text-center">
      <PackageOpen className="h-9 w-9 text-muted-foreground/60" aria-hidden="true" />
      <p className="mt-4 text-sm font-medium text-foreground">没有找到相关记录</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
        {type === 'payments' ? '完成充值或购买后，订单会显示在这里。' : '苹果入账或用于功能消费后，明细会显示在这里。'}
      </p>
    </div>
  )
}

export function BillingHistoryView({ data, hasLoadError = false }: BillingHistoryViewProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [isRefreshing, startRefresh] = useTransition()
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')

  const payments = useMemo(() => {
    if (!normalizedQuery) return data.payments
    return data.payments.filter(item => [
      item.productName,
      item.sku,
      item.id,
      item.providerReference || '',
      paymentStatusLabels[item.status],
    ].some(value => value.toLocaleLowerCase('zh-CN').includes(normalizedQuery)))
  }, [data.payments, normalizedQuery])

  const apples = useMemo(() => {
    if (!normalizedQuery) return data.apples
    return data.apples.filter(item => [item.title, item.detail].some(value => (
      value.toLocaleLowerCase('zh-CN').includes(normalizedQuery)
    )))
  }, [data.apples, normalizedQuery])

  const completedPayments = data.payments.filter(item => item.status === 'succeeded').length

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10 md:gap-8 md:py-14">
        <nav className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost" className="min-h-10 px-2 text-muted-foreground hover:text-foreground">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              返回首页
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-10"
            disabled={isRefreshing}
            onClick={() => startRefresh(() => router.refresh())}
          >
            {isRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            刷新
          </Button>
        </nav>

        <header className="flex items-center gap-4">
          <span className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-sm sm:h-14 sm:w-14">
            <Image src="/avatar-small.png" alt="卜卜象" width={56} height={56} className="h-full w-full object-contain" />
          </span>
          <div>
            <p className="text-sm text-muted-foreground">账户中心</p>
            <h1 className="text-2xl font-light tracking-normal text-foreground sm:text-4xl">充值与消费记录</h1>
          </div>
        </header>

        {hasLoadError && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            部分记录暂时加载失败，请稍后刷新重试。
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-primary/15 bg-primary/[0.06] p-4 sm:p-5">
            <p className="text-xs text-muted-foreground">充值苹果余额</p>
            <p className="mt-2 text-2xl font-light tabular-nums text-foreground sm:text-3xl">{data.walletBalance} 🍎</p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {data.walletExpiresAt ? `最近到期 ${formatDateTime(data.walletExpiresAt)}` : '暂无有效充值余额'}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card/70 p-4 sm:p-5">
            <p className="text-xs text-muted-foreground">已完成支付</p>
            <p className="mt-2 text-2xl font-light tabular-nums text-foreground sm:text-3xl">{completedPayments} 笔</p>
            <p className="mt-1 text-[11px] text-muted-foreground">订单与权益到账可在下方核对</p>
          </div>
        </div>

        <div className="relative">
          <label htmlFor="billing-history-search" className="sr-only">搜索充值与消费记录</label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="billing-history-search"
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="搜索商品、订单号或明细"
            className="h-11 rounded-xl pl-10"
          />
        </div>

        <Tabs defaultValue="payments" className="gap-5">
          <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl">
            <TabsTrigger value="payments" className="rounded-lg">支付订单 <span className="text-xs opacity-65">{data.payments.length}</span></TabsTrigger>
            <TabsTrigger value="apples" className="rounded-lg">苹果明细 <span className="text-xs opacity-65">{data.apples.length}</span></TabsTrigger>
          </TabsList>
          <TabsContent value="payments" className="space-y-3">
            {payments.length > 0 ? payments.map(item => <PaymentRow key={item.id} item={item} />) : <EmptyState type="payments" />}
          </TabsContent>
          <TabsContent value="apples" className="space-y-3">
            {apples.length > 0 ? apples.map(item => <AppleRow key={`${item.kind}:${item.id}`} item={item} />) : <EmptyState type="apples" />}
          </TabsContent>
        </Tabs>

        <footer className="flex items-start gap-2 rounded-xl bg-muted/45 px-4 py-3 text-xs leading-5 text-muted-foreground">
          <ReceiptText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          最多展示最近 100 条支付订单和 100 条苹果明细。支付成功后如果状态未更新，请先点“刷新”；仍未到账可凭订单号联系客服核查。
        </footer>
      </section>
    </main>
  )
}
