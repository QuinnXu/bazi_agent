"use client"

import React, { useState } from 'react'
import { AlertTriangle, Trash2, X } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'

interface AccountDeletionDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function AccountDeletionDialog({ isOpen, onClose }: AccountDeletionDialogProps) {
  const { user, deleteAccount } = useAuth()
  const [confirmationEmail, setConfirmationEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  if (!isOpen || !user) return null

  const normalizedEmail = (user.email || '').trim().toLowerCase()
  const canSubmit = confirmationEmail.trim().toLowerCase() === normalizedEmail && !loading

  const handleClose = () => {
    if (loading) return
    setConfirmationEmail('')
    setError(null)
    setSuccessMessage(null)
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMessage(null)

    if (!canSubmit) {
      setError('请输入当前账户邮箱，确认要注销这个账户')
      return
    }

    setLoading(true)
    try {
      const { error: err } = await deleteAccount(confirmationEmail)
      if (err) {
        setError(err.message || '账户暂时没注销成功，请稍后再试')
        return
      }

      setSuccessMessage('账户已注销。小象会带你回到首页。')
      setTimeout(() => {
        window.location.assign('/')
      }, 900)
    } catch {
      setError('账户暂时没注销成功，请稍后再试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card/95 p-6 shadow-xl backdrop-blur-sm glass-minimal">
        <button
          onClick={handleClose}
          disabled={loading}
          aria-label="关闭注销账户窗口"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-muted transition-colors hover:bg-muted/80 disabled:opacity-40"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>

        <div className="mb-6 flex items-start gap-3 pr-8">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </span>
          <div>
            <h2 className="mb-2 text-2xl font-light text-foreground">注销账户</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              注销后将删除你的账户、聊天记录、人物档案、推荐/兑换记录和本地会员额度关联；已产生的必要交易记录可能按法规和审计要求保留。
            </p>
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm leading-6 text-destructive">
          这个操作不可恢复。请先确认已处理课程、会员、续费或订单售后问题。
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-light text-foreground">
              输入当前账户邮箱确认
            </label>
            <input
              type="email"
              value={confirmationEmail}
              onChange={(e) => setConfirmationEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-card/60 px-4 py-3 text-foreground placeholder-muted-foreground transition-all duration-150 focus:border-primary/60 focus:bg-card/80 focus:outline-none"
              placeholder={user.email || 'your@email.com'}
              autoComplete="email"
              disabled={loading || !!successMessage}
              required
            />
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {successMessage && (
            <div className="rounded-lg border border-primary/20 bg-primary/10 p-3">
              <p className="text-sm text-primary">{successMessage}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading || !!successMessage}
              className="flex-1 rounded-lg border border-border bg-card px-4 py-3 text-sm font-light text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              先不注销
            </button>
            <button
              type="submit"
              disabled={!canSubmit || !!successMessage}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-3 text-sm font-light text-destructive-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
              {loading ? '注销中...' : '确认注销'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
