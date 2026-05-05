"use client"

import React, { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import {
  MessageSquare,
  Users,
  CalendarRange,
  ImageIcon,
  Compass,
  Plus,
  Trash2,
  LogOut,
  KeyRound,
  User,
  UserCircle,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { createBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import type { ChatSession } from '@/types/database_v2'

export type FeatureType = 'chat' | 'hepan' | 'fortune' | 'avatar' | 'lifepath'

interface AppSidebarProps {
  activeFeature: FeatureType
  onFeatureChange: (feature: FeatureType) => void
  currentSessionId: string | null
  onSelectSession: (sessionId: string) => void
  onOpenAuth: () => void
  onOpenProfiles: () => void
  onOpenChangePassword: () => void
  appleQuota?: { remaining: number; dailyLimit: number; isPaid: boolean } | null
  onOpenDonation?: () => void
}

const featureItems: { id: FeatureType; label: string; icon: React.ElementType }[] = [
  { id: 'chat', label: '八字问答', icon: MessageSquare },
  { id: 'hepan', label: '合盘 / 应事', icon: Users },
  { id: 'fortune', label: '近期运势', icon: CalendarRange },
  { id: 'avatar', label: '头像分析推荐', icon: ImageIcon },
  { id: 'lifepath', label: '人生脉络', icon: Compass },
]

function groupSessionsByDate(sessions: ChatSession[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const last7Days = new Date(today.getTime() - 7 * 86400000)

  const groups: { label: string; sessions: ChatSession[] }[] = [
    { label: '今天', sessions: [] },
    { label: '昨天', sessions: [] },
    { label: '过去 7 天', sessions: [] },
    { label: '更早', sessions: [] },
  ]

  sessions.forEach(s => {
    const d = new Date(s.updated_at)
    if (d >= today) groups[0].sessions.push(s)
    else if (d >= yesterday) groups[1].sessions.push(s)
    else if (d >= last7Days) groups[2].sessions.push(s)
    else groups[3].sessions.push(s)
  })

  return groups.filter(g => g.sessions.length > 0)
}

export function AppSidebar({
  activeFeature,
  onFeatureChange,
  currentSessionId,
  onSelectSession,
  onOpenAuth,
  onOpenProfiles,
  onOpenChangePassword,
  appleQuota,
  onOpenDonation,
}: AppSidebarProps) {
  const { user, signOut } = useAuth()
  const supabase = createBrowserClient()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  // 加载会话列表
  useEffect(() => {
    if (user) loadSessions()
  }, [user])

  const loadSessions = async () => {
    if (!user) return
    setLoadingSessions(true)
    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
      if (error) throw error
      setSessions(data || [])
    } catch (error) {
      console.error('加载会话失败:', error)
    } finally {
      setLoadingSessions(false)
    }
  }

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('确定要删除这个会话吗？')) return
    try {
      await supabase.from('chat_messages').delete().eq('session_id', sessionId)
      await supabase.from('chat_sessions').delete().eq('id', sessionId)
      setSessions(prev => prev.filter(s => s.id !== sessionId))
    } catch (error) {
      console.error('删除会话失败:', error)
    }
  }

  const handleNewChat = () => {
    onSelectSession('new')
    onFeatureChange('chat')
  }

  const groupedSessions = useMemo(() => groupSessionsByDate(sessions), [sessions])

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-sidebar-border">
      {/* ---- Header: Logo ---- */}
      <SidebarHeader className="p-4 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 shrink-0">
            <Image
              src="/logo.jpg"
              alt="卜卜象"
              fill
              className="object-contain rounded-full"
            />
          </div>
          <span className="text-base font-medium text-sidebar-foreground truncate">卜卜象</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {/* ---- 功能导航（暂时隐藏，功能待定） ---- */}
        {/* <SidebarGroup className="py-2">
          <SidebarGroupLabel className="text-[11px] text-muted-foreground/70 px-2 mb-1">功能</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {featureItems.map(item => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={activeFeature === item.id}
                    onClick={() => onFeatureChange(item.id)}
                    tooltip={item.label}
                    className="gap-2.5"
                  >
                    <item.icon className="w-4 h-4" />
                    <span className="text-sm">{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator /> */}

        {/* ---- 新建对话 + 聊天记录 ---- */}
        <SidebarGroup className="py-2 flex-1 min-h-0">
          <div className="flex items-center justify-between px-2 mb-1">
            <SidebarGroupLabel className="text-[11px] text-muted-foreground/70 p-0 m-0">聊天记录</SidebarGroupLabel>
            <button
              onClick={handleNewChat}
              className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
              title="新建对话"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <SidebarGroupContent className="overflow-y-auto">
            {!user ? (
              <p className="px-3 py-6 text-xs text-muted-foreground text-center">登录后查看聊天记录</p>
            ) : loadingSessions ? (
              <p className="px-3 py-6 text-xs text-muted-foreground text-center">加载中...</p>
            ) : sessions.length === 0 ? (
              <p className="px-3 py-6 text-xs text-muted-foreground text-center">暂无聊天记录</p>
            ) : (
              <div className="space-y-3">
                {groupedSessions.map(group => (
                  <div key={group.label}>
                    <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">{group.label}</p>
                    <SidebarMenu>
                      {group.sessions.map(session => (
                        <SidebarMenuItem key={session.id}>
                          <SidebarMenuButton
                            isActive={currentSessionId === session.id}
                            onClick={() => {
                              onSelectSession(session.id)
                              onFeatureChange('chat')
                            }}
                          >
                            <span className="truncate text-sm flex-1">{session.title || '新对话'}</span>
                          </SidebarMenuButton>
                          <SidebarMenuAction
                            showOnHover
                            onClick={(e) => handleDeleteSession(session.id, e)}
                            title="删除"
                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-3 h-3" />
                          </SidebarMenuAction>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </div>
                ))}
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ---- Footer: 用户区域 ---- */}
      <SidebarFooter className="p-2 border-t border-sidebar-border">
        {/* Apple quota display */}
        {user && appleQuota && (
          <button
            onClick={onOpenDonation}
            className="w-full bg-secondary/40 rounded-xl px-3 py-2 mb-2 flex items-center justify-between hover:bg-secondary/60 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">🍎</span>
              <span className="text-xs font-light text-sidebar-foreground">
                今日苹果 {appleQuota.remaining}/{appleQuota.dailyLimit}
              </span>
            </div>
            {appleQuota.isPaid && (
              <span className="bg-accent/20 text-accent rounded-full px-2 py-0.5 text-[10px] font-light">
                VIP
              </span>
            )}
          </button>
        )}
        {!user ? (
          <button
            onClick={onOpenAuth}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-light hover:opacity-90 transition-all"
          >
            登录 / 注册
          </button>
        ) : (
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-sidebar-accent transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground shrink-0">
                <User className="w-4 h-4" />
              </div>
              <span className="text-sm text-sidebar-foreground truncate flex-1 text-left">{user.email}</span>
            </button>

            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <div className="absolute left-1 bottom-full mb-2 w-56 bg-card backdrop-blur-md border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="py-1.5">
                    <button
                      onClick={() => { onOpenProfiles(); setShowUserMenu(false) }}
                      className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-2"
                    >
                      <UserCircle className="w-4 h-4" />
                      人物管理
                    </button>
                    <button
                      onClick={() => { onOpenChangePassword(); setShowUserMenu(false) }}
                      className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-2"
                    >
                      <KeyRound className="w-4 h-4" />
                      修改密码
                    </button>
                    <SidebarSeparator className="my-1" />
                    <button
                      onClick={async () => { await signOut(); setShowUserMenu(false) }}
                      className="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      退出登录
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  )
}
