"use client"

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { User, LogOut, MessageSquare, Users, Sun, Moon, KeyRound, Gift, Trash2, Volume2, Share2, Crown, ReceiptText } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useTheme } from 'next-themes'
import { AccountDeletionDialog } from '@/components/account-deletion-dialog'
import { Switch } from '@/components/ui/switch'
import { getMembershipEntryLabel } from '@/lib/membership-plans'

interface UserMenuProps {
  onOpenAuth: () => void
  onOpenSessions?: () => void
  onOpenProfiles?: () => void
  onOpenChangePassword?: () => void
  onOpenRewards?: () => void
  onOpenMembership?: () => void
  ritualFeedbackEnabled?: boolean
  onRitualFeedbackChange?: (enabled: boolean) => void
  appleQuota?: {
    tier?: 'free' | 'plus' | 'ultra'
    remaining: number
    dailyRemaining?: number
    dailyLimit: number
    walletBalance?: number
    unlimited?: boolean
    isPaid: boolean
  } | null
}

export function UserMenu({
  onOpenAuth,
  onOpenSessions,
  onOpenProfiles,
  onOpenChangePassword,
  onOpenRewards,
  onOpenMembership,
  ritualFeedbackEnabled = false,
  onRitualFeedbackChange,
  appleQuota,
}: UserMenuProps) {
  const { user, signOut } = useAuth()
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false)
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // 避免 hydration 不匹配
  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSignOut = async () => {
    await signOut()
    setShowMenu(false)
  }

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  // 主题切换按钮
  const ThemeToggle = () => {
    if (!mounted) {
      return (
        <div className="w-10 h-10 rounded-full bg-card/80 border border-border" />
      )
    }
    
    return (
      <button
        onClick={toggleTheme}
        className="w-10 h-10 rounded-full bg-card/80 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-colors duration-150"
        title={resolvedTheme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
      >
        {resolvedTheme === 'dark' ? (
          <Sun className="w-4 h-4" />
        ) : (
          <Moon className="w-4 h-4" />
        )}
      </button>
    )
  }

  if (!user) {
    return (
      <div className="flex w-max items-center gap-2">
        <ThemeToggle />
        <button
          onClick={onOpenAuth}
          className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-light hover:opacity-90 transition-opacity duration-150"
        >
          登录
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="flex w-max items-center gap-2">
        {onOpenRewards && (
          <button
            onClick={onOpenRewards}
            className="flex h-10 items-center justify-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 text-sm text-primary transition-colors hover:bg-primary/15 sm:px-4"
            title="邀请好友，双方各得 30 个苹果"
          >
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">邀请</span>
          </button>
        )}
        <ThemeToggle />
        <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          aria-label="打开账户菜单"
          aria-expanded={showMenu}
          className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:opacity-90 transition-opacity duration-150"
        >
          <User className="w-4 h-4" />
        </button>

        {showMenu && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setShowMenu(false)}
            />
            <div className="bubu-mode-enter absolute right-0 top-full mt-3 w-64 bg-card backdrop-blur-md border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="p-4 border-b border-border">
                <p className="text-sm font-light text-muted-foreground">登录为</p>
                <p className="text-sm font-medium text-foreground truncate">
                  {user.email}
                </p>
                {appleQuota && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs font-light text-muted-foreground">
                      {appleQuota.unlimited
                        ? '🍎 无限苹果'
                        : `🍎 今日 ${appleQuota.dailyRemaining ?? appleQuota.remaining}/${appleQuota.dailyLimit} · 充值 ${appleQuota.walletBalance || 0}`}
                    </span>
                    {appleQuota.isPaid ? (
                      <span className="bg-accent/20 text-accent rounded-full px-1.5 py-0.5 text-[10px] font-light">{appleQuota.tier === 'ultra' ? 'Ultra' : 'Plus'}</span>
                    ) : (
                      <span className="bg-secondary text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-light">免费</span>
                    )}
                  </div>
                )}
              </div>
              <div className="py-2">
                {onOpenMembership && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false)
                      onOpenMembership()
                    }}
                    aria-label={`${getMembershipEntryLabel(appleQuota?.tier)}，查看会员套餐`}
                    className={`mx-2 mb-2 flex min-h-11 w-[calc(100%_-_1rem)] items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      appleQuota?.tier === 'ultra'
                        ? 'border-border bg-muted/35 text-foreground hover:bg-muted/60'
                        : 'border-primary/20 bg-primary/[0.07] font-medium text-primary hover:border-primary/35 hover:bg-primary/[0.11]'
                    }`}
                  >
                    <Crown className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="flex-1">{getMembershipEntryLabel(appleQuota?.tier)}</span>
                    {appleQuota?.tier && (
                      <span className="text-[10px] font-normal text-muted-foreground">
                        {appleQuota.tier === 'ultra' ? 'Ultra' : appleQuota.tier === 'plus' ? 'Plus' : 'Free'}
                      </span>
                    )}
                  </button>
                )}
                {onRitualFeedbackChange && (
                  <div className="mx-2 mb-2 flex items-center gap-3 rounded-xl bg-muted/35 px-3 py-2.5">
                    <Volume2 className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">仪式音效与轻震</p>
                      <p className="truncate text-[11px] text-muted-foreground">完成时轻轻叮一下</p>
                    </div>
                    <Switch
                      checked={ritualFeedbackEnabled}
                      onCheckedChange={onRitualFeedbackChange}
                      aria-label={ritualFeedbackEnabled ? '关闭仪式音效与轻震' : '开启仪式音效与轻震'}
                    />
                  </div>
                )}
                <Link
                  href="/account/billing"
                  onClick={() => setShowMenu(false)}
                  className="flex min-h-10 w-full items-center gap-2 px-4 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <ReceiptText className="h-4 w-4" aria-hidden="true" />
                  充值与消费记录
                </Link>
                {onOpenProfiles && (
                  <button
                    onClick={() => {
                      onOpenProfiles()
                      setShowMenu(false)
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-2"
                  >
                    <Users className="w-4 h-4" />
                    人物管理
                  </button>
                )}
                
                {onOpenSessions && (
                  <button
                    onClick={() => {
                      onOpenSessions()
                      setShowMenu(false)
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4" />
                    聊天记录
                  </button>
                )}

                {onOpenChangePassword && (
                  <button
                    onClick={() => {
                      onOpenChangePassword()
                      setShowMenu(false)
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-2"
                  >
                    <KeyRound className="w-4 h-4" />
                    修改密码
                  </button>
                )}

                {onOpenRewards && (
                  <button
                    onClick={() => {
                      onOpenRewards()
                      setShowMenu(false)
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-2"
                  >
                    <Gift className="w-4 h-4" />
                    邀请与兑换
                  </button>
                )}

                <button
                  onClick={() => {
                    setShowDeleteAccountDialog(true)
                    setShowMenu(false)
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  注销账户
                </button>

                <button
                  onClick={handleSignOut}
                  className="w-full px-4 py-2 text-left text-sm text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  退出登录
                </button>
              </div>
            </div>
          </>
        )}
        </div>
      </div>
      <AccountDeletionDialog
        isOpen={showDeleteAccountDialog}
        onClose={() => setShowDeleteAccountDialog(false)}
      />
    </>
  )
}
