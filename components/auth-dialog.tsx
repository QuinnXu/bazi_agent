"use client"

import React, { useState } from 'react'
import { X, Mail, Lock, User } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'

interface AuthDialogProps {
  isOpen: boolean
  onClose: () => void
  mode?: 'signin' | 'signup'
}

export function AuthDialog({ isOpen, onClose, mode: initialMode = 'signin' }: AuthDialogProps) {  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { signIn, signUp } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password)
        if (error) {
          setError(error.message || '登录失败，请检查邮箱和密码')
        } else {
          onClose()
        }
      } else {
        const { error } = await signUp(email, password)
        if (error) {
          setError(error.message || '注册失败，请稍后重试')
        } else {
          setError(null)
          alert('注册成功！请查收邮箱验证邮件。')
          setMode('signin')
        }
      }
    } catch (err) {
      setError('操作失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const toggleMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin')
    setError(null)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div 
        className="fixed inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* 弹窗内容 */}
      <div className="relative bg-white/90 backdrop-blur-sm border border-neutral-200/40 rounded-2xl p-6 max-w-md w-full shadow-xl">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-neutral-600" />
        </button>

        {/* 标题 */}
        <div className="mb-6">
          <h2 className="text-2xl font-light text-neutral-800 mb-2">
            {mode === 'signin' ? '登录' : '注册'}
          </h2>
          <p className="text-sm text-neutral-600">
            {mode === 'signin' ? '欢迎回来' : '创建您的账户'}
          </p>
        </div>        {/* 表单 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-light text-neutral-700 mb-2">
              邮箱
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg bg-white/60 border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300"
                placeholder="your@email.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-light text-neutral-700 mb-2">
              密码
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg bg-white/60 border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-neutral-800 text-white font-light hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300"
          >
            {loading ? '处理中...' : mode === 'signin' ? '登录' : '注册'}
          </button>
        </form>

        {/* 切换模式 */}
        <div className="mt-4 text-center">
          <button
            onClick={toggleMode}
            className="text-sm text-neutral-600 hover:text-neutral-800 transition-colors"
          >
            {mode === 'signin' ? '还没有账户？立即注册' : '已有账户？立即登录'}
          </button>
        </div>
      </div>
    </div>
  )
}
