"use client"

import type React from "react"
import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import { Send, PanelLeftClose, PanelLeft, X } from "lucide-react"
import Image from "next/image"
import { MinimalBackground } from "@/components/minimal-background"
import { ChatMessage } from "@/components/chat-message"
import { BaziDialog } from "@/components/bazi-dialog"
import { SuggestedPromptButton } from "@/components/suggested-prompt-button"
import { DonationDialog } from "@/components/donation-button"
import { AuthDialog } from "@/components/auth-dialog"
import { UserMenu } from "@/components/user-menu"
import { useAuth } from "@/contexts/auth-context"
import { createBrowserClient } from "@/lib/supabase/client"
import { ProfilesManagementDialog } from "@/components/profiles-management-dialog"
import { ProfileSelector } from "@/components/profile-selector"
import { ChangePasswordDialog } from "@/components/change-password-dialog"
import { SidebarProvider, SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { AppSidebar, type FeatureType } from "@/components/app-sidebar"
import { FeatureHePan } from "@/components/feature-hepan"
import { FeatureYaoGua } from "@/components/feature-yaogua"

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

interface BaziData {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  isSolar: boolean;
  isFemale: boolean;
  longitude: string;
  latitude: string;
}

export default function Home() {
  return (
    <SidebarProvider defaultOpen={false}>
      <HomeContent />
    </SidebarProvider>
  )
}

function HomeContent() {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const streamContentRef = useRef('')
  const rafIdRef = useRef<number | null>(null)
  const streamingMessageIdRef = useRef<string | null>(null)
  const { user } = useAuth()
  const supabase = createBrowserClient()
  const { toggleSidebar, open: sidebarOpen } = useSidebar()

  const [showBaziDialog, setShowBaziDialog] = useState(false)
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const [showProfilesDialog, setShowProfilesDialog] = useState(false)
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreamingStarted, setIsStreamingStarted] = useState(false)
  const [baziData, setBaziData] = useState<BaziData | null>(null)
  const [baziAnalysisResult, setBaziAnalysisResult] = useState<string | null>(null)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [thinkingMessage, setThinkingMessage] = useState('')
  const [isUltraMode, setIsUltraMode] = useState(false)
  const [activeFeature, setActiveFeature] = useState<FeatureType>('chat')
  const [showDonationDialog, setShowDonationDialog] = useState(false)

  // Apple quota state
  const [appleQuota, setAppleQuota] = useState<{ remaining: number; dailyLimit: number; isPaid: boolean } | null>(null)
  const [showQuotaExhausted, setShowQuotaExhausted] = useState(false)

  // Fetch apple quota when user changes
  const fetchQuota = useCallback(async () => {
    if (!user) {
      setAppleQuota(null)
      return
    }
    try {
      const res = await fetch('/api/quota')
      if (res.ok) {
        const data = await res.json()
        setAppleQuota({ remaining: data.remaining, dailyLimit: data.dailyLimit, isPaid: data.isPaid })
      }
    } catch (error) {
      console.error('获取配额失败:', error)
    }
  }, [user])

  useEffect(() => {
    fetchQuota()
  }, [fetchQuota])

  // 卜卜象等待词条列表
  const thinkingMessages = useMemo(() => [
    "正在偷吃苹果🍎",
    "正在啃一口幸运零食🍪",
    "正在晃着鼻子想事情🐘",
    "正在抱着水晶球发呆一下😌",
    "正在深呼吸一口好运气✨",
    "正在整理一下小象的思路",
    "正在慢慢理清头绪中～",
    "正在转动水晶球🔮",
    "正在给水晶球加点星尘✨",
    "正在掐着鼻子算一算🐘",
    "正在悄悄翻看命运小本本📜",
    "正在对照天干地支",
    "正在核对命盘里的关键信息",
    "正在把线索一条条连起来",
    "正在找那颗最关键的星星⭐",
    "正在数一数你命里的亮点✨",
    "正在把星星排成一条线🌟",
    "正在追着流年的脚步跑",
    "正在标记重要的时间节点📍",
    "正在看看哪一年星象最亮",
    "正在认真拆解你的人生节奏",
    "正在分清顺势和逆风的阶段",
    "正在多核对一遍，给你更稳的建议",
    "正在想怎样说对你最有帮助",
    "正在帮你把重点先圈出来",
    "正在规划更顺的前进路线🧭",
    "正在找适合你发力的年份💪",
    "正在评估你现在的能量状态",
    "正在帮你避开不必要的弯路",
    "正在想怎么走会更轻松一点",
    "正在检查有没有需要慢一点的地方⚠️",
    "正在看看前方有没有暗礁",
    "正在帮你把可能的坑先标出来",
    "正在判断哪些事不必太着急",
    "正在给你多加一层保护🛡️",
    "快想明白啦，再等我一下～",
    "正在用小象的智慧思考中🧠",
    "正在翻阅古老的命理典籍📚",
    "正在和星星们开个小会议⭐",
    "正在为你调配专属的运势配方🧪",
  ], [])

  // 随机获取等待词条
  const getRandomThinkingMessage = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * thinkingMessages.length)
    return thinkingMessages[randomIndex]
  }, [thinkingMessages])

  // 等待词条自动更换
  useEffect(() => {
    if (isLoading && !isStreamingStarted) {
      setThinkingMessage(getRandomThinkingMessage())
      const interval = setInterval(() => {
        setThinkingMessage(getRandomThinkingMessage())
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [isLoading, isStreamingStarted, getRandomThinkingMessage])

  const scrollToBottom = useCallback((instant = false) => {
    messagesEndRef.current?.scrollIntoView({ behavior: instant ? "instant" : "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom(isStreamingStarted)
  }, [messages, scrollToBottom, isStreamingStarted])

  useEffect(() => {
    console.log('baziAnalysisResult state changed:', baziAnalysisResult ? baziAnalysisResult.substring(0, 50) + '...' : 'null');
  }, [baziAnalysisResult])

  // 确保或创建会话
  const ensureSession = async () => {
    if (!user) return null
    if (currentSessionId && currentSessionId !== 'new') {
      return currentSessionId
    }
    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({ user_id: user.id, title: '新对话' })
        .select()
        .single()
      if (error) throw error
      setCurrentSessionId(data.id)
      return data.id
    } catch (error) {
      console.error('创建会话失败:', error)
      return null
    }
  }

  // 保存消息到数据库
  const saveMessage = async (sessionId: string, role: 'user' | 'assistant', content: string) => {
    if (!user) return
    try {
      await supabase.from('chat_messages').insert({ session_id: sessionId, role, content })
      await supabase.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId)
    } catch (error) {
      console.error('保存消息失败:', error)
    }
  }

  // 加载会话消息
  const loadSession = useCallback(async (sessionId: string) => {
    if (sessionId === 'new') {
      setMessages([])
      setCurrentSessionId(null)
      return
    }
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
      if (error) throw error
      const loadedMessages: Message[] = (data || []).map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: new Date(msg.created_at),
      }))
      setMessages(loadedMessages)
      setCurrentSessionId(sessionId)
    } catch (error) {
      console.error('加载会话失败:', error)
    }
  }, [supabase])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return;

    // 投喂模式前端预检查：苹果不够直接拦截，不发请求不添加消息
    if (isUltraMode && appleQuota && appleQuota.remaining <= 0) {
      setShowQuotaExhausted(true)
      setTimeout(() => setShowQuotaExhausted(false), 8000)
      return
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      createdAt: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setIsStreamingStarted(false);

    let sessionId: string | null = null
    const isNewSession = !currentSessionId
    if (user) {
      sessionId = await ensureSession()
      if (sessionId) {
        await saveMessage(sessionId, 'user', userMessage.content)
        // 新建会话时，用第一条消息作为标题
        if (isNewSession) {
          const titleText = userMessage.content.slice(0, 30) + (userMessage.content.length > 30 ? '...' : '')
          await supabase.from('chat_sessions').update({ title: titleText }).eq('id', sessionId)
        }
      }
    }

    try {
      const requestData: any = {
        messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content }))
      };
      if (baziAnalysisResult) requestData.baziAnalysisResult = baziAnalysisResult;
      requestData.useUltraMode = isUltraMode;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        // Handle quota exceeded
        if (response.status === 403) {
          const errorData = await response.json()
          if (errorData.error === 'quota_exceeded') {
            setShowQuotaExhausted(true)
            setAppleQuota(prev => prev ? { ...prev, remaining: 0 } : null)
            // Auto-dismiss after 8 seconds
            setTimeout(() => setShowQuotaExhausted(false), 8000)
            // Remove the user message we just added since the request failed
            setMessages(prev => prev.filter(m => m.id !== userMessage.id))
            setIsLoading(false)
            setIsStreamingStarted(false)
            return
          }
        }
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      // 投喂模式：立即本地扣减苹果，再异步刷新真实值
      if (isUltraMode) {
        setAppleQuota(prev => prev ? { ...prev, remaining: Math.max(0, prev.remaining - 1), } : null)
        fetchQuota()
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        createdAt: new Date()
      };

      streamingMessageIdRef.current = assistantMessage.id;
      streamContentRef.current = '';
      setMessages(prev => [...prev, assistantMessage]);

      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let fullContent = ''
        let streamingStarted = false

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fullContent += chunk
          streamContentRef.current = fullContent
          if (!streamingStarted && chunk.trim()) {
            streamingStarted = true
            setIsStreamingStarted(true);
          }
          if (!rafIdRef.current) {
            rafIdRef.current = requestAnimationFrame(() => {
              const latestContent = streamContentRef.current
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === assistantMessage.id ? { ...msg, content: latestContent } : msg
                )
              );
              rafIdRef.current = null
            })
          }
        }

        if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null }
        streamingMessageIdRef.current = null;
        setMessages(prev =>
          prev.map(msg =>
            msg.id === assistantMessage.id ? { ...msg, content: fullContent } : msg
          )
        );
        if (user && sessionId && fullContent) {
          await saveMessage(sessionId, 'assistant', fullContent)
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: '抱歉，发生了错误。请稍后再试。',
        createdAt: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setIsStreamingStarted(false);
      streamingMessageIdRef.current = null;
      streamContentRef.current = '';
      if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null }
    }
  }, [input, isLoading, messages, baziAnalysisResult, isUltraMode, isStreamingStarted, user, ensureSession, saveMessage, supabase, fetchQuota, appleQuota])

  const handleBaziSubmit = async (data: BaziData) => {
    try {
      const response = await fetch('/api/bazi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: parseInt(data.year),
          month: parseInt(data.month),
          day: parseInt(data.day),
          hour: parseInt(data.hour),
          isSolar: data.isSolar,
          isFemale: data.isFemale,
          longitude: parseFloat(data.longitude),
          latitude: parseFloat(data.latitude)
        })
      });
      const result = await response.json();
      if (response.ok) {
        console.log('Full response from bazi API:', result);
        setBaziAnalysisResult(result.baziResult);
        setBaziData(data);
        setShowBaziDialog(false);
        const infoMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: '您的八字信息已成功录入！现在您可以询问关于运势、性格、事业、感情等方面的问题，我会结合您的八字进行专业分析。',
          createdAt: new Date()
        };
        setMessages(prev => [...prev, infoMessage]);
      } else {
        alert(`八字信息验证失败：${result.error}`);
      }
    } catch (error) {
      console.error('Error validating Bazi data:', error);
      alert('八字信息验证失败，请检查输入的数据是否正确。');
    }
  }

  const suggestedPrompts = useMemo(() => [
    "今年的事业会迎来转机吗？",
    "近期适合做重大决策吗？",
    "命中注定，我的人生高光时刻在几岁？",
    "开启财运宝库的钥匙在哪？",
    "向未来投一瞥，我会看到什么？",
    "未来的另一半大概是什么样的人？",
  ], [])

  const startWithPrompt = useCallback((prompt: string) => {
    requestAnimationFrame(() => {
      setInput(prompt);
      setTimeout(() => {
        const syntheticEvent = { preventDefault: () => {} } as React.FormEvent;
        handleSubmit(syntheticEvent);
      }, 50);
    });
  }, [handleSubmit]);

  // ---- 渲染主聊天区域 ----
  const renderChatArea = () => (
    <>
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 ? (
            // Welcome Screen
            <div className="text-center space-y-12 py-12">
              <div className="space-y-8">
                <div className="flex justify-center">
                  <div className="relative w-32 h-32 md:w-40 md:h-40">
                    <Image
                      src="/logo.jpg"
                      alt="卜卜象"
                      fill
                      className="object-contain rounded-full"
                      priority
                    />
                  </div>
                </div>
                <h1 className="text-4xl md:text-6xl font-light text-foreground leading-tight">
                  卜卜象陪你卜卜象
                </h1>
                <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed font-light">
                  温柔可爱的命理分析小象，快来和我对话吧
                </p>
              </div>
              <div className="flex flex-col items-center">
                <div className="flex flex-wrap gap-3 justify-center max-w-2xl mx-auto">
                  {suggestedPrompts.map((prompt, i) => (
                    <SuggestedPromptButton
                      key={i}
                      prompt={prompt}
                      onClick={startWithPrompt}
                    />
                  ))}
                </div>
                {/* Login prompt for unauthenticated users */}
                {!user && (
                  <div className="mt-8 bg-secondary/60 backdrop-blur-sm border border-border rounded-2xl px-6 py-4 max-w-md mx-auto text-center">
                    <p className="text-sm text-muted-foreground font-light mb-3">
                      登录后就可以和卜卜象聊天啦~ 还能获得每日 5 个苹果🍎用于投喂模式哦
                    </p>
                    <button
                      onClick={() => setShowAuthDialog(true)}
                      className="px-6 py-2 rounded-full bg-primary text-primary-foreground text-sm font-light hover:opacity-90 transition-all duration-300"
                    >
                      登录 / 注册
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Chat Messages
            <div className="space-y-8 py-4">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isStreaming={message.id === streamingMessageIdRef.current}
                />
              ))}
              {isLoading && !isStreamingStarted && (
                <div className="flex justify-start">
                  <div className="bg-card/70 backdrop-blur-sm border border-border rounded-3xl px-6 py-4 max-w-sm glass-minimal">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"></div>
                        <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                        <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                      </div>
                      <span className="text-sm text-muted-foreground font-light transition-all duration-500">
                        {thinkingMessage}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="p-3 md:p-4 bg-card/30 backdrop-blur-xl border-t border-border">
        <div className="max-w-3xl mx-auto">
          {/* Quota exhausted toast */}
          {showQuotaExhausted && (
            <div className="mb-3 bg-card/70 backdrop-blur-sm border border-primary/30 rounded-2xl px-4 py-3 glass-minimal animate-fade-in relative">
              <button
                onClick={() => setShowQuotaExhausted(false)}
                className="absolute right-2 top-2 w-6 h-6 rounded-full bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors"
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
              <p className="text-sm text-foreground font-light pr-6">
                今天的苹果已经吃完啦🍎 明天卜卜象会带来新的苹果~ 也可以给卜卜象投喂获得更多哦
              </p>
              <button
                onClick={() => { setShowDonationDialog(true); setShowQuotaExhausted(false) }}
                className="mt-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground text-xs font-light hover:opacity-90 transition-all duration-300"
              >
                给卜卜象买苹果🍎
              </button>
            </div>
          )}

          {/* Mobile: toolbar row above input */}
          {user && (
            <div className="flex items-center gap-2 mb-2 md:hidden">
              <ProfileSelector
                selectedProfileId={selectedProfileId}
                onSelectProfile={(profileId, baziResult) => {
                  setSelectedProfileId(profileId)
                  setBaziAnalysisResult(baziResult)
                  if (baziResult) {
                    console.log('已选择人物，八字结果已设置')
                  } else {
                    setBaziData(null)
                  }
                }}
                onOpenProfilesDialog={() => setShowProfilesDialog(true)}
              />
              <button
                type="button"
                onClick={() => setIsUltraMode(!isUltraMode)}
                className={`flex items-center justify-center gap-1.5 h-9 rounded-full border transition-all duration-300 ${
                  isUltraMode
                    ? 'bg-card text-foreground border-primary/60 shadow-sm px-3'
                    : 'bg-transparent text-muted-foreground/50 border-border/50 hover:text-muted-foreground hover:border-border px-3'
                }`}
                title={isUltraMode ? '关闭投喂模式' : '开启投喂模式'}
              >
                <span className={`text-sm font-light transition-all duration-300 ${isUltraMode ? 'text-primary' : ''}`}>投喂</span>
                {appleQuota && (
                  <span className={`text-[11px] font-light transition-all duration-300 ${
                    isUltraMode ? 'text-primary/70' : 'text-muted-foreground/40'
                  }`}>
                    🍎{appleQuota.remaining}/{appleQuota.dailyLimit}
                  </span>
                )}
              </button>
            </div>
          )}

          <form id="chat-form" onSubmit={handleSubmit} className="relative">
            <div className="relative">
              <input
                type="text"
                value={input}
                onChange={handleInputChange}
                placeholder={user ? "输入您想咨询的问题..." : "请先登录..."}
                className="w-full px-4 py-3 pr-12 md:px-6 md:py-4 md:pl-56 md:pr-14 rounded-full bg-card/70 backdrop-blur-sm border border-border text-foreground placeholder-muted-foreground font-light focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-300 text-base"
                disabled={isLoading || !user}
              />
              {/* Desktop: Profile selector and 投喂 button inside input */}
              <div className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 items-center gap-2">
                {user && (
                  <>
                    <ProfileSelector
                      selectedProfileId={selectedProfileId}
                      onSelectProfile={(profileId, baziResult) => {
                        setSelectedProfileId(profileId)
                        setBaziAnalysisResult(baziResult)
                        if (baziResult) {
                          console.log('已选择人物，八字结果已设置')
                        } else {
                          setBaziData(null)
                        }
                      }}
                      onOpenProfilesDialog={() => setShowProfilesDialog(true)}
                    />
                    <button
                      type="button"
                      onClick={() => setIsUltraMode(!isUltraMode)}
                      className={`flex items-center justify-center gap-1.5 h-10 rounded-full border transition-all duration-300 ${
                        isUltraMode
                          ? 'bg-card text-foreground border-primary/60 shadow-sm px-3'
                          : 'bg-transparent text-muted-foreground/50 border-border/50 hover:text-muted-foreground hover:border-border px-3'
                      }`}
                      title={isUltraMode ? '关闭投喂模式' : '开启投喂模式'}
                    >
                      <span className={`text-sm font-light transition-all duration-300 ${isUltraMode ? 'text-primary' : ''}`}>投喂</span>
                      {appleQuota && (
                        <span className={`text-[11px] font-light transition-all duration-300 ${
                          isUltraMode ? 'text-primary/70' : 'text-muted-foreground/40'
                        }`}>
                          🍎{appleQuota.remaining}/{appleQuota.dailyLimit}
                        </span>
                      )}
                    </button>
                  </>
                )}
              </div>
              {/* Right side: Send button */}
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading || !user}
                  className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  )

  // ---- 渲染功能区域 ----
  const renderFeatureContent = () => {
    switch (activeFeature) {
      case 'chat': return renderChatArea()
      case 'hepan': return <FeatureHePan />
      case 'yaogua': return <FeatureYaoGua />
      default: return renderChatArea()
    }
  }

  return (
    <>
      <AppSidebar
        activeFeature={activeFeature}
        onFeatureChange={setActiveFeature}
        currentSessionId={currentSessionId}
        onSelectSession={loadSession}
        onOpenAuth={() => setShowAuthDialog(true)}
        onOpenProfiles={() => setShowProfilesDialog(true)}
        onOpenChangePassword={() => setShowChangePasswordDialog(true)}
        appleQuota={appleQuota}
        onOpenDonation={() => setShowDonationDialog(true)}
      />

      <SidebarInset className="relative overflow-hidden bg-background">
        <MinimalBackground />

        <div className="relative z-10 h-dvh flex flex-col">
          {/* Top bar: Sidebar trigger + UserMenu */}
          <div className="absolute top-3 left-3 z-20">
            <button
              onClick={toggleSidebar}
              className="w-10 h-10 rounded-xl bg-card/80 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-all duration-300"
              title={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
            >
              {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            </button>
          </div>
          <div className="absolute top-3 right-3 z-20">
            <UserMenu
              onOpenAuth={() => setShowAuthDialog(true)}
              onOpenProfiles={() => setShowProfilesDialog(true)}
              onOpenChangePassword={() => setShowChangePasswordDialog(true)}
              appleQuota={appleQuota}
            />
          </div>

          {/* Main content area */}
          {renderFeatureContent()}
        </div>

        {/* Dialogs */}
        <BaziDialog
          isOpen={showBaziDialog}
          onClose={() => setShowBaziDialog(false)}
          onSubmit={handleBaziSubmit}
        />
        <AuthDialog
          isOpen={showAuthDialog}
          onClose={() => setShowAuthDialog(false)}
        />
        <ProfilesManagementDialog
          isOpen={showProfilesDialog}
          onClose={() => setShowProfilesDialog(false)}
        />
        <ChangePasswordDialog
          isOpen={showChangePasswordDialog}
          onClose={() => setShowChangePasswordDialog(false)}
        />
        {/* Donation floating button */}
        <button
          onClick={() => setShowDonationDialog(true)}
          className="fixed bottom-20 right-4 w-12 h-12 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 flex items-center justify-center group z-30"
          title="给卜卜象买苹果"
        >
          <span className="text-lg group-hover:animate-pulse">🍎</span>
        </button>
        <DonationDialog
          isOpen={showDonationDialog}
          onClose={() => setShowDonationDialog(false)}
          appleQuota={appleQuota}
        />
      </SidebarInset>
    </>
  )
}
