"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { X, Mail, Lock, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'

type AuthMode = 'signin' | 'signup' | 'verify_otp' | 'forgot_password'

interface AuthDialogProps {
  isOpen: boolean
  onClose: () => void
  mode?: 'signin' | 'signup'
}

function authErrorMessage(err: { message?: string } | null): string {
  if (!err?.message) return '哎呀，网络好像打了个小盹，稍后再试一次喔 🐘'
  const msg = err.message.toLowerCase()
  if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('already been registered'))
    return '这个邮箱已经是卜卜象的好朋友啦，直接登录吧 🐘'
  if (msg.includes('invalid login') || msg.includes('invalid_credentials'))
    return '哎呀，密码好像有点小脾气，要不再试一次？ 🐾'
  if (msg.includes('email not confirmed'))
    return '需要去邮箱找找卜卜象寄给你的验证小信封哦 ✉️'
  if (msg.includes('token has expired') || msg.includes('otp_expired'))
    return '验证码已经在风中走散啊，让卜卜象再发一个吧 🌬️'
  if (msg.includes('otp_disabled'))
    return '验证码功能未启用，请联系管理员'
  return err.message
}

export function AuthDialog({ isOpen, onClose, mode: initialMode = 'signin' }: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [resendCountdown, setResendCountdown] = useState(0)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])
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
    }
  }, [isOpen])

  const clearMessages = () => {
    setError(null)
    setSuccessMessage(null)
  }

  // ── 注册 / 登录 提交 ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearMessages()
    setLoading(true)

    try {
      if (mode === 'signin') {
        const { error: err } = await signIn(email, password)
        if (err) {
          setError(authErrorMessage(err))
        } else {
          onClose()
        }
      } else if (mode === 'signup') {
        const { error: err } = await signUp(email, password)
        if (err) {
          setError(authErrorMessage(err))
        } else {
          // 注册成功 → 进入验证码输入步骤
          setMode('verify_otp')
          setResendCountdown(60)
          setSuccessMessage(`卜卜象已经把验证码寄到 ${email}`)
        }
      }
    } catch {
      setError('哎呀，网络好像打了个小盹，稍后再试一次喔 🐘')
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

  const handleVerifyOtp = async () => {
    clearMessages()
    const token = otpDigits.join('')
    if (token.length !== 6) {
      setError('小象还缺完整的 6 位验证码')
      return
    }

    setLoading(true)
    try {
      const { error: err } = await verifyOtp(email, token)
      if (err) {
        setError(authErrorMessage(err))
      } else {
        onClose()
      }
    } catch {
      setError('小象没有核对成功，稍后再试一次喔')
    } finally {
      setLoading(false)
    }
  }

  // 自动提交：6 位都填满时自动验证
  useEffect(() => {
    if (mode === 'verify_otp' && otpDigits.every(d => d !== '')) {
      handleVerifyOtp()
    }
  }, [otpDigits, mode])

  const handleResend = async () => {
    if (resendCountdown > 0) return
    clearMessages()
    setLoading(true)
    try {
      const { error: err } = await resendSignUpOtp(email)
      if (err) {
        setError(authErrorMessage(err))
      } else {
        setResendCountdown(60)
        setSuccessMessage('小象重新寄出验证码啦，请查收邮箱')
        setOtpDigits(['', '', '', '', '', ''])
        otpRefs.current[0]?.focus()
      }
    } catch {
      setError('小象暂时没寄出去，稍后再试一次喔')
    } finally {
      setLoading(false)
    }
  }

  // ── 忘记密码 ──
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    clearMessages()
    if (!email) {
      setError('小象还需要你的邮箱地址')
      return
    }
    setLoading(true)
    try {
      const { error: err } = await resetPasswordForEmail(email)
      if (err) {
        setError(authErrorMessage(err))
      } else {
        setSuccessMessage('小象已经寄出重置邮件，点开邮件里的链接就能去修改密码喔。')
      }
    } catch {
      setError('小象暂时没寄出去，稍后再试一次喔')
    } finally {
      setLoading(false)
    }
  }

  // ── 模式切换 ──
  const goToSignIn = () => { setMode('signin'); clearMessages(); setOtpDigits(['', '', '', '', '', '']) }
  const goToSignUp = () => { setMode('signup'); clearMessages() }
  const goToForgotPassword = () => { setMode('forgot_password'); clearMessages() }

  if (!isOpen) return null

  // ── 标题文案 ──
  const titles: Record<AuthMode, { title: string; subtitle: string }> = {
    signin: { title: '欢迎回来找小象', subtitle: '登录后，卜卜象会记得你的聊天和人物档案' },
    signup: { title: '和小象打个招呼', subtitle: '创建账户后，就能保存你的命理小资料' },
    verify_otp: { title: '拆开验证小信封', subtitle: `验证码已发送到 ${email}` },
    forgot_password: { title: '让小象帮你找回密码', subtitle: '输入注册邮箱，小象会寄出重置链接' },
  }

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
                <label className="block text-sm font-light text-foreground mb-2">邮箱</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-lg bg-card/60 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-300"
                    placeholder="your@email.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-light text-foreground mb-2">密码</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-lg bg-card/60 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-300"
                    placeholder="••••••••"
                    required
                    minLength={6}
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
                {loading ? '小象处理中...' : mode === 'signin' ? '登录找小象' : '加入小象小站'}
              </button>
            </form>

            {/* 底部链接 */}
            <div className="mt-4 flex flex-col items-center gap-2">
              <button
                onClick={mode === 'signin' ? goToSignUp : goToSignIn}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {mode === 'signin' ? '还没有账户？和小象打个招呼' : '已有账户？回到小象这里'}
              </button>
              {mode === 'signin' && (
                <button
                  onClick={goToForgotPassword}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  忘记密码？让小象寄封信
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
              {loading ? '小象核对中...' : '交给小象验证'}
            </button>

            {/* 重发验证码 */}
            <div className="text-center">
              <button
                onClick={handleResend}
                disabled={resendCountdown > 0 || loading}
                className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {resendCountdown > 0
                  ? `小象稍等 ${resendCountdown}s`
                  : '让小象重寄验证码'}
              </button>
            </div>
          </div>
        )}

        {/* ═══ 忘记密码 ═══ */}
        {mode === 'forgot_password' && (
          <>
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-light text-foreground mb-2">邮箱</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-lg bg-card/60 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-300"
                    placeholder="your@email.com"
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
                {loading ? '小象寄信中...' : '让小象寄重置邮件'}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={goToSignIn}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                回到登录
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
