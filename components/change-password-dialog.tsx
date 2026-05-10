"use client"

import React, { useState } from 'react'
import { X, Lock } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'

interface ChangePasswordDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function ChangePasswordDialog({ isOpen, onClose }: ChangePasswordDialogProps) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const { updatePassword } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMessage(null)

    if (newPassword.length < 6) {
      setError('小象需要至少 6 位新密码喔')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('两次密码没有对齐，小象再帮你核一下')
      return
    }

    setLoading(true)
    try {
      const { error: err } = await updatePassword(newPassword)
      if (err) {
        setError(err.message || '小象暂时改不了密码，稍后再试一次喔')
      } else {
        setSuccessMessage('密码改好啦，小象已经记住新钥匙')
        setNewPassword('')
        setConfirmPassword('')
        // 2 秒后自动关闭
        setTimeout(() => onClose(), 2000)
      }
    } catch {
      setError('小象暂时没处理成功，稍后再试一次喔')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-card/95 backdrop-blur-sm border border-border rounded-2xl p-6 max-w-md w-full shadow-xl glass-minimal">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 w-8 h-8 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* 标题 */}
        <div className="mb-6">
          <h2 className="text-2xl font-light text-foreground mb-2">给小象换一把新钥匙</h2>
          <p className="text-sm text-muted-foreground">输入新密码，小象会帮你锁好账户</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-light text-foreground mb-2">
              新密码
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg bg-card/60 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-300"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-light text-foreground mb-2">
              确认新密码
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
            {loading ? '小象处理中...' : '交给小象修改'}
          </button>
        </form>
      </div>
    </div>
  )
}
