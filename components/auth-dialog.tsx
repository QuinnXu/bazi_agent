"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { X, Mail, Lock, ArrowLeft, Ticket } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { BUBU_COPY, buildAuthDialogTitles, formatAuthErrorMessage } from '@/lib/bubu-content'

type AuthMode = 'signin' | 'signup' | 'verify_otp' | 'forgot_password'

interface AuthDialogProps {
  isOpen: boolean
  onClose: () => void
  mode?: 'signin' | 'signup'
}

export function AuthDialog({ isOpen, onClose, mode: initialMode = 'signin' }: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [referralCode, setReferralCode] = useState('')
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [resendCountdown, setResendCountdown] = useState(0)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])
  const otpVerifyInFlightRef = useRef(false)
  const verifiedOtpKeyRef = useRef<string | null>(null)
  const { signIn, signUp, verifyOtp, resendSignUpOtp, resetPasswordForEmail } = useAuth()

  // 60 秒重发倒计时
  useEffect(() => {
    if (resendCountdown <= 0) return
    const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendCountdown])

  // 重置弹窗关闭时的状态
  useEffect(() => {
    if (!isOpen) {
      setError(null)
      setSuccessMessage(null)
      setOtpDigits(['', '', '', '', '', ''])
      otpVerifyInFlightRef.current = false
      verifiedOtpKeyRef.current = null
      return
    }

    const params = new URLSearchParams(window.location.search)
    const codeFromUrl = params.get('ref') || params.get('invite')
    const savedCode = window.localStorage.getItem('bubu_referral_code')
    const nextCode = (codeFromUrl || savedCode || '').trim().toUpperCase()
    if (nextCode) {
      setReferralCode(nextCode)
      window.localStorage.setItem('bubu_referral_code', nextCode)
    }
  }, [isOpen])

  const clearMessages = useCallback(() => {
    setError(null)
    setSuccessMessage(null)
  }, [])

  // ── 注册 / 登录 提交 ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearMessages()
    setLoading(true)

    try {
      if (mode === 'signin') {
        const { error: err } = await signIn(email, password)
        if (err) {
          setError(formatAuthErrorMessage(err))
        } else {
          onClose()
        }
      } else if (mode === 'signup') {
        const normalizedReferralCode = referralCode.trim().toUpperCase()
        if (normalizedReferralCode) {
          window.localStorage.setItem('bubu_referral_code', normalizedReferralCode)
        }
        const { error: err } = await signUp(email, password, normalizedReferralCode)
        if (err) {
          setError(formatAuthErrorMessage(err))
        } else {
          // 注册成功 → 进入验证码输入步骤
          otpVerifyInFlightRef.current = false
          verifiedOtpKeyRef.current = null
          setMode('verify_otp')
          setResendCountdown(60)
          setSuccessMessage(BUBU_COPY.auth.messages.otpSent(email))
        }
      }
    } catch {
      setError(BUBU_COPY.auth.errors.generic)
    } finally {
      setLoading(false)
    }
  }

  // ── OTP 验证码处理 ──
  const handleOtpChange = useCallback((index: number, value: string) => {
    if (!/^\d*$/.test(value)) return // 只允许数字

    const newDigits = [...otpDigits]
    newDigits[index] = value.slice(-1) // 只取最后一个字符
    setOtpDigits(newDigits)

    // 自动跳到下一格
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus()
    }
  }, [otpDigits])

  const handleOtpKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }
  }, [otpDigits])

  const handleOtpPaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const newDigits = [...otpDigits]
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || ''
    }
    setOtpDigits(newDigits)
    // 聚焦到最后填入的位置
    const focusIndex = Math.min(pasted.length, 5)
    otpRefs.current[focusIndex]?.focus()
  }, [otpDigits])

  const handleVerifyOtp = useCallback(async () => {
    clearMessages()
    const token = otpDigits.join('')
    if (token.length !== 6) {
      setError(BUBU_COPY.auth.messages.otpIncomplete)
      return
    }

    const normalizedEmail = email.trim().toLowerCase()
    const otpKey = `${normalizedEmail}:${token}`
    if (otpVerifyInFlightRef.current || verifiedOtpKeyRef.current === otpKey) {
      return
    }

    otpVerifyInFlightRef.current = true
    setLoading(true)
    try {
      const { error: err } = await verifyOtp(normalizedEmail || email, token, referralCode.trim().toUpperCase())
      if (err) {
        verifiedOtpKeyRef.current = null
        setError(formatAuthErrorMessage(err))
      } else {
        verifiedOtpKeyRef.current = otpKey
        window.localStorage.removeItem('bubu_referral_code')
        onClose()
      }
    } catch {
      verifiedOtpKeyRef.current = null
      setError(BUBU_COPY.auth.messages.otpVerifyFailed)
    } finally {
      otpVerifyInFlightRef.current = false
      setLoading(false)
    }
  }, [clearMessages, email, onClose, otpDigits, referralCode, verifyOtp])

  // 自动提交：6 位都填满时自动验证
  useEffect(() => {
    if (mode === 'verify_otp' && otpDigits.every(d => d !== '')) {
      handleVerifyOtp()
    }
  }, [handleVerifyOtp, otpDigits, mode])

  const handleResend = async () => {
    if (resendCountdown > 0) return
    clearMessages()
    setLoading(true)
    try {
      const { error: err } = await resendSignUpOtp(email)
      if (err) {
        setError(formatAuthErrorMessage(err))
      } else {
        setResendCountdown(60)
        setSuccessMessage(BUBU_COPY.auth.messages.otpResent)
        setOtpDigits(['', '', '', '', '', ''])
        otpVerifyInFlightRef.current = false
        verifiedOtpKeyRef.current = null
        otpRefs.current[0]?.focus()
      }
    } catch {
      setError(BUBU_COPY.auth.messages.sendFailed)
    } finally {
      setLoading(false)
    }
  }

  // ── 忘记密码 ──
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    clearMessages()
    if (!email) {
      setError(BUBU_COPY.auth.messages.missingEmail)
      return
    }
    setLoading(true)
    try {
      const { error: err } = await resetPasswordForEmail(email)
      if (err) {
        setError(formatAuthErrorMessage(err))
      } else {
        setSuccessMessage(BUBU_COPY.auth.messages.resetSent)
      }
    } catch {
      setError(BUBU_COPY.auth.messages.sendFailed)
    } finally {
      setLoading(false)
    }
  }

  // ── 模式切换 ──
  const resetOtpState = () => {
    setOtpDigits(['', '', '', '', '', ''])
    otpVerifyInFlightRef.current = false
    verifiedOtpKeyRef.current = null
  }

  const goToSignIn = () => { setMode('signin'); clearMessages(); resetOtpState() }
  const goToSignUp = () => { setMode('signup'); clearMessages(); resetOtpState() }
  const goToForgotPassword = () => { setMode('forgot_password'); clearMessages() }

  if (!isOpen) return null

  // ── 标题文案 ──
  const titles = buildAuthDialogTitles(email)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-card/95 backdrop-blur-sm border border-border rounded-2xl p-6 max-w-md w-full shadow-xl glass-minimal">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 w-8 h-8 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* 返回按钮（verify_otp / forgot_password 时显示） */}
        {(mode === 'verify_otp' || mode === 'forgot_password') && (
          <button
            onClick={goToSignIn}
            className="absolute left-4 top-4 w-8 h-8 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
        )}

        {/* 标题 */}
        <div className="mb-6 flex items-start gap-3 pr-8">
          <span className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl border border-primary/20 bg-card shadow-sm">
            <Image src="/avatar.png" alt="卜卜象" width={44} height={44} className="h-full w-full object-contain" />
          </span>
          <div className="min-w-0">
            <h2 className="text-2xl font-light text-foreground mb-2">
              {titles[mode].title}
            </h2>
            <p className="text-sm text-muted-foreground">
              {titles[mode].subtitle}
            </p>
          </div>
        </div>

        {/* ═══ 登录 / 注册 表单 ═══ */}
        {(mode === 'signin' || mode === 'signup') && (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-light text-foreground mb-2">{BUBU_COPY.auth.labels.email}</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-lg bg-card/60 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-300"
                    placeholder={BUBU_COPY.auth.placeholders.email}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-light text-foreground mb-2">{BUBU_COPY.auth.labels.password}</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-lg bg-card/60 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-300"
                    placeholder={BUBU_COPY.auth.placeholders.password}
                    required
                    minLength={6}
                  />
                </div>
              </div>

              {mode === 'signup' && (
                <div>
                  <label className="block text-sm font-light text-foreground mb-2">{BUBU_COPY.auth.labels.referralCode}</label>
                  <div className="relative">
                    <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                      className="w-full pl-10 pr-4 py-3 rounded-lg bg-card/60 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-300"
                      placeholder={BUBU_COPY.auth.placeholders.referralCode}
                      autoCapitalize="characters"
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
              {successMessage && (
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <p className="text-sm text-primary">{successMessage}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-light hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300"
              >
                {loading ? BUBU_COPY.auth.buttons.processing : mode === 'signin' ? BUBU_COPY.auth.buttons.signin : BUBU_COPY.auth.buttons.signup}
              </button>
            </form>

            {/* 底部链接 */}
            <div className="mt-4 flex flex-col items-center gap-2">
              <button
                onClick={mode === 'signin' ? goToSignUp : goToSignIn}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {mode === 'signin' ? BUBU_COPY.auth.buttons.goSignup : BUBU_COPY.auth.buttons.goSignin}
              </button>
              {mode === 'signin' && (
                <button
                  onClick={goToForgotPassword}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {BUBU_COPY.auth.buttons.forgotPassword}
                </button>
              )}
            </div>
          </>
        )}

        {/* ═══ OTP 验证码输入 ═══ */}
        {mode === 'verify_otp' && (
          <div className="space-y-6">
            {/* 6 位验证码输入框 */}
            <div className="flex justify-center gap-3" onPaste={handleOtpPaste}>
              {otpDigits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  className="w-12 h-14 text-center text-xl font-light rounded-lg bg-card/60 border border-border text-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-300"
                  autoFocus={i === 0}
                />
              ))}
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
            {successMessage && (
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                <p className="text-sm text-primary">{successMessage}</p>
              </div>
            )}

            {/* 手动验证按钮 */}
            <button
              onClick={handleVerifyOtp}
              disabled={loading || otpDigits.some(d => d === '')}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-light hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300"
            >
              {loading ? BUBU_COPY.auth.buttons.otpChecking : BUBU_COPY.auth.buttons.otpSubmit}
            </button>

            {/* 重发验证码 */}
            <div className="text-center">
              <button
                onClick={handleResend}
                disabled={resendCountdown > 0 || loading}
                className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {resendCountdown > 0
                  ? BUBU_COPY.auth.buttons.resendCountdown(resendCountdown)
                  : BUBU_COPY.auth.buttons.resendOtp}
              </button>
            </div>
          </div>
        )}

        {/* ═══ 忘记密码 ═══ */}
        {mode === 'forgot_password' && (
          <>
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-light text-foreground mb-2">{BUBU_COPY.auth.labels.email}</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-lg bg-card/60 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-300"
                    placeholder={BUBU_COPY.auth.placeholders.email}
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
              {successMessage && (
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <p className="text-sm text-primary">{successMessage}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-light hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300"
              >
                {loading ? BUBU_COPY.auth.buttons.sendingMail : BUBU_COPY.auth.buttons.sendReset}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={goToSignIn}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {BUBU_COPY.auth.buttons.backToSignin}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
