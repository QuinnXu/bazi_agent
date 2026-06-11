"use client"

import React, { useEffect, useState, useCallback } from 'react'
import { X, Copy, Gift, RefreshCw, Ticket, Link as LinkIcon } from 'lucide-react'
import { BUBU_COPY } from '@/lib/bubu-content'

interface RewardsDialogProps {
  isOpen: boolean
  onClose: () => void
  onRedeemed?: () => void
}

interface ReferralInfo {
  referralCode: string
  inviteLink: string
  stats?: {
    total: number
    rewarded: number
  }
}

export function RewardsDialog({ isOpen, onClose, onRedeemed }: RewardsDialogProps) {
  const [info, setInfo] = useState<ReferralInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [copySuccess, setCopySuccess] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchReferralInfo = useCallback(async () => {
    if (!isOpen) return
    setLoadingInfo(true)
    setError(null)
    try {
      const res = await fetch('/api/referrals/me')
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
    setMessage(null)
    setError(null)
    fetchReferralInfo()
  }, [isOpen, fetchReferralInfo])

  const copyText = async (label: string, text: string) => {
    if (!text) return
    await navigator.clipboard?.writeText(text)
    setCopySuccess(label)
    setTimeout(() => setCopySuccess(null), 1600)
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card/95 p-6 shadow-xl backdrop-blur-sm">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          title={BUBU_COPY.rewards.closeTitle}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-5 pr-10">
          <h2 className="text-2xl font-light text-foreground">{BUBU_COPY.rewards.title}</h2>
          <p className="mt-1 text-sm font-light text-muted-foreground">
            {BUBU_COPY.rewards.description}
          </p>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium text-foreground">{BUBU_COPY.rewards.referral}</h3>
              </div>
              <button
                onClick={fetchReferralInfo}
                disabled={loadingInfo}
                className="flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingInfo ? 'animate-spin' : ''}`} />
                {BUBU_COPY.rewards.refreshButton}
              </button>
            </div>

            {loadingInfo && !info ? (
              <p className="text-sm font-light text-muted-foreground">{BUBU_COPY.rewards.loading}</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-xs font-light text-muted-foreground">{BUBU_COPY.rewards.referralCode}</p>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
                      {info?.referralCode || '-'}
                    </code>
                    <button
                      onClick={() => copyText('code', info?.referralCode || '')}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
                      title={BUBU_COPY.rewards.copyReferralCodeTitle}
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-xs font-light text-muted-foreground">{BUBU_COPY.rewards.inviteLink}</p>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
                      {info?.inviteLink || '-'}
                    </span>
                    <button
                      onClick={() => copyText('link', info?.inviteLink || '')}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
                      title={BUBU_COPY.rewards.copyInviteLinkTitle}
                    >
                      <LinkIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <p className="text-xs font-light text-muted-foreground">
                  {BUBU_COPY.rewards.stats(info?.stats?.rewarded || 0, info?.stats?.total || 0)}
                  {copySuccess === 'code' && BUBU_COPY.rewards.copiedCode}
                  {copySuccess === 'link' && BUBU_COPY.rewards.copiedLink}
                </p>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Ticket className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-medium text-foreground">{BUBU_COPY.rewards.redeemTitle}</h3>
            </div>
            <form onSubmit={handleRedeem} className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
                placeholder={BUBU_COPY.rewards.redeemPlaceholder}
                autoCapitalize="characters"
              />
              <button
                type="submit"
                disabled={redeeming}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-light text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {redeeming ? BUBU_COPY.rewards.redeemingButton : BUBU_COPY.rewards.redeemButton}
              </button>
            </form>
          </section>

          {message && (
            <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">
              {message}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
