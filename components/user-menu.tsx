"use client"

import React, { useState } from 'react'
import { User, LogOut, MessageSquare, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'

interface UserMenuProps {
  onOpenAuth: () => void
  onOpenSessions?: () => void
  onOpenProfiles?: () => void
}

export function UserMenu({ onOpenAuth, onOpenSessions, onOpenProfiles }: UserMenuProps) {
  const { user, signOut } = useAuth()
  const [showMenu, setShowMenu] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    setShowMenu(false)
  }

  if (!user) {
    return (
      <button
        onClick={onOpenAuth}
        className="px-4 py-2 rounded-full bg-neutral-800 text-white text-sm font-light hover:bg-neutral-700 transition-all duration-300"
      >
        登录
      </button>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-white hover:bg-neutral-700 transition-all duration-300"
      >
        <User className="w-4 h-4" />
      </button>

      {showMenu && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-0 mt-2 w-64 bg-white/90 backdrop-blur-sm border border-neutral-200/40 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="p-4 border-b border-neutral-200/40">
              <p className="text-sm font-light text-neutral-600">登录为</p>
              <p className="text-sm font-medium text-neutral-800 truncate">
                {user.email}
              </p>
            </div>            <div className="py-2">              {onOpenProfiles && (
                <button
                  onClick={() => {
                    onOpenProfiles()
                    setShowMenu(false)
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 transition-colors flex items-center gap-2"
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
                  className="w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 transition-colors flex items-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  聊天记录
                </button>
              )}
              
              <button
                onClick={handleSignOut}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                退出登录
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
