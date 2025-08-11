"use client"

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

interface ChatMessageProps {
  message: Message
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user"

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] ${isUser ? "" : ""}`}>
        <div
          className={`px-6 py-4 rounded-3xl font-light text-base leading-relaxed ${
            isUser
              ? "bg-neutral-800 text-white ml-auto"
              : "bg-white/70 backdrop-blur-sm border border-neutral-200/40 text-neutral-800"
          }`}
        >
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>

        <div className={`text-xs text-neutral-500 mt-2 font-light ${isUser ? "text-right" : "text-left"}`}>
          {message.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  )
}
