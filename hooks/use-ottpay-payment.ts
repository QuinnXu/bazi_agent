'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type OttPayClientPhase = 'idle' | 'creating' | 'awaiting_payment' | 'confirming' | 'cancelling'

export interface OttPayClientOrder {
  prepayOrderId: string
  status: string
  payUrl?: string | null
  expiresAt?: string | null
  reused?: boolean
  product?: {
    sku: string
    kind: 'membership' | 'apple_pack'
    name: string
    priceCny: number
    settlementCurrency: 'CAD'
    settlementAmountMinor: number
    settlementAmount: number
    exchangeRateCadPerCny: number | null
    exchangeRateAsOf: string | null
  } | null
}

interface UseOttPayPaymentOptions {
  enabled: boolean
  onSucceeded?: (order: OttPayClientOrder) => void
  onTerminal?: (order: OttPayClientOrder) => void
}

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'closed'])

export function useOttPayPayment({ enabled, onSucceeded, onTerminal }: UseOttPayPaymentOptions) {
  const [order, setOrder] = useState<OttPayClientOrder | null>(null)
  const [phase, setPhase] = useState<OttPayClientPhase>('idle')
  const [creatingSku, setCreatingSku] = useState<string | null>(null)
  const [paymentWindowOpen, setPaymentWindowOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const paymentWindowRef = useRef<Window | null>(null)
  const successHandledRef = useRef<string | null>(null)
  const onSucceededRef = useRef(onSucceeded)
  const onTerminalRef = useRef(onTerminal)
  const cancellingRef = useRef(false)

  useEffect(() => { onSucceededRef.current = onSucceeded }, [onSucceeded])
  useEffect(() => { onTerminalRef.current = onTerminal }, [onTerminal])

  const applyOrder = useCallback((next: OttPayClientOrder) => {
    setOrder(next)
    setError(null)
    if (next.status === 'succeeded') {
      setPhase('idle')
      setPaymentWindowOpen(false)
      if (successHandledRef.current !== next.prepayOrderId) {
        successHandledRef.current = next.prepayOrderId
        onSucceededRef.current?.(next)
      }
    } else if (next.status === 'failed' || next.status === 'closed') {
      setPhase('idle')
      setPaymentWindowOpen(false)
      onTerminalRef.current?.(next)
    } else {
      setPhase('awaiting_payment')
    }
    return next
  }, [])

  const checkOrder = useCallback(async (manual = false) => {
    if (!order?.prepayOrderId || TERMINAL_STATUSES.has(order.status)) return order
    if (cancellingRef.current) return order
    if (manual) setPhase('confirming')
    try {
      const response = await fetch(`/api/billing/ottpay/orders/${encodeURIComponent(order.prepayOrderId)}`, {
        cache: 'no-store',
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '查询支付状态失败')
      return applyOrder({ ...order, ...result, prepayOrderId: order.prepayOrderId })
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : '查询支付状态失败')
      if (manual) setPhase('awaiting_payment')
      throw checkError
    }
  }, [applyOrder, order])

  const cancelOrder = useCallback(async () => {
    if (!order?.prepayOrderId || TERMINAL_STATUSES.has(order.status)) return order
    cancellingRef.current = true
    setPhase('cancelling')
    setError(null)
    try {
      if (paymentWindowRef.current && !paymentWindowRef.current.closed) {
        paymentWindowRef.current.close()
      }
      paymentWindowRef.current = null
      setPaymentWindowOpen(false)

      const response = await fetch(
        `/api/billing/ottpay/orders/${encodeURIComponent(order.prepayOrderId)}/cancel`,
        { method: 'POST' },
      )
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '取消订单失败')
      const next = { ...order, ...result, prepayOrderId: order.prepayOrderId } as OttPayClientOrder & { cancelled?: boolean }
      if (next.cancelled) {
        setOrder(null)
        setPhase('idle')
        return next
      }
      return applyOrder(next)
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : '取消订单失败')
      setPhase('awaiting_payment')
      throw cancelError
    } finally {
      cancellingRef.current = false
    }
  }, [applyOrder, order])

  const attachPaymentWindow = useCallback((paymentWindow: Window) => {
    paymentWindow.opener = null
    paymentWindowRef.current = paymentWindow
    setPaymentWindowOpen(true)
    setPhase('awaiting_payment')
  }, [])

  const continuePayment = useCallback(() => {
    if (!order?.payUrl) {
      setError('当前订单没有可用的支付链接，请查询订单状态。')
      return false
    }
    const paymentWindow = window.open(order.payUrl, '_blank')
    if (!paymentWindow) {
      setError('浏览器拦截了支付窗口，请允许本站弹出窗口后重试。')
      return false
    }
    attachPaymentWindow(paymentWindow)
    return true
  }, [attachPaymentWindow, order])

  const startPayment = useCallback(async (
    sku: string,
    endpoint: string,
    body: Record<string, unknown>,
  ) => {
    const paymentWindow = window.open('about:blank', '_blank')
    if (!paymentWindow) {
      setError('浏览器拦截了支付窗口，请允许本站弹出窗口后重试。')
      return null
    }
    paymentWindow.opener = null
    setPhase('creating')
    setCreatingSku(sku)
    setError(null)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.payUrl) {
        if (result.activeOrder) applyOrder(result.activeOrder)
        throw new Error(result.error || '创建支付订单失败')
      }
      const next = applyOrder(result as OttPayClientOrder)
      paymentWindow.location.replace(result.payUrl)
      attachPaymentWindow(paymentWindow)
      return next
    } catch (startError) {
      paymentWindow.close()
      setError(startError instanceof Error ? startError.message : '创建支付订单失败')
      setPhase(current => current === 'awaiting_payment' ? current : 'idle')
      throw startError
    } finally {
      setCreatingSku(null)
    }
  }, [applyOrder, attachPaymentWindow])

  useEffect(() => {
    if (!enabled) {
      setOrder(null)
      setPhase('idle')
      return
    }
    let cancelled = false
    fetch('/api/billing/ottpay/orders/active', { cache: 'no-store' })
      .then(async response => {
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || '读取未完成订单失败')
        if (!cancelled && result.order) applyOrder(result.order)
      })
      .catch(loadError => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : '读取未完成订单失败')
      })
    return () => { cancelled = true }
  }, [applyOrder, enabled])

  useEffect(() => {
    if (!paymentWindowOpen) return
    const timer = window.setInterval(() => {
      if (paymentWindowRef.current?.closed) {
        paymentWindowRef.current = null
        setPaymentWindowOpen(false)
        setPhase(current => current === 'creating' ? current : 'awaiting_payment')
      }
    }, 750)
    return () => window.clearInterval(timer)
  }, [paymentWindowOpen])

  useEffect(() => {
    if (!order?.prepayOrderId || TERMINAL_STATUSES.has(order.status)) return
    let cancelled = false
    let timer: number | undefined
    const poll = async () => {
      try {
        await checkOrder(false)
      } catch {
        // Keep the session recoverable; the next foreground or scheduled check retries.
      }
      if (!cancelled) timer = window.setTimeout(poll, paymentWindowOpen ? 5000 : 15000)
    }
    timer = window.setTimeout(poll, paymentWindowOpen ? 2000 : 5000)
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [checkOrder, order?.prepayOrderId, order?.status, paymentWindowOpen])

  useEffect(() => {
    if (!order?.prepayOrderId || TERMINAL_STATUSES.has(order.status)) return
    const refresh = () => {
      if (document.visibilityState === 'visible') checkOrder(false).catch(() => undefined)
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [checkOrder, order?.prepayOrderId, order?.status])

  return {
    order,
    phase,
    creatingSku,
    paymentWindowOpen,
    error,
    startPayment,
    continuePayment,
    checkOrder,
    cancelOrder,
    clearError: () => setError(null),
  }
}
