"use client"

import React, { useState, useEffect } from 'react'
import { User, LogOut, MessageSquare, Users, Sun, Moon } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useTheme } from 'next-themes'

interface UserMenuProps {
  onOpenAuth: () => void
  onOpenSessions?: () => void
  onOpenProfiles?: () => void
}

export function UserMenu({ onOpenAuth, onOpenSessions, onOpenProfiles }: UserMenuProps) {
  const { user, signOut } = useAuth()
  const [showMenu, setShowMenu] = useState(false)
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
        className="w-10 h-10 rounded-full bg-card/80 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-all duration-300"
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
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <button
          onClick={onOpenAuth}
          className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-light hover:opacity-90 transition-all duration-300"
        >
          登录
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <ThemeToggle />
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:opacity-90 transition-all duration-300"
        >
          <User className="w-4 h-4" />
        </button>

        {showMenu && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setShowMenu(false)}
            />
            <div className="absolute right-0 top-full mt-3 w-64 bg-card backdrop-blur-md border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="p-4 border-b border-border">
                <p className="text-sm font-light text-muted-foreground">登录为</p>
                <p className="text-sm font-medium text-foreground truncate">
                  {user.email}
                </p>
              </div>
              <div className="py-2">
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
  )
}
