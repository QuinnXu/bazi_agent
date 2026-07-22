"use client"

import { useEffect, useState } from "react"
import { MembershipPlansSurface, type MembershipAppleQuota } from "@/components/membership-plans"
import { useAuth } from "@/contexts/auth-context"

export function MembershipPage() {
  const { user, loading } = useAuth()
  const [appleQuota, setAppleQuota] = useState<MembershipAppleQuota | null>(null)
  const [quotaLoading, setQuotaLoading] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user) {
      setAppleQuota(null)
      setQuotaLoading(false)
      return
    }

    let cancelled = false
    setQuotaLoading(true)

    const fetchQuota = async () => {
      try {
        const res = await fetch('/api/quota')
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setAppleQuota({
          tier: data.tier ?? 'free',
          remaining: Number(data.remaining ?? 0),
          dailyRemaining: Number(data.dailyRemaining ?? data.remaining ?? 0),
          dailyLimit: Number(data.dailyLimit ?? 0),
          walletBalance: Number(data.walletBalance ?? 0),
          walletExpiresAt: data.walletExpiresAt ?? null,
          unlimited: Boolean(data.unlimited),
          isPaid: Boolean(data.isPaid),
          membershipExpiresAt: data.membershipExpiresAt ?? null,
          nextMembershipTier: data.nextMembershipTier ?? null,
          nextMembershipStartsAt: data.nextMembershipStartsAt ?? null,
          bonusAppleLimit: typeof data.bonusAppleLimit === 'number' ? data.bonusAppleLimit : undefined,
          bonusExpiresAt: data.bonusExpiresAt ?? null,
        })
      } catch (error) {
        console.warn('[Membership] Failed to fetch quota:', error)
      } finally {
        if (!cancelled) setQuotaLoading(false)
      }
    }

    fetchQuota()

    return () => {
      cancelled = true
    }
  }, [loading, user])

  return (
    <MembershipPlansSurface
      appleQuota={appleQuota}
      closeHref="/"
      isAuthenticated={Boolean(user)}
      isQuotaLoading={loading || quotaLoading}
      variant="page"
    />
  )
}
