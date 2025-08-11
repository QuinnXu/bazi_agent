"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { Send, Calendar } from "lucide-react"
import { MinimalBackground } from "@/components/minimal-background"
import { ChatMessage } from "@/components/chat-message"
import { BaziDialog } from "@/components/bazi-dialog"

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
  isSolar: boolean;
  isFemale: boolean;
  longitude: string;
  latitude: string;
}

export default function Home() {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [showBaziDialog, setShowBaziDialog] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [baziData, setBaziData] = useState<BaziData | null>(null)
  const [baziAnalysisResult, setBaziAnalysisResult] = useState<string | null>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Form submitted with input:', input);
    
    if (!input.trim() || isLoading) {
      console.log('Input is empty or loading, not submitting');
      return;
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

    try {
      console.log('Making chat request...');
      
      // Prepare request data with potential Bazi context
      const requestData: any = {
        messages: [...messages, userMessage].map(m => ({
          role: m.role,
          content: m.content
        }))
      };
      
      // Check if user message contains Bazi-related keywords and we have Bazi data
      const isBaziRelated = userMessage.content.toLowerCase().includes('八字') || 
                           userMessage.content.toLowerCase().includes('命理') || 
                           userMessage.content.toLowerCase().includes('运势');
      
      if (isBaziRelated && baziData) {
        requestData.baziData = {
          year: parseInt(baziData.year),
          month: parseInt(baziData.month),
          day: parseInt(baziData.day),
          hour: parseInt(baziData.hour),
          isSolar: baziData.isSolar,
          isFemale: baziData.isFemale,
          longitude: parseFloat(baziData.longitude),
          latitude: parseFloat(baziData.latitude)
        };
        console.log('Including Bazi data in chat request:', requestData.baziData);
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
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          
          // Update the assistant message with the new content
          setMessages(prev => 
            prev.map(msg => 
              msg.id === assistantMessage.id 
                ? { ...msg, content: msg.content + chunk }
                : msg
            )
          );
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
    }
  }

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
        setBaziAnalysisResult(result.baziResult);
        setBaziData(data);
        console.log('Bazi analysis result stored:', result.baziResult);
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

  const suggestedPrompts = [
    "帮我头脑风暴一些想法",
    "解释一个复杂的概念", 
    "写一些创意内容",
    "解决一个问题",
  ]

  const startWithPrompt = (prompt: string) => {
    setInput(prompt);
    // Automatically submit after setting the input
    setTimeout(() => {
      const syntheticEvent = {
        preventDefault: () => {},
      } as React.FormEvent;
      handleSubmit(syntheticEvent);
    }, 100);
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-neutral-50">
      <MinimalBackground />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-8">
          <div className="max-w-3xl mx-auto">
            {messages.length === 0 ? (
              // Welcome Screen
              <div className="text-center space-y-12 py-20">
                <div className="space-y-8">
                  <h1 className="text-4xl md:text-6xl font-light text-neutral-800 leading-tight">
                    今天我如何帮助您？
                  </h1>

                  <p className="text-lg text-neutral-600 max-w-xl mx-auto leading-relaxed font-light">
                    开始下面的对话或进行八字分析
                  </p>
                </div>

                <div className="flex flex-col items-center">
                  {/* Minimal Suggested Prompts */}
                  <div className="flex flex-wrap gap-3 justify-center max-w-2xl mx-auto">
                    {suggestedPrompts.map((prompt, i) => (
                      <button
                        key={i}
                        onClick={() => startWithPrompt(prompt)}
                        className="px-4 py-2 rounded-full bg-white/60 backdrop-blur-sm border border-neutral-200/50 text-neutral-700 text-sm font-light hover:bg-white/80 hover:border-neutral-300/60 transition-all duration-300"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              // Chat Messages
              <div className="space-y-8 py-8">
                {messages.map((message) => (
                  <ChatMessage key={message.id} message={message} />
                ))}
                {isLoading && (
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
        </div>

        {/* Input Area */}
        <div className="p-6 bg-white/30 backdrop-blur-xl border-t border-neutral-200/30">
          <div className="max-w-3xl mx-auto">
            <form id="chat-form" onSubmit={handleSubmit} className="relative">
              <div className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={handleInputChange}
                  placeholder="请输入消息..."
                  className="w-full px-6 py-4 pr-20 rounded-full bg-white/70 backdrop-blur-sm border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 font-light focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300 text-base"
                  disabled={isLoading}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBaziDialog(true)}
                    className="w-10 h-10 rounded-full bg-white/80 hover:bg-white border border-neutral-200/40 flex items-center justify-center text-neutral-600 hover:text-neutral-800 transition-all duration-300"
                    title="八字分析"
                  >
                    <Calendar className="w-4 h-4" />
                  </button>
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-white hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Bazi Dialog */}
        <BaziDialog
          isOpen={showBaziDialog}
          onClose={() => setShowBaziDialog(false)}
          onSubmit={handleBaziSubmit}
        />
      </div>
    </div>
  )
}