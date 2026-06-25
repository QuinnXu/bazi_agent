"use client"

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { createBrowserClient, createPasswordRecoveryClient } from '@/lib/supabase/client'

interface AuthContextType {
  user: User | null
  loading: boolean
  signUp: (email: string, password: string, referralCode?: string) => Promise<{ error: any }>
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signOut: () => Promise<void>
  verifyOtp: (email: string, token: string, referralCode?: string) => Promise<{ error: any }>
  resendSignUpOtp: (email: string) => Promise<{ error: any }>
  updatePassword: (newPassword: string) => Promise<{ error: any }>
  resetPasswordForEmail: (email: string) => Promise<{ error: any }>
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
      const normalizedReferralCode = referralCode?.trim()
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: normalizedReferralCode
          ? { data: { referral_code: normalizedReferralCode } }
          : undefined,
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
          }
        } catch (settleError) {
          console.warn('[Auth] 注册奖励结算异常，登录已成功:', settleError)
        }
      }

      return { error: null }
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

  return (
    <AuthContext.Provider value={{
      user, loading,
      signUp, signIn, signOut,
      verifyOtp, resendSignUpOtp, updatePassword, resetPasswordForEmail,
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
