'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Apple, ArrowLeft, CheckCircle2, Crown, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { OttPayCancelOrderButton } from '@/components/ottpay-cancel-order-button'
import { useOttPayPayment } from '@/hooks/use-ottpay-payment'

type TestKind = 'membership' | 'apple_pack'

interface TestProduct {
  sku: string
  kind: TestKind
  name: string
  priceCny: number
  settlementCurrency: 'CAD'
  settlementAmountMinor: number
  settlementAmount: number
  available: boolean
  benefit: string
}

interface TestQuota {
  tier: 'free' | 'plus' | 'ultra'
  membershipExpiresAt: string | null
  walletBalance: number
  walletExpiresAt: string | null
}

interface TestConfig {
  configured: boolean
  enabled: boolean
  missing: string[]
  currency: string | null
  amountMinor: number
  paymentMethod: 'ALIPAY'
  products: TestProduct[]
  quota: TestQuota
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function OttPayTestPanel() {
  const [config, setConfig] = useState<TestConfig | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const loadConfig = useCallback(async () => {
    const response = await fetch('/api/billing/ottpay/test', { cache: 'no-store' })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || '无法读取测试配置')
    setConfig(result)
  }, [])

  const payment = useOttPayPayment({
    enabled: true,
    onSucceeded: order => {
      const benefit = config?.products.find(product => product.sku === order.product?.sku)?.benefit
      setMessage(`支付成功，${benefit || '测试权益'}已到账。`)
      loadConfig().catch(() => undefined)
      const url = new URL(window.location.href)
      url.searchParams.delete('ottpay_order')
      window.history.replaceState({}, '', url)
    },
    onTerminal: () => setMessage('订单已失败或关闭，没有发放权益。'),
  })

  useEffect(() => {
    loadConfig().catch(error => setMessage(error instanceof Error ? error.message : '无法读取测试配置'))
  }, [loadConfig])

  const createOrder = async (kind: TestKind) => {
    setMessage('正在创建支付宝订单…')
    try {
      const product = config?.products.find(item => item.kind === kind)
      if (!product) throw new Error('测试商品不存在')
      const result = await payment.startPayment(product.sku, '/api/billing/ottpay/test', { kind })
      if (result) setMessage(result.reused ? '已重新打开原订单，本页会自动确认到账。' : '支付宝已在新窗口打开，本页会自动确认到账。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '创建测试订单失败')
    }
  }

  const cancelCurrentOrder = async () => {
    try {
      const result = await payment.cancelOrder()
      if (result?.status === 'succeeded') {
        setMessage('订单已支付并到账，不能取消。')
        return
      }
      setMessage('订单已取消，现在可以选择另一条测试链路。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '取消订单失败')
    }
  }

  const ready = Boolean(config?.configured && config?.enabled)
  const quota = config?.quota
  const order = payment.order
  const hasActiveOrder = Boolean(order && !['succeeded', 'failed', 'closed'].includes(order.status))

  return (
    <main className="min-h-dvh bg-background px-4 py-8 text-foreground sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Button variant="ghost" asChild className="mb-5 -ml-3">
          <Link href="/membership"><ArrowLeft className="mr-2 h-4 w-4" />返回会员页</Link>
        </Button>

        <Card className="overflow-hidden border-border/80 shadow-sm">
          <CardHeader className="border-b border-border/70 bg-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-2xl">CAD 0.01 支付与权益测试</CardTitle>
                <CardDescription className="mt-2 leading-6">仅支付宝，支付页在新窗口打开；成功后会真实写入会员或苹果余额。</CardDescription>
              </div>
              <Badge variant={ready ? 'default' : 'secondary'}>{ready ? '可以测试' : '等待配置'}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 p-5 sm:p-6">
            <div className="flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] p-4 text-sm leading-6 text-amber-900 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <p>OTT Pay 没有支付宝沙箱。以下均为真实 CAD 0.01 交易，仅白名单内的两个测试账号可创建；重复测试会重复发放测试权益。</p>
            </div>

            {config && !ready && (
              <div className="rounded-xl border border-border bg-secondary/30 p-4 text-sm">
                <p className="font-medium">测试入口尚未启用</p>
                {config.missing.length > 0 && <p className="mt-2 text-muted-foreground">缺少：{config.missing.join('、')}</p>}
                {!config.enabled && <p className="mt-1 text-muted-foreground">真实交易开关尚未开启。</p>}
              </div>
            )}

            {quota && (
              <div className="grid gap-3 rounded-xl border border-border bg-secondary/25 p-4 text-sm sm:grid-cols-3">
                <div><p className="text-xs text-muted-foreground">当前层级</p><p className="mt-1 font-medium uppercase">{quota.tier}</p></div>
                <div><p className="text-xs text-muted-foreground">会员到期</p><p className="mt-1 font-medium">{formatDate(quota.membershipExpiresAt)}</p></div>
                <div><p className="text-xs text-muted-foreground">充值苹果</p><p className="mt-1 font-medium">{quota.walletBalance} 个</p></div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {(config?.products || []).map(product => {
                const Icon = product.kind === 'membership' ? Crown : Apple
                const pending = payment.creatingSku === product.sku
                return (
                  <section key={product.sku} className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-center justify-between"><Icon className="h-5 w-5 text-primary" /><Badge variant="outline">支付宝 CAD 0.01</Badge></div>
                    <h2 className="mt-4 font-semibold">{product.kind === 'membership' ? '会员开通链路' : '消费充值链路'}</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">支付成功后：{product.benefit}</p>
                    {!product.available && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Ultra 有效期内不能充值苹果，请切换 Plus 测试账号。</p>}
                    <Button className="mt-5 w-full" disabled={!ready || !product.available || payment.phase === 'creating' || hasActiveOrder} onClick={() => createOrder(product.kind)}>
                      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                      {pending ? '正在创建订单…' : '新窗口打开支付宝'}
                    </Button>
                  </section>
                )
              })}
            </div>

            {order && (
              <div className="rounded-2xl border border-border bg-secondary/25 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">预支付订单号 · {order.status}</p>
                    <p className="mt-1 break-all font-mono text-sm">{order.prepayOrderId}</p>
                    <p className="mt-1 text-xs text-muted-foreground">支付宝实扣 CAD 0.01</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" disabled={payment.phase === 'confirming' || payment.phase === 'cancelling'} onClick={() => payment.checkOrder(true).then(result => result && setMessage(`当前状态：${result.status}`)).catch(error => setMessage(error instanceof Error ? error.message : '查单失败'))}>
                      {payment.phase === 'confirming' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      查询并入账
                    </Button>
                    {hasActiveOrder && (
                      <OttPayCancelOrderButton
                        cancelling={payment.phase === 'cancelling'}
                        disabled={payment.phase === 'confirming'}
                        onCancel={cancelCurrentOrder}
                      />
                    )}
                  </div>
                </div>
                {hasActiveOrder && !payment.paymentWindowOpen && order.payUrl && (
                  <Button className="mt-4" onClick={payment.continuePayment}><ExternalLink className="mr-2 h-4 w-4" />继续支付原订单</Button>
                )}
                {(message || payment.error) && <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">{order.status === 'succeeded' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}{payment.error || message}</p>}
              </div>
            )}

            {!order && (message || payment.error) && <p className="text-sm text-destructive">{payment.error || message}</p>}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
