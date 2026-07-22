"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { X, Mail, Lock, ArrowLeft, Ticket, ShieldCheck } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { useAuth } from '@/contexts/auth-context'
import { BUBU_COPY, buildAuthDialogTitles, formatAuthErrorMessage } from '@/lib/bubu-content'
import { AUTH_LEGAL_AGREEMENT_LINKS } from '@/lib/legal-agreements'
import type { RegistrationRewardResult } from '@/lib/rewards'

type AuthMode = 'signin' | 'signup' | 'verify_otp' | 'forgot_password'

interface AuthDialogProps {
  isOpen: boolean
  onClose: () => void
  mode?: 'signin' | 'signup'
  onRegistrationReward?: (reward: RegistrationRewardResult) => void
}

const OTP_LENGTH = 8
const REFERRAL_CODE_STORAGE_KEY = 'bubu_referral_code'
const REFERRAL_CODE_EXPIRY_KEY = 'bubu_referral_code_expires_at'
const REFERRAL_CODE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const createEmptyOtpDigits = () => Array.from({ length: OTP_LENGTH }, () => '')

export function AuthDialog({
  isOpen,
  onClose,
  mode: initialMode = 'signin',
  onRegistrationReward,
}: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [referralCode, setReferralCode] = useState('')
  const [referralLocked, setReferralLocked] = useState(false)
  const [otpDigits, setOtpDigits] = useState<string[]>(createEmptyOtpDigits)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])
  const otpVerifyInFlightRef = useRef(false)
  const verifiedOtpKeyRef = useRef<string | null>(null)
  const { signIn, signUp, verifyOtp, resendSignUpOtp, resetPasswordForEmail } = useAuth()

  useEffect(() => {
    if (isOpen) setMode(initialMode)
  }, [initialMode, isOpen])

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
      setLegalAccepted(false)
      setReferralLocked(false)
      setOtpDigits(createEmptyOtpDigits())
      otpVerifyInFlightRef.current = false
      verifiedOtpKeyRef.current = null
      return
    }

    const params = new URLSearchParams(window.location.search)
    const codeFromUrl = params.get('ref') || params.get('invite')
    const savedExpiry = Number(window.localStorage.getItem(REFERRAL_CODE_EXPIRY_KEY) || 0)
    const savedCode = savedExpiry > Date.now()
      ? window.localStorage.getItem(REFERRAL_CODE_STORAGE_KEY)
      : null
    if (!savedCode && savedExpiry) {
      window.localStorage.removeItem(REFERRAL_CODE_STORAGE_KEY)
      window.localStorage.removeItem(REFERRAL_CODE_EXPIRY_KEY)
    }
    const nextCode = (codeFromUrl || savedCode || '').trim().toUpperCase()
    if (nextCode) {
      setReferralCode(nextCode)
      window.localStorage.setItem(REFERRAL_CODE_STORAGE_KEY, nextCode)
      window.localStorage.setItem(REFERRAL_CODE_EXPIRY_KEY, String(Date.now() + REFERRAL_CODE_TTL_MS))
    }

    let cancelled = false
    void fetch('/api/referrals/attribution', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (cancelled || data?.attributed !== true || !data.referralCode) return
        const attributedCode = String(data.referralCode).trim().toUpperCase()
        setReferralCode(attributedCode)
        setReferralLocked(true)
        window.localStorage.setItem(REFERRAL_CODE_STORAGE_KEY, attributedCode)
        window.localStorage.setItem(REFERRAL_CODE_EXPIRY_KEY, String(new Date(data.expiresAt).getTime()))
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
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

    if (mode === 'signup' && !legalAccepted) {
      setError(BUBU_COPY.auth.messages.legalConsentRequired)
      return
    }

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
          window.localStorage.setItem(REFERRAL_CODE_STORAGE_KEY, normalizedReferralCode)
          window.localStorage.setItem(REFERRAL_CODE_EXPIRY_KEY, String(Date.now() + REFERRAL_CODE_TTL_MS))
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
          setSuccessMessage(null)
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

    const digits = value.replace(/\D/g, '')
    if (!digits) {
      const newDigits = [...otpDigits]
      newDigits[index] = ''
      setOtpDigits(newDigits)
      return
    }

    const newDigits = [...otpDigits]
    if (digits.length > 1) {
      digits
        .slice(0, OTP_LENGTH - index)
        .split('')
        .forEach((digit, offset) => {
          newDigits[index + offset] = digit
        })
      setOtpDigits(newDigits)
      otpRefs.current[Math.min(index + digits.length, OTP_LENGTH - 1)]?.focus()
      return
    }

    newDigits[index] = digits // 只取单个数字
    setOtpDigits(newDigits)

    // 自动跳到下一格
    if (value && index < OTP_LENGTH - 1) {
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
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!pasted) return
    const newDigits = createEmptyOtpDigits()
    for (let i = 0; i < OTP_LENGTH; i++) {
      newDigits[i] = pasted[i] || ''
    }
    setOtpDigits(newDigits)
    // 聚焦到最后填入的位置
    const focusIndex = Math.min(pasted.length, OTP_LENGTH - 1)
    otpRefs.current[focusIndex]?.focus()
  }, [])

  const handleVerifyOtp = useCallback(async () => {
    clearMessages()
    const token = otpDigits.join('')
    if (token.length !== OTP_LENGTH) {
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
      const { error: err, reward } = await verifyOtp(normalizedEmail || email, token, referralCode.trim().toUpperCase())
      if (err) {
        verifiedOtpKeyRef.current = null
        setError(formatAuthErrorMessage(err))
      } else {
        verifiedOtpKeyRef.current = otpKey
        window.localStorage.removeItem(REFERRAL_CODE_STORAGE_KEY)
        window.localStorage.removeItem(REFERRAL_CODE_EXPIRY_KEY)
        if (reward?.referralApplied) {
          onRegistrationReward?.(reward)
        }
        onClose()
      }
    } catch {
      verifiedOtpKeyRef.current = null
      setError(BUBU_COPY.auth.messages.otpVerifyFailed)
    } finally {
      otpVerifyInFlightRef.current = false
      setLoading(false)
    }
  }, [clearMessages, email, onClose, onRegistrationReward, otpDigits, referralCode, verifyOtp])

  // 自动提交：8 位都填满时自动验证
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
        setOtpDigits(createEmptyOtpDigits())
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
    setOtpDigits(createEmptyOtpDigits())
    otpVerifyInFlightRef.current = false
    verifiedOtpKeyRef.current = null
  }

  const goToSignIn = () => { setMode('signin'); clearMessages(); resetOtpState(); setLegalAccepted(false) }
  const goToSignUp = () => { setMode('signup'); clearMessages(); resetOtpState(); setLegalAccepted(false) }
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
          aria-label="关闭登录窗口"
          className="absolute right-4 top-4 w-8 h-8 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* 返回按钮（verify_otp / forgot_password 时显示） */}
        {(mode === 'verify_otp' || mode === 'forgot_password') && (
          <button
            onClick={goToSignIn}
            aria-label="返回登录"
            className="absolute left-4 top-4 w-8 h-8 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
        )}

        {/* 标题 */}
        <div className={`mb-6 flex items-start gap-3 pr-8 ${(mode === 'verify_otp' || mode === 'forgot_password') ? 'pl-9' : ''}`}>
          <span className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl border border-primary/20 bg-card shadow-sm">
            <Image src="/avatar-small.png" alt="卜卜象" width={44} height={44} className="h-full w-full object-contain" />
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
                    className="w-full pl-10 pr-4 py-3 rounded-lg bg-card/60 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-150"
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
                    className="w-full pl-10 pr-4 py-3 rounded-lg bg-card/60 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-150"
                    placeholder={BUBU_COPY.auth.placeholders.password}
                    required
                    minLength={6}
                  />
                </div>
              </div>

              {mode === 'signup' && (
                <div>
                  <label className="block text-sm font-light text-foreground mb-2">
                    {referralLocked ? '好友邀请已绑定' : BUBU_COPY.auth.labels.referralCode}
                  </label>
                  <div className="relative">
                    <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={referralCode}
                      onChange={(e) => {
                        if (!referralLocked) setReferralCode(e.target.value.toUpperCase())
                      }}
                      readOnly={referralLocked}
                      className="w-full pl-10 pr-4 py-3 rounded-lg bg-card/60 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-150"
                      placeholder={BUBU_COPY.auth.placeholders.referralCode}
                      autoCapitalize="characters"
                    />
                  </div>
                  {referralLocked && (
                    <p className="mt-1.5 text-xs text-primary">
                      注册验证后获得 30 个苹果，365 天有效
                    </p>
                  )}
                </div>
              )}

              {mode === 'signup' && (
                <div className="rounded-lg border border-border bg-card/50 p-3">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="auth-legal-consent"
                      checked={legalAccepted}
                      onCheckedChange={(checked) => {
                        setLegalAccepted(checked === true)
                        if (checked === true && error === BUBU_COPY.auth.messages.legalConsentRequired) {
                          setError(null)
                        }
                      }}
                      className="mt-1"
                      aria-label={BUBU_COPY.auth.legal.checkboxAriaLabel}
                    />
                    <div className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
                      <label htmlFor="auth-legal-consent" className="cursor-pointer text-foreground">
                        {BUBU_COPY.auth.legal.consentPrefix}
                      </label>
                      {AUTH_LEGAL_AGREEMENT_LINKS.map((link, index) => (
                        <React.Fragment key={link.href}>
                          <a
                            href={link.href}
                            target="_blank"
                            rel="noreferrer"
                            className="mx-0.5 text-primary underline-offset-4 hover:underline"
                          >
                            {link.label}
                          </a>
                          {index < AUTH_LEGAL_AGREEMENT_LINKS.length - 1 ? '、' : ''}
                        </React.Fragment>
                      ))}
                      <span>{BUBU_COPY.auth.legal.consentSuffix}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-start gap-2 rounded-md bg-primary/5 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                    <p>{BUBU_COPY.auth.legal.registrationNotice}</p>
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
                className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-light hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
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
            {/* 8 位验证码输入框 */}
            <div className="mx-auto grid w-full max-w-[22rem] grid-cols-8 gap-1.5 sm:gap-2" onPaste={handleOtpPaste}>
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
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  className="aspect-square min-h-10 min-w-0 rounded-lg border border-border bg-card/70 text-center text-lg font-light text-foreground shadow-sm transition-all duration-200 focus:border-primary/60 focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/10 sm:text-xl"
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
              <div className="rounded-lg border border-border bg-muted/35 px-3 py-2 text-center">
                <p className="text-xs leading-5 text-muted-foreground">{successMessage}</p>
              </div>
            )}

            {/* 手动验证按钮 */}
            <button
              onClick={handleVerifyOtp}
              disabled={loading || otpDigits.some(d => d === '')}
              className="w-full rounded-lg bg-primary py-3 font-light text-primary-foreground transition-all duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              {loading ? BUBU_COPY.auth.buttons.otpChecking : BUBU_COPY.auth.buttons.otpSubmit}
            </button>

            {/* 重发验证码 */}
            <div className="text-center">
              <button
                onClick={handleResend}
                disabled={resendCountdown > 0 || loading}
                className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55"
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
                    className="w-full pl-10 pr-4 py-3 rounded-lg bg-card/60 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-150"
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
                className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-light hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
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
