"use client"

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import QRCode from 'qrcode'
import {
  Check,
  Copy,
  Download,
  Gift,
  ImageIcon,
  Link as LinkIcon,
  Loader2,
  MousePointerClick,
  RefreshCw,
  Share2,
  Sparkles,
  Ticket,
  UserCheck,
  X,
} from 'lucide-react'
import { BUBU_COPY } from '@/lib/bubu-content'

interface RewardsDialogProps {
  isOpen: boolean
  onClose: () => void
  onRedeemed?: () => void
}

interface ReferralInfo {
  referralCode: string
  inviteLink: string
  reward: {
    inviteeApples: number
    referrerApples: number
    expiryDays: number
    attributionDays: number
  }
  stats: {
    clicks: number
    trialStarted: number
    trialCompleted: number
    registered: number
    activated: number
    pending: number
    rewarded: number
  }
  referrals: Array<{
    id: string
    status: 'pending' | 'rewarded' | 'rejected'
    createdAt: string
    newUserRewardedAt: string | null
    activatedAt: string | null
    referrerRewardedAt: string | null
  }>
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('卡片生成失败')), 'image/png')
  })
}

async function createInviteCard(info: ReferralInfo, qrDataUrl: string): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 900
  canvas.height = 1200
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持生成分享卡片')

  const background = ctx.createLinearGradient(0, 0, 900, 1200)
  background.addColorStop(0, '#fff8f4')
  background.addColorStop(1, '#f8edf0')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, 900, 1200)

  ctx.fillStyle = 'rgba(255,255,255,0.88)'
  ctx.beginPath()
  ctx.roundRect(72, 64, 756, 1072, 42)
  ctx.fill()

  const [avatar, qr] = await Promise.all([
    loadImage('/avatar-small.png'),
    loadImage(qrDataUrl),
  ])

  ctx.save()
  ctx.beginPath()
  ctx.arc(450, 210, 92, 0, Math.PI * 2)
  ctx.clip()
  ctx.drawImage(avatar, 358, 118, 184, 184)
  ctx.restore()

  ctx.textAlign = 'center'
  ctx.fillStyle = '#332a2d'
  ctx.font = '600 52px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
  ctx.fillText('来和卜卜象聊聊', 450, 372)

  ctx.fillStyle = '#7d6c72'
  ctx.font = '32px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
  ctx.fillText('先免费完成一次专属命理体验', 450, 430)

  ctx.fillStyle = '#d96891'
  ctx.font = '600 38px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
  ctx.fillText(`注册后你和好友各得 ${info.reward.inviteeApples} 个苹果`, 450, 510)

  ctx.fillStyle = '#8d7b81'
  ctx.font = '28px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
  ctx.fillText(`${info.reward.expiryDays} 天有效 · 首次有效邀请锁定 ${info.reward.attributionDays} 天`, 450, 558)

  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(286, 612, 328, 328, 24)
  ctx.fill()
  ctx.drawImage(qr, 306, 632, 288, 288)

  ctx.fillStyle = '#7d6c72'
  ctx.font = '25px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillText(`邀请码 ${info.referralCode}`, 450, 1004)

  ctx.fillStyle = '#9b8c91'
  ctx.font = '24px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
  ctx.fillText('扫码开始体验 · 卜卜象陪你卜卜象', 450, 1062)

  return canvasToBlob(canvas)
}

export function RewardsDialog({ isOpen, onClose, onRedeemed }: RewardsDialogProps) {
  const [activeTab, setActiveTab] = useState<'invite' | 'redeem'>('invite')
  const [info, setInfo] = useState<ReferralInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [copySuccess, setCopySuccess] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [cardBusy, setCardBusy] = useState(false)
  const [code, setCode] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const shareText = useMemo(() => {
    if (!info) return ''
    return `来和卜卜象聊聊吧～先免费完成一次专属体验，注册后你和我各得 ${info.reward.inviteeApples} 个苹果（${info.reward.expiryDays} 天有效）：${info.inviteLink}`
  }, [info])

  const fetchReferralInfo = useCallback(async () => {
    if (!isOpen) return
    setLoadingInfo(true)
    setError(null)
    try {
      const res = await fetch('/api/referrals/me', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || BUBU_COPY.rewards.errors.referralFetchFailed)
        return
      }
      setInfo(data)
    } catch {
      setError(BUBU_COPY.rewards.errors.network)
    } finally {
      setLoadingInfo(false)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    setActiveTab('invite')
    setMessage(null)
    setError(null)
    void fetchReferralInfo()
  }, [isOpen, fetchReferralInfo])

  useEffect(() => {
    if (!info?.inviteLink) {
      setQrDataUrl('')
      return
    }
    let cancelled = false
    void QRCode.toDataURL(info.inviteLink, {
      width: 320,
      margin: 1,
      color: { dark: '#332a2d', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    }).then(url => {
      if (!cancelled) setQrDataUrl(url)
    }).catch(() => {
      if (!cancelled) setError('二维码生成失败，请直接复制邀请链接')
    })
    return () => {
      cancelled = true
    }
  }, [info?.inviteLink])

  const markSuccess = (label: string) => {
    setCopySuccess(label)
    window.setTimeout(() => setCopySuccess(null), 1800)
  }

  const copyText = async (label: string, text: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      markSuccess(label)
    } catch {
      setError('复制失败，请长按邀请链接手动复制')
    }
  }

  const getCardBlob = async () => {
    if (!info || !qrDataUrl) throw new Error('分享卡片还在准备中')
    return createInviteCard(info, qrDataUrl)
  }

  const downloadCard = async () => {
    setCardBusy(true)
    setError(null)
    try {
      const blob = await getCardBlob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `卜卜象邀请卡-${info?.referralCode || 'invite'}.png`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      markSuccess('download')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存卡片失败')
    } finally {
      setCardBusy(false)
    }
  }

  const copyCard = async () => {
    setCardBusy(true)
    setError(null)
    try {
      const blob = await getCardBlob()
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        markSuccess('card')
      } else {
        await downloadCard()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '复制卡片失败')
    } finally {
      setCardBusy(false)
    }
  }

  const nativeShare = async () => {
    if (!info) return
    setCardBusy(true)
    setError(null)
    try {
      const blob = await getCardBlob()
      const file = new File([blob], `卜卜象邀请卡-${info.referralCode}.png`, { type: 'image/png' })
      const shareData: ShareData = { title: '卜卜象好友邀请', text: shareText, url: info.inviteLink, files: [file] }
      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData)
      } else {
        await copyText('text', shareText)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : '分享失败，请复制邀请文案')
    } finally {
      setCardBusy(false)
    }
  }

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    setError(null)
    const normalizedCode = code.trim().toUpperCase()
    if (!normalizedCode) {
      setError(BUBU_COPY.rewards.errors.missingCode)
      return
    }

    setRedeeming(true)
    try {
      const res = await fetch('/api/redemptions/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: normalizedCode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || BUBU_COPY.rewards.errors.redeemFailed)
        return
      }
      setMessage(data.message || BUBU_COPY.rewards.messages.redeemSuccess)
      setCode('')
      onRedeemed?.()
    } catch {
      setError(BUBU_COPY.rewards.errors.network)
    } finally {
      setRedeeming(false)
    }
  }

  if (!isOpen) return null

  const stats = info?.stats

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="rewards-dialog-title" className="relative max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card/95 p-5 shadow-2xl backdrop-blur-xl sm:p-6">
        <button onClick={onClose} className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground" aria-label="关闭邀请与兑换">
          <X className="h-4 w-4" />
        </button>

        <div className="mb-5 pr-10">
          <div className="flex items-center gap-2 text-primary">
            <Gift className="h-5 w-5" />
            <h2 id="rewards-dialog-title" className="text-2xl font-light text-foreground">邀请有礼</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">好友先免费体验，注册后双方都能获得长期苹果。</p>
        </div>

        <div role="tablist" aria-label="邀请与兑换" className="mb-5 grid grid-cols-2 rounded-xl bg-muted/45 p-1">
          <button role="tab" aria-selected={activeTab === 'invite'} onClick={() => setActiveTab('invite')} className={`rounded-lg px-3 py-2 text-sm transition-colors ${activeTab === 'invite' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>邀请好友</button>
          <button role="tab" aria-selected={activeTab === 'redeem'} onClick={() => setActiveTab('redeem')} className={`rounded-lg px-3 py-2 text-sm transition-colors ${activeTab === 'redeem' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>兑换码</button>
        </div>

        {activeTab === 'invite' ? (
          loadingInfo && !info ? (
            <div className="flex min-h-60 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在准备邀请卡片</div>
          ) : info ? (
            <div className="space-y-4">
              <section className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-4 sm:p-5">
                <div className="grid gap-5 sm:grid-cols-[1fr_150px] sm:items-center">
                  <div>
                    <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary"><Sparkles className="h-3.5 w-3.5" />双向奖励</div>
                    <h3 className="text-xl font-medium text-foreground">你和好友各得 {info.reward.inviteeApples} 🍎</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">好友注册验证后立即到账；好友完成注册后的首个完整回答，你的奖励也会到账。苹果 {info.reward.expiryDays} 天有效。</p>
                    <p className="mt-3 font-mono text-xs text-foreground">邀请码 {info.referralCode}</p>
                  </div>
                  <div className="mx-auto flex h-[150px] w-[150px] items-center justify-center rounded-2xl border border-border bg-white p-2 shadow-sm">
                    {qrDataUrl ? <Image src={qrDataUrl} alt="好友邀请二维码" width={132} height={132} unoptimized className="h-full w-full" /> : <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                  </div>
                </div>
              </section>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {[
                  ['点击', stats?.clicks || 0],
                  ['开始试用', stats?.trialStarted || 0],
                  ['完成试用', stats?.trialCompleted || 0],
                  ['已注册', stats?.registered || 0],
                  ['待激活', stats?.pending || 0],
                  ['已奖励', stats?.rewarded || 0],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-border bg-muted/20 px-2 py-3 text-center">
                    <p className="text-lg font-medium text-foreground">{value}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <button onClick={() => void nativeShare()} disabled={cardBusy || !qrDataUrl} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm text-primary-foreground disabled:opacity-50"><Share2 className="h-4 w-4" />系统分享</button>
                <button onClick={() => void copyText('text', shareText)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground"><Copy className="h-4 w-4" />{copySuccess === 'text' ? '文案已复制' : '复制邀请文案'}</button>
                <button onClick={() => void copyCard()} disabled={cardBusy || !qrDataUrl} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground disabled:opacity-50"><ImageIcon className="h-4 w-4" />{copySuccess === 'card' ? '卡片已复制' : '复制分享卡片'}</button>
                <button onClick={() => void downloadCard()} disabled={cardBusy || !qrDataUrl} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground disabled:opacity-50"><Download className="h-4 w-4" />{copySuccess === 'download' ? '卡片已保存' : '保存 PNG 卡片'}</button>
              </div>

              <div className="flex gap-2 rounded-xl border border-border bg-muted/20 p-2">
                <span className="min-w-0 flex-1 truncate px-2 py-1.5 text-xs text-muted-foreground">{info.inviteLink}</span>
                <button onClick={() => void copyText('link', info.inviteLink)} className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-card px-3 py-1.5 text-xs text-foreground shadow-sm"><LinkIcon className="h-3.5 w-3.5" />{copySuccess === 'link' ? '已复制' : '复制链接'}</button>
                <button onClick={() => void fetchReferralInfo()} disabled={loadingInfo} className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground shadow-sm" aria-label="刷新推广数据"><RefreshCw className={`h-3.5 w-3.5 ${loadingInfo ? 'animate-spin' : ''}`} /></button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex items-start gap-2 rounded-xl bg-muted/25 p-3 text-xs leading-5 text-muted-foreground"><MousePointerClick className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />首次有效邀请会锁定 {info.reward.attributionDays} 天，后续好友链接不会覆盖。</div>
                <div className="flex items-start gap-2 rounded-xl bg-muted/25 p-3 text-xs leading-5 text-muted-foreground"><UserCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />仅新注册用户参与；空回答、失败或取消不会触发邀请人奖励。</div>
              </div>
            </div>
          ) : null
        ) : (
          <section className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="mb-3 flex items-center gap-2"><Ticket className="h-4 w-4 text-primary" /><h3 className="text-sm font-medium text-foreground">兑换码</h3></div>
            <form onSubmit={handleRedeem} className="flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60" placeholder={BUBU_COPY.rewards.redeemPlaceholder} autoCapitalize="characters" />
              <button type="submit" disabled={redeeming} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{redeeming ? BUBU_COPY.rewards.redeemingButton : BUBU_COPY.rewards.redeemButton}</button>
            </form>
          </section>
        )}

        {message && <div className="mt-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary"><Check className="h-4 w-4" />{message}</div>}
        {error && <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      </div>
    </div>
  )
}
