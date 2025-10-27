"use client"

import React, { useState, useEffect } from 'react'
import { X, MessageSquare, Trash2, Plus } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import type { ChatSession } from '@/types/database'

interface ChatSessionsDialogProps {
  isOpen: boolean
  onClose: () => void
  onSelectSession: (sessionId: string) => void
  currentSessionId?: string | null
}

export function ChatSessionsDialog({ 
  isOpen, 
  onClose, 
  onSelectSession,
  currentSessionId 
}: ChatSessionsDialogProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const supabase = createBrowserClient()

  useEffect(() => {
    if (isOpen && user) {
      loadSessions()
    }
  }, [isOpen, user])

  const loadSessions = async () => {
    if (!user) return

    setLoading(true)
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
      setLoading(false)
    }
  }

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    
    if (!confirm('确定要删除这个会话吗？')) return

    try {
      // 删除会话的所有消息
      await supabase
        .from('chat_messages')
        .delete()
        .eq('session_id', sessionId)

      // 删除会话
      await supabase
        .from('chat_sessions')
        .delete()
        .eq('id', sessionId)

      setSessions(sessions.filter(s => s.id !== sessionId))
    } catch (error) {
      console.error('删除会话失败:', error)
    }
  }

  const handleCreateSession = () => {
    onSelectSession('new')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="fixed inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative bg-white/90 backdrop-blur-sm border border-neutral-200/40 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-xl flex flex-col">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-neutral-600" />
        </button>

        <div className="mb-6">
          <h2 className="text-2xl font-light text-neutral-800 mb-2">聊天记录</h2>
          <p className="text-sm text-neutral-600">查看和管理您的聊天会话</p>
        </div>

        <button
          onClick={handleCreateSession}
          className="mb-4 w-full py-3 rounded-lg bg-neutral-800 text-white text-sm font-light hover:bg-neutral-700 transition-all duration-300 flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          新建会话
        </button>

        <div className="flex-1 overflow-y-auto space-y-2">
          {loading ? (
            <div className="text-center py-8 text-neutral-500">加载中...</div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-neutral-500">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
              <p>暂无聊天记录</p>
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => {
                  onSelectSession(session.id)
                  onClose()
                }}
                className={`p-4 rounded-lg border transition-all duration-300 cursor-pointer ${
                  currentSessionId === session.id
                    ? 'bg-neutral-100 border-neutral-300'
                    : 'bg-white/60 border-neutral-200/40 hover:bg-white/80'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-neutral-800 truncate">
                      {session.title || '新对话'}
                    </h3>
                    <p className="text-xs text-neutral-500 mt-1">
                      {new Date(session.updated_at).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
