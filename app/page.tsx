"use client"

import type React from "react"
import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import { Send, Calendar } from "lucide-react"
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
  }, [input, isLoading, messages, baziAnalysisResult, isStreamingStarted, user, ensureSession, saveMessage, supabase])
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
    "我该如何进行感情规划？", 
    "帮我分析一下我的命局",
    "我的感情状况如何",
    "我的性格呈现怎样的特点？",
    "我有哪些特殊的格局",
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
    <div className="min-h-screen relative overflow-hidden bg-neutral-50">
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
                  <h1 className="text-4xl md:text-6xl font-light text-neutral-800 leading-tight">
                    认识更清楚的自己
                  </h1>

                  <p className="text-lg text-neutral-600 max-w-xl mx-auto leading-relaxed font-light">
                    点击右下输入生辰，开始对话进行命理分析
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
                    <div className="bg-white/70 backdrop-blur-sm border border-neutral-200/40 rounded-3xl px-6 py-4 max-w-xs">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                          <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce"></div>
                          <div
                            className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce"
                            style={{ animationDelay: "0.1s" }}
                          ></div>
                          <div
                            className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce"
                            style={{ animationDelay: "0.2s" }}
                          ></div>
                        </div>
                        <span className="text-sm text-neutral-600 font-light">思考中</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>        {/* Input Area */}
        <div className="p-4 bg-white/30 backdrop-blur-xl border-t border-neutral-200/30">
          <div className="max-w-3xl mx-auto">
            <form id="chat-form" onSubmit={handleSubmit} className="relative">
              <div className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={handleInputChange}
                  placeholder={user ? "选择人物后，输入您想咨询的问题..." : "请先登录..."}
                  className="w-full px-6 py-4 pl-44 pr-14 rounded-full bg-white/70 backdrop-blur-sm border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 font-light focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300 text-base"
                  disabled={isLoading || !user}
                />
                {/* Left side: Profile selector and add button */}
                <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
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
                      />
                      <button
                        type="button"
                        onClick={() => setShowProfilesDialog(true)}
                        className="w-10 h-10 rounded-full bg-white/80 border border-neutral-200/40 text-neutral-600 hover:bg-white hover:text-neutral-800 transition-all duration-300 flex items-center justify-center font-light text-lg"
                        title="管理人物"
                      >
                        +
                      </button>
                    </>
                  )}
                </div>
                {/* Right side: Send button */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading || !user}
                    className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-white hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300"
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