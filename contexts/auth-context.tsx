"use client"

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { createBrowserClient, createPasswordRecoveryClient } from '@/lib/supabase/client'
import type { RegistrationRewardResult } from '@/lib/rewards'

interface AuthResult {
  error: any
  reward?: RegistrationRewardResult
}

interface AuthContextType {
  user: User | null
  loading: boolean
  signUp: (email: string, password: string, referralCode?: string) => Promise<{ error: any }>
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signOut: () => Promise<void>
  verifyOtp: (email: string, token: string, referralCode?: string) => Promise<AuthResult>
  resendSignUpOtp: (email: string) => Promise<{ error: any }>
  updatePassword: (newPassword: string) => Promise<{ error: any }>
  resetPasswordForEmail: (email: string) => Promise<{ error: any }>
  deleteAccount: (confirmationEmail: string) => Promise<{ error: any }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createBrowserClient()

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      setLoading(false)
    }
    initAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const signUp = async (email: string, password: string, referralCode?: string) => {
    try {
      void referralCode
      const { error } = await supabase.auth.signUp({
        email,
        password,
      })
      if (error) return { error }
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (!error) {
        // Retry the idempotent registration settlement on later sign-ins.
        void fetch('/api/referrals/complete-registration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }).catch(() => undefined)
      }
      return { error }
    } catch (error) {
      return { error }
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const verifyOtp = async (email: string, token: string, referralCode?: string) => {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'signup',
      })
      if (error) return { error }

      let verifiedUser = data?.user ?? data?.session?.user ?? null
      if (verifiedUser) {
        setUser(verifiedUser)
      } else {
        const { data: { session } } = await supabase.auth.getSession()
        verifiedUser = session?.user ?? null
        setUser(verifiedUser)
      }

      // 验证成功后自动创建 profile
      let registrationReward: RegistrationRewardResult | undefined
      if (verifiedUser) {
        try {
          let settleRes = await fetch('/api/referrals/complete-registration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ referral_code: referralCode?.trim() || undefined }),
          })

          if (settleRes.status === 401) {
            await supabase.auth.getSession()
            await new Promise(resolve => setTimeout(resolve, 200))
            settleRes = await fetch('/api/referrals/complete-registration', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ referral_code: referralCode?.trim() || undefined }),
            })
          }

          if (!settleRes.ok) {
            const settleData = await settleRes.json().catch(() => ({}))
            console.warn('[Auth] 注册奖励结算失败，登录已成功:', settleData.error || settleRes.status)
          } else {
            const settleData = await settleRes.json().catch(() => ({}))
            registrationReward = {
              referralApplied: settleData.referralApplied === true,
              reason: settleData.reason,
              referralCode: settleData.referralCode || null,
              referrerUserId: settleData.referrerUserId,
              newUserRewardApples: settleData.newUserRewardApples,
              referrerRewardApples: settleData.referrerRewardApples,
              rewardExpiryDays: settleData.rewardExpiryDays,
              newUserRewardExpiresAt: settleData.newUserRewardExpiresAt,
              referrerRewardPending: settleData.referrerRewardPending === true,
            }
          }
        } catch (settleError) {
          console.warn('[Auth] 注册奖励结算异常，登录已成功:', settleError)
        }

        try {
          let consentRes = await fetch('/api/legal/consent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })

          if (consentRes.status === 401) {
            await supabase.auth.getSession()
            await new Promise(resolve => setTimeout(resolve, 200))
            consentRes = await fetch('/api/legal/consent', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            })
          }

          if (!consentRes.ok) {
            const consentData = await consentRes.json().catch(() => ({}))
            console.warn('[Auth] 协议同意记录保存失败，登录已成功:', consentData.error || consentRes.status)
          }
        } catch (consentError) {
          console.warn('[Auth] 协议同意记录保存异常，登录已成功:', consentError)
        }
      }

      return { error: null, reward: registrationReward }
    } catch (error) {
      return { error }
    }
  }

  const resendSignUpOtp = async (email: string) => {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      })
      return { error: error ?? null }
    } catch (error) {
      return { error }
    }
  }

  const updatePassword = async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })
      return { error: error ?? null }
    } catch (error) {
      return { error }
    }
  }

  const resetPasswordForEmail = async (email: string) => {
    try {
      const passwordRecoveryClient = createPasswordRecoveryClient()
      const { error } = await passwordRecoveryClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })
      return { error: error ?? null }
    } catch (error) {
      return { error }
    }
  }

  const deleteAccount = async (confirmationEmail: string) => {
    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmationEmail }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        return { error: new Error(data?.error || '账户注销失败，请稍后再试') }
      }

      try {
        await supabase.auth.signOut()
      } catch {
        // 删除 Auth 用户后，远端 session 可能已经失效；本地状态仍要清空。
      }
      setUser(null)
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  return (
    <AuthContext.Provider value={{
      user, loading,
      signUp, signIn, signOut,
      verifyOtp, resendSignUpOtp, updatePassword, resetPasswordForEmail, deleteAccount,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
