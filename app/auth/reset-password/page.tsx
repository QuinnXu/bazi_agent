"use client"

import React, { Suspense, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lock, AlertCircle, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { MinimalBackground } from '@/components/minimal-background'

function authErrorMessage(err: { message?: string } | null): string {
  if (!err?.message) return '哎呀，网络好像打了个小盹，稍后再试一次喔 🐘'
  const msg = err.message.toLowerCase()
  if (msg.includes('same password') || msg.includes('should be different'))
    return '新密码不能和旧密码完全一样喔，给小象换个新的吧 🐾'
  if (msg.includes('weak') || msg.includes('password should be'))
    return '密码再壮一些会更安心，至少 6 位喔 🛡️'
  if (msg.includes('session') || msg.includes('jwt') || msg.includes('expired'))
    return '链接已经在风中走散啦，请回到登录页重新发起忘记密码 🌬️'
  return err.message
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh flex items-center justify-center p-4">
      <MinimalBackground />
      <div className="relative z-10 w-full max-w-md">
        <div className="bg-card/95 backdrop-blur-sm border border-border rounded-2xl p-6 shadow-xl glass-minimal">
          {children}
        </div>
      </div>
    </div>
  )
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6 flex items-start gap-3">
      <span className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl border border-primary/20 bg-card shadow-sm">
        <Image src="/avatar.png" alt="卜卜象" width={44} height={44} className="h-full w-full object-contain" />
      </span>
      <div className="min-w-0">
        <h1 className="text-2xl font-light text-foreground mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  )
}

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading, updatePassword } = useAuth()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const linkInvalid = useMemo(() => {
    return searchParams.get('error') === 'invalid_link'
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMessage(null)

    if (newPassword.length < 6) {
      setError('新密码至少要 6 位喔')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致，再核对一下吧')
      return
    }

    setSubmitting(true)
    try {
      const { error: err } = await updatePassword(newPassword)
      if (err) {
        setError(authErrorMessage(err))
      } else {
        setDone(true)
        setSuccessMessage('小象帮你换好新密码啦，正在带你回家…')
        setTimeout(() => router.replace('/'), 1500)
      }
    } catch {
      setError('哎呀，网络好像打了个小盹，稍后再试一次喔 🐘')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── 1. 链接已失效（callback 显式标记） ───
  if (linkInvalid) {
    return (
      <Shell>
        <Header
          title="链接已经走散啦"
          subtitle="重置密码的链接可能已过期或被使用过，请回到登录页重新发起忘记密码"
        />
        <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 mb-4">
          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm font-light text-destructive">
            邮件链接通常只能使用一次，且会在 1 小时左右过期。重新发送一封即可。
          </p>
        </div>
        <Link
          href="/"
          className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-primary-foreground font-light hover:opacity-90 transition-all duration-300"
        >
          <ArrowLeft className="w-4 h-4" />
          回到登录页
        </Link>
      </Shell>
    )
  }

  // ─── 2. 等待 supabase session 初始化 ───
  if (authLoading) {
    return (
      <Shell>
        <Header title="正在让小象认出你…" subtitle="校验重置密码的安全令牌中" />
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      </Shell>
    )
  }

  // ─── 3. 没有有效 session ───
  if (!user) {
    return (
      <Shell>
        <Header
          title="小象暂时认不出你"
          subtitle="请确认你是从邮件里的链接进入本页面"
        />
        <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 mb-4">
          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm font-light text-destructive">
            没有检测到有效的重置会话，可能是链接已过期或在另一个浏览器里被打开过。
          </p>
        </div>
        <Link
          href="/"
          className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-primary-foreground font-light hover:opacity-90 transition-all duration-300"
        >
          <ArrowLeft className="w-4 h-4" />
          回到登录页
        </Link>
      </Shell>
    )
  }

  // ─── 4. 正常重置表单 ───
  return (
    <Shell>
      <Header
        title="设置一个新密码"
        subtitle={`将为 ${user.email ?? '当前账号'} 更新登录密码`}
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-light text-foreground mb-2">新密码</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-lg bg-card/60 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-300"
              placeholder="至少 6 位"
              required
              minLength={6}
              autoFocus
              disabled={submitting || done}
              autoComplete="new-password"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-light text-foreground mb-2">确认新密码</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-lg bg-card/60 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-300"
              placeholder="再输一次"
              required
              minLength={6}
              disabled={submitting || done}
              autoComplete="new-password"
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
          disabled={submitting || done}
          className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-light hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300"
        >
          {done ? '小象正在带你回家…' : submitting ? '小象保存中…' : '保存新密码'}
        </button>
      </form>

      <div className="mt-4 text-center">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          返回首页
        </Link>
      </div>
    </Shell>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <Header title="正在让小象认出你…" subtitle="校验重置密码的安全令牌中" />
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        </Shell>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
