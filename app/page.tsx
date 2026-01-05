"use client"

import type React from "react"
import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import { Send, Calendar } from "lucide-react"
import Image from "next/image"
import { MinimalBackground } from "@/components/minimal-background"
import { ChatMessage } from "@/components/chat-message"
import { BaziDialog } from "@/components/bazi-dialog"
import { SuggestedPromptButton } from "@/components/suggested-prompt-button"
import { DonationButton } from "@/components/donation-button"
import { UserMenu } from "@/components/user-menu"
import { AuthDialog } from "@/components/auth-dialog"
import { ChatSessionsDialog } from "@/components/chat-sessions-dialog"
import { useAuth } from "@/contexts/auth-context"
import { createBrowserClient } from "@/lib/supabase/client"
import { ProfilesManagementDialog } from "@/components/profiles-management-dialog"
import { ProfileSelector } from "@/components/profile-selector"

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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { user } = useAuth()
  const supabase = createBrowserClient()
    const [showBaziDialog, setShowBaziDialog] = useState(false)
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const [showSessionsDialog, setShowSessionsDialog] = useState(false)
  const [showProfilesDialog, setShowProfilesDialog] = useState(false)
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
      // 初始设置一个词条
      setThinkingMessage(getRandomThinkingMessage())
      
      // 每3秒更换一次词条
      const interval = setInterval(() => {
        setThinkingMessage(getRandomThinkingMessage())
      }, 3000)
      
      return () => clearInterval(interval)
    }
  }, [isLoading, isStreamingStarted, getRandomThinkingMessage])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])  // Debug effect to track baziAnalysisResult changes
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
        .insert({
          user_id: user.id,
          title: '新对话',
        })
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
      await supabase
        .from('chat_messages')
        .insert({
          session_id: sessionId,
          role,
          content,
        })

      // 更新会话的 updated_at
      await supabase
        .from('chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sessionId)
    } catch (error) {
      console.error('保存消息失败:', error)
    }
  }

  // 加载会话消息
  const loadSession = async (sessionId: string) => {
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
  }

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  }, [])
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!input.trim() || isLoading) {
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      createdAt: new Date()
    };

    // Use functional updates to avoid stale closure issues
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setIsStreamingStarted(false);

    // 如果用户已登录，确保有会话并保存用户消息
    let sessionId: string | null = null
    if (user) {
      sessionId = await ensureSession()
      if (sessionId) {
        await saveMessage(sessionId, 'user', userMessage.content)
      }
    }

    try {
      // Prepare request data with potential Bazi context
      const requestData: any = {
        messages: [...messages, userMessage].map(m => ({
          role: m.role,
          content: m.content
        }))
      };
      
      // Include Bazi analysis result if available
      if (baziAnalysisResult) {
        requestData.baziAnalysisResult = baziAnalysisResult;
      }
      
      // Include ULTRA mode flag
      requestData.useUltraMode = isUltraMode;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        createdAt: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Handle streaming response
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let fullContent = ''
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          fullContent += chunk
          
          // 标记流式响应已开始
          if (!isStreamingStarted && chunk.trim()) {
            setIsStreamingStarted(true);
          }
          
          // Update the assistant message with the new content
          setMessages(prev => 
            prev.map(msg => 
              msg.id === assistantMessage.id 
                ? { ...msg, content: msg.content + chunk }
                : msg
            )
          );
        }

        // 保存助手回复到数据库
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
    } finally {      setIsLoading(false);
      setIsStreamingStarted(false);
    }
  }, [input, isLoading, messages, baziAnalysisResult, isUltraMode, isStreamingStarted, user, ensureSession, saveMessage, supabase])
  const handleBaziSubmit = async (data: BaziData) => {
    try {
      // Get Bazi analysis result
      const response = await fetch('/api/bazi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
        // Store the complete Bazi analysis result and data
        console.log('Full response from bazi API:', result);
        setBaziAnalysisResult(result.baziResult);
        setBaziData(data);
        console.log('Bazi analysis result stored:', result.baziResult);
        console.log('Bazi analysis result stored (length):', result.baziResult?.length);
          // 注意：八字信息的保存已移到人物管理对话框中处理
        // 这里只是临时设置，用于立即测试八字功能
        
        setShowBaziDialog(false);
        
        // Add informational message to chat
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
    "我今年事业运如何？",
    "我的感情如何？", 
    "帮我大致分析一下我的人生格局",
    "我的何时才能爆富？",
    "我的未来会怎么样？",
    "我正缘什么时候？",
  ], [])

  const startWithPrompt = useCallback((prompt: string) => {
    // 避免在主线程中执行耗时操作
    requestAnimationFrame(() => {
      setInput(prompt);
      // 使用更短的延迟来提高响应性
      setTimeout(() => {
        const syntheticEvent = {
          preventDefault: () => {},
        } as React.FormEvent;
        handleSubmit(syntheticEvent);
      }, 50);
    });
  }, [handleSubmit]);
  return (
    <div className="min-h-screen relative overflow-hidden bg-background">
      <MinimalBackground />

      <div className="relative z-10 min-h-screen flex flex-col">        {/* Top Bar with User Menu only */}
        <div className="absolute top-4 right-4 z-20">
          <UserMenu 
            onOpenAuth={() => setShowAuthDialog(true)}
            onOpenSessions={() => setShowSessionsDialog(true)}
            onOpenProfiles={() => setShowProfilesDialog(true)}
          />
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="max-w-3xl mx-auto">
            {messages.length === 0 ? (
              // Welcome Screen
              <div className="text-center space-y-12 py-12">
                <div className="space-y-8">
                  {/* Logo */}
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
                  {/* Minimal Suggested Prompts */}
                  <div className="flex flex-wrap gap-3 justify-center max-w-2xl mx-auto">
                    {suggestedPrompts.map((prompt, i) => (
                      <SuggestedPromptButton 
                        key={i} 
                        prompt={prompt} 
                        onClick={startWithPrompt}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              // Chat Messages
              <div className="space-y-8 py-4">
                {messages.map((message) => (
                  <ChatMessage key={message.id} message={message} />
                ))}
                {isLoading && !isStreamingStarted && (
                  <div className="flex justify-start">
                    <div className="bg-card/70 backdrop-blur-sm border border-border rounded-3xl px-6 py-4 max-w-sm glass-minimal">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                          <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"></div>
                          <div
                            className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
                            style={{ animationDelay: "0.1s" }}
                          ></div>
                          <div
                            className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
                            style={{ animationDelay: "0.2s" }}
                          ></div>
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
        </div>        {/* Input Area */}
        <div className="p-4 bg-card/30 backdrop-blur-xl border-t border-border">
          <div className="max-w-3xl mx-auto">
            <form id="chat-form" onSubmit={handleSubmit} className="relative">
              <div className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={handleInputChange}
                  placeholder={user ? "输入您想咨询的问题..." : "请先登录..."}
                  className="w-full px-6 py-4 pl-52 pr-14 rounded-full bg-card/70 backdrop-blur-sm border border-border text-foreground placeholder-muted-foreground font-light focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-300 text-base"
                  disabled={isLoading || !user}
                />
                {/* Left side: Profile selector and ULTRA button */}
                <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-2 pr-3">
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
                        className={`flex items-center gap-1.5 px-3 py-2 h-10 rounded-full border transition-all duration-300 ${
                          isUltraMode 
                            ? 'bg-card text-foreground border-primary/60 shadow-sm' 
                            : 'bg-transparent text-muted-foreground/50 border-border/50 hover:text-muted-foreground hover:border-border'
                        }`}
                        title={isUltraMode ? '关闭 ULTRA 模式' : '开启 ULTRA 模式'}
                      >
                        <span className={`text-sm font-light transition-all duration-300 ${isUltraMode ? 'text-primary' : ''}`}>ULTRA</span>
                      </button>
                    </>
                  )}
                </div>
                {/* Right side: Send button */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading || !user}
                    className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>{/* Bazi Dialog */}
        <BaziDialog
          isOpen={showBaziDialog}
          onClose={() => setShowBaziDialog(false)}
          onSubmit={handleBaziSubmit}
        />

        {/* Auth Dialog */}
        <AuthDialog
          isOpen={showAuthDialog}
          onClose={() => setShowAuthDialog(false)}
        />        {/* Chat Sessions Dialog */}
        <ChatSessionsDialog
          isOpen={showSessionsDialog}
          onClose={() => setShowSessionsDialog(false)}
          onSelectSession={loadSession}
          currentSessionId={currentSessionId}
        />

        {/* Profiles Management Dialog */}
        <ProfilesManagementDialog
          isOpen={showProfilesDialog}
          onClose={() => setShowProfilesDialog(false)}
        />

        {/* Donation Button */}
        <DonationButton />
      </div>
    </div>
  )
}