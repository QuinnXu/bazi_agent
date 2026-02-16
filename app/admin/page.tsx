"use client"

import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { isAdmin } from '@/lib/admin'
import { AuthDialog } from '@/components/auth-dialog'
import { RefreshCw, Save, Check, AlertCircle } from 'lucide-react'

interface UserQuotaRow {
  user_id: string
  email: string
  display_name: string | null
  is_paid: boolean
  daily_apple_limit: number
  apples_used_today: number
  last_reset_date: string | null
  has_quota_record: boolean
}

// Track which rows have unsaved edits
interface RowEdits {
  is_paid?: boolean
  daily_apple_limit?: number
}

export default function AdminPage() {
  const { user } = useAuth()
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const [users, setUsers] = useState<UserQuotaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [edits, setEdits] = useState<Record<string, RowEdits>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saveSuccess, setSaveSuccess] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/quotas')
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || '获取数据失败')
        return
      }
      const data = await res.json()
      setUsers(data.users || [])
      setEdits({})
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user && isAdmin(user.email)) {
      fetchUsers()
    }
  }, [user, fetchUsers])

  const handleTogglePaid = (userId: string, currentValue: boolean) => {
    const newIsPaid = !currentValue
    setEdits(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        is_paid: newIsPaid,
        // Auto-set limit when toggling paid status
        daily_apple_limit: newIsPaid ? 999 : 5,
      }
    }))
  }

  const handleLimitChange = (userId: string, value: string) => {
    const num = parseInt(value)
    if (isNaN(num) || num < 0) return
    setEdits(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        daily_apple_limit: num,
      }
    }))
  }

  const handleSave = async (userId: string) => {
    const rowEdits = edits[userId]
    if (!rowEdits) return

    setSaving(prev => ({ ...prev, [userId]: true }))
    setSaveSuccess(prev => ({ ...prev, [userId]: false }))

    try {
      const res = await fetch('/api/admin/quotas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, ...rowEdits }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert('保存失败: ' + (data.error || '未知错误'))
        return
      }

      // Update local state
      setUsers(prev => prev.map(u => {
        if (u.user_id === userId) {
          return {
            ...u,
            is_paid: rowEdits.is_paid ?? u.is_paid,
            daily_apple_limit: rowEdits.daily_apple_limit ?? u.daily_apple_limit,
            has_quota_record: true,
          }
        }
        return u
      }))

      // Clear edits for this row
      setEdits(prev => {
        const next = { ...prev }
        delete next[userId]
        return next
      })

      // Show success indicator
      setSaveSuccess(prev => ({ ...prev, [userId]: true }))
      setTimeout(() => {
        setSaveSuccess(prev => ({ ...prev, [userId]: false }))
      }, 2000)
    } catch {
      alert('网络错误')
    } finally {
      setSaving(prev => ({ ...prev, [userId]: false }))
    }
  }

  // Get the display value (edited or original)
  const getDisplayValue = (user: UserQuotaRow, field: keyof RowEdits) => {
    const rowEdits = edits[user.user_id]
    if (rowEdits && field in rowEdits) {
      return rowEdits[field]
    }
    return user[field]
  }

  // --- Render states ---

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground/40" />
        <p className="text-lg font-light text-muted-foreground">请先登录管理员账号</p>
        <button
          onClick={() => setShowAuthDialog(true)}
          className="px-6 py-2 rounded-full bg-primary text-primary-foreground text-sm font-light hover:opacity-90 transition-all duration-300"
        >
          登录
        </button>
        <AuthDialog isOpen={showAuthDialog} onClose={() => setShowAuthDialog(false)} />
      </div>
    )
  }

  if (!isAdmin(user.email)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <AlertCircle className="w-12 h-12 text-destructive/40" />
        <p className="text-lg font-light text-foreground">无权限访问</p>
        <p className="text-sm font-light text-muted-foreground">
          当前账号 {user.email} 不是管理员
        </p>
        <a
          href="/"
          className="px-6 py-2 rounded-full bg-secondary text-secondary-foreground text-sm font-light hover:bg-secondary/80 transition-all duration-300"
        >
          返回主站
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Title bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-light text-foreground">配额管理</h2>
          <p className="text-sm font-light text-muted-foreground mt-1">
            管理用户的苹果配额和付费状态
          </p>
        </div>
        <button
          onClick={fetchUsers}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card border border-border text-sm font-light text-foreground hover:bg-muted transition-all duration-300 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 text-sm text-destructive font-light">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl overflow-hidden glass-minimal">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">邮箱</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">昵称</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">付费</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">每日额度</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">今日已用</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">重置日期</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground font-light">
                    加载中...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground font-light">
                    暂无用户数据
                  </td>
                </tr>
              ) : (
                users.map(u => {
                  const hasEdits = !!edits[u.user_id]
                  const displayPaid = getDisplayValue(u, 'is_paid') as boolean
                  const displayLimit = getDisplayValue(u, 'daily_apple_limit') as number

                  return (
                    <tr key={u.user_id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      {/* Email */}
                      <td className="px-4 py-3">
                        <span className="text-sm font-light text-foreground">{u.email}</span>
                        {!u.has_quota_record && (
                          <span className="ml-2 text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">无记录</span>
                        )}
                      </td>

                      {/* Display name */}
                      <td className="px-4 py-3">
                        <span className="text-sm font-light text-muted-foreground">{u.display_name || '-'}</span>
                      </td>

                      {/* Is Paid toggle */}
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleTogglePaid(u.user_id, displayPaid)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-light transition-all duration-300 ${
                            displayPaid
                              ? 'bg-accent/20 text-accent border border-accent/30'
                              : 'bg-muted text-muted-foreground border border-border'
                          }`}
                        >
                          {displayPaid ? 'VIP' : '免费'}
                        </button>
                      </td>

                      {/* Daily limit (editable) */}
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number"
                          min={0}
                          value={displayLimit}
                          onChange={(e) => handleLimitChange(u.user_id, e.target.value)}
                          className="w-20 text-center text-sm font-light bg-transparent border border-border/50 rounded-lg px-2 py-1 text-foreground focus:outline-none focus:border-primary/60 transition-all"
                        />
                      </td>

                      {/* Used today (readonly) */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-light text-muted-foreground">{u.apples_used_today}</span>
                      </td>

                      {/* Last reset date (readonly) */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-light text-muted-foreground">{u.last_reset_date || '-'}</span>
                      </td>

                      {/* Save button */}
                      <td className="px-4 py-3 text-center">
                        {saveSuccess[u.user_id] ? (
                          <span className="inline-flex items-center gap-1 text-xs text-accent font-light">
                            <Check className="w-3.5 h-3.5" />
                            已保存
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSave(u.user_id)}
                            disabled={!hasEdits || saving[u.user_id]}
                            className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-light transition-all duration-300 ${
                              hasEdits
                                ? 'bg-primary text-primary-foreground hover:opacity-90'
                                : 'bg-muted text-muted-foreground/40 cursor-not-allowed'
                            }`}
                          >
                            <Save className="w-3 h-3" />
                            {saving[u.user_id] ? '保存中...' : '保存'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer info */}
      <p className="text-xs font-light text-muted-foreground/50 text-center">
        共 {users.length} 个用户 · 切换付费状态会自动设置额度（VIP: 999, 免费: 5），也可手动修改
      </p>
    </div>
  )
}
