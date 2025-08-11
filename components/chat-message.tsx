"use client"

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github.css'

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
          {isUser ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <div className="prose prose-neutral max-w-none prose-sm">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  // 自定义代码块样式
                  code: ({ node, className, children, ...props }: any) => {
                    const inline = !className?.includes('language-')
                    if (inline) {
                      return (
                        <code
                          className="bg-neutral-100 text-neutral-800 px-1 py-0.5 rounded text-sm font-mono"
                          {...props}
                        >
                          {children}
                        </code>
                      )
                    }
                    return (
                      <code
                        className={`block bg-neutral-50 p-4 rounded-lg overflow-x-auto text-sm font-mono ${className || ''}`}
                        {...props}
                      >
                        {children}
                      </code>
                    )
                  },
                  // 自定义链接样式
                  a: ({ children, href, ...props }: any) => (
                    <a
                      href={href}
                      className="text-blue-600 hover:text-blue-800 underline"
                      target="_blank"
                      rel="noopener noreferrer"
                      {...props}
                    >
                      {children}
                    </a>
                  ),
                  // 自定义标题样式
                  h1: ({ children, ...props }: any) => (
                    <h1 className="text-xl font-semibold mt-6 mb-4 text-neutral-800" {...props}>
                      {children}
                    </h1>
                  ),
                  h2: ({ children, ...props }: any) => (
                    <h2 className="text-lg font-semibold mt-5 mb-3 text-neutral-800" {...props}>
                      {children}
                    </h2>
                  ),
                  h3: ({ children, ...props }: any) => (
                    <h3 className="text-base font-semibold mt-4 mb-2 text-neutral-800" {...props}>
                      {children}
                    </h3>
                  ),
                  // 自定义列表样式
                  ul: ({ children, ...props }: any) => (
                    <ul className="list-disc ml-6 my-3 space-y-1" {...props}>
                      {children}
                    </ul>
                  ),
                  ol: ({ children, ...props }: any) => (
                    <ol className="list-decimal ml-6 my-3 space-y-1" {...props}>
                      {children}
                    </ol>
                  ),
                  // 自定义段落样式
                  p: ({ children, ...props }: any) => (
                    <p className="my-3 leading-relaxed" {...props}>
                      {children}
                    </p>
                  ),
                  // 自定义表格样式
                  table: ({ children, ...props }: any) => (
                    <table className="w-full border-collapse border border-neutral-300 my-4" {...props}>
                      {children}
                    </table>
                  ),
                  th: ({ children, ...props }: any) => (
                    <th className="border border-neutral-300 px-3 py-2 bg-neutral-100 font-semibold" {...props}>
                      {children}
                    </th>
                  ),
                  td: ({ children, ...props }: any) => (
                    <td className="border border-neutral-300 px-3 py-2" {...props}>
                      {children}
                    </td>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        <div className={`text-xs text-neutral-500 mt-2 font-light ${isUser ? "text-right" : "text-left"}`}>
          {message.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  )
}
