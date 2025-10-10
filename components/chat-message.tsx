"use client"

import React, { memo } from "react"

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

interface ChatMessageProps {
  message: Message;
}

const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-4xl px-6 py-4 rounded-3xl font-light leading-relaxed ${
          isUser
            ? 'bg-neutral-800 text-white'
            : 'bg-white/70 backdrop-blur-sm border border-neutral-200/40 text-neutral-800'
        }`}
      >
        <div className="whitespace-pre-wrap">{message.content}</div>
      </div>
    </div>
  );
});

export { ChatMessage };
