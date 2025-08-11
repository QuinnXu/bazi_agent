"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { Send } from "lucide-react"
import { MinimalBackground } from "@/components/minimal-background"
import { ChatMessage } from "@/components/chat-message"

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export default function Home() {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [showBaziForm, setShowBaziForm] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [baziData, setBaziData] = useState({
    year: '',
    month: '',
    day: '',
    hour: '',
    isSolar: true,
    isFemale: false,
    longitude: '121.5',
    latitude: '31.2'
  })
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
      
      // Include Bazi analysis result if available
      if (baziAnalysisResult) {
        requestData.baziAnalysisResult = baziAnalysisResult;
        console.log('Including complete Bazi analysis result in chat request');
        console.log('Bazi result preview:', baziAnalysisResult.substring(0, 100));
      } else {
        console.log('No Bazi analysis result available');
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

      // Handle non-streaming response
      const content = await response.text();
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: content,
        createdAt: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
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

  const handleBaziSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate required fields
    if (!baziData.year || !baziData.month || !baziData.day || !baziData.hour) {
      alert('请填写完整的出生日期和时间信息');
      return;
    }
    
    try {
      // Get Bazi analysis result
      const response = await fetch('/api/bazi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          year: parseInt(baziData.year),
          month: parseInt(baziData.month),
          day: parseInt(baziData.day),
          hour: parseInt(baziData.hour),
          isSolar: baziData.isSolar,
          isFemale: baziData.isFemale,
          longitude: parseFloat(baziData.longitude),
          latitude: parseFloat(baziData.latitude)
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        // Store the complete Bazi analysis result
        setBaziAnalysisResult(data.baziResult);
        console.log('Bazi analysis result stored:', data.baziResult);
        setShowBaziForm(false);
        
        // Add informational message to chat
        const infoMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: '您的八字信息已成功录入！现在您可以询问关于运势、性格、事业、感情等方面的问题，我会结合您的八字进行专业分析。',
          createdAt: new Date()
        };
        
        setMessages(prev => [...prev, infoMessage]);
      } else {
        alert(`八字信息验证失败：${data.error}`);
      }
    } catch (error) {
      console.error('Error validating Bazi data:', error);
      alert('八字信息验证失败，请检查输入的数据是否正确。');
    }
  }

  const handleBaziInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    setBaziData(prev => ({ ...prev, [name]: val }))
  }

  const suggestedPrompts = [
    "Help me brainstorm ideas",
    "Explain a complex topic",
    "Write something creative",
    "Solve a problem",
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
            {messages.length === 0 && !showBaziForm ? (
              // Welcome Screen
              <div className="text-center space-y-12 py-20">
                <div className="space-y-8">
                  <h1 className="text-4xl md:text-6xl font-light text-neutral-800 leading-tight">
                    How can I help you today?
                  </h1>

                  <p className="text-lg text-neutral-600 max-w-xl mx-auto leading-relaxed font-light">
                    Start a conversation below or get a Bazi analysis
                  </p>
                </div>

                <div className="flex flex-col items-center">
                  <button
                    onClick={() => setShowBaziForm(true)}
                    className="px-6 py-3 rounded-full bg-white/60 backdrop-blur-sm border border-neutral-200/50 text-neutral-700 text-base font-light hover:bg-white/80 hover:border-neutral-300/60 transition-all duration-300 mb-8"
                  >
                    Get Bazi Analysis
                  </button>

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
            ) : showBaziForm ? (
              // Bazi Form
              <div className="py-8">
                <div className="bg-white/70 backdrop-blur-sm border border-neutral-200/40 rounded-2xl p-6 max-w-2xl mx-auto">
                  <h2 className="text-2xl font-light text-neutral-800 mb-6 text-center">八字排盘</h2>
                  <form onSubmit={handleBaziSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-light text-neutral-700 mb-1">Year</label>
                        <input
                          type="number"
                          name="year"
                          value={baziData.year}
                          onChange={handleBaziInputChange}
                          className="w-full px-4 py-2 rounded-lg bg-white/50 border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 focus:outline-none focus:border-neutral-300/60 focus:bg-white/60 transition-all duration-300"
                          placeholder="1990"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-light text-neutral-700 mb-1">Month</label>
                        <input
                          type="number"
                          name="month"
                          value={baziData.month}
                          onChange={handleBaziInputChange}
                          className="w-full px-4 py-2 rounded-lg bg-white/50 border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 focus:outline-none focus:border-neutral-300/60 focus:bg-white/60 transition-all duration-300"
                          placeholder="1-12"
                          min="1"
                          max="12"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-light text-neutral-700 mb-1">Day</label>
                        <input
                          type="number"
                          name="day"
                          value={baziData.day}
                          onChange={handleBaziInputChange}
                          className="w-full px-4 py-2 rounded-lg bg-white/50 border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 focus:outline-none focus:border-neutral-300/60 focus:bg-white/60 transition-all duration-300"
                          placeholder="1-31"
                          min="1"
                          max="31"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-light text-neutral-700 mb-1">Hour</label>
                        <input
                          type="number"
                          name="hour"
                          value={baziData.hour}
                          onChange={handleBaziInputChange}
                          className="w-full px-4 py-2 rounded-lg bg-white/50 border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 focus:outline-none focus:border-neutral-300/60 focus:bg-white/60 transition-all duration-300"
                          placeholder="0-23"
                          min="0"
                          max="23"
                          required
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-light text-neutral-700 mb-1">Longitude</label>
                        <input
                          type="text"
                          name="longitude"
                          value={baziData.longitude}
                          onChange={handleBaziInputChange}
                          className="w-full px-4 py-2 rounded-lg bg-white/50 border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 focus:outline-none focus:border-neutral-300/60 focus:bg-white/60 transition-all duration-300"
                          placeholder="121.5"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-light text-neutral-700 mb-1">Latitude</label>
                        <input
                          type="text"
                          name="latitude"
                          value={baziData.latitude}
                          onChange={handleBaziInputChange}
                          className="w-full px-4 py-2 rounded-lg bg-white/50 border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 focus:outline-none focus:border-neutral-300/60 focus:bg-white/60 transition-all duration-300"
                          placeholder="31.2"
                        />
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          name="isSolar"
                          checked={baziData.isSolar}
                          onChange={handleBaziInputChange}
                          className="rounded text-neutral-800 focus:ring-neutral-500"
                        />
                        <span className="text-sm font-light text-neutral-700">Solar Calendar</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          name="isFemale"
                          checked={baziData.isFemale}
                          onChange={handleBaziInputChange}
                          className="rounded text-neutral-800 focus:ring-neutral-500"
                        />
                        <span className="text-sm font-light text-neutral-700">Female</span>
                      </label>
                    </div>
                    
                    <div className="flex justify-end space-x-3 pt-4">
                      <button
                        type="button"
                        onClick={() => setShowBaziForm(false)}
                        className="px-4 py-2 rounded-full bg-neutral-100 text-neutral-700 text-sm font-light hover:bg-neutral-200 transition-all duration-300"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-full bg-neutral-800 text-white text-sm font-light hover:bg-neutral-700 transition-all duration-300"
                      >
                        Submit
                      </button>
                    </div>
                  </form>
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
                        <span className="text-sm text-neutral-600 font-light">Thinking</span>
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
        {!showBaziForm && (
          <div className="p-6 bg-white/30 backdrop-blur-xl border-t border-neutral-200/30">
            <div className="max-w-3xl mx-auto">
              <form id="chat-form" onSubmit={handleSubmit} className="relative">
                <div className="relative">
                  <input
                    type="text"
                    value={input}
                    onChange={handleInputChange}
                    placeholder="Message..."
                    className="w-full px-6 py-4 pr-14 rounded-full bg-white/70 backdrop-blur-sm border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 font-light focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300 text-base"
                    disabled={isLoading}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-white hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}