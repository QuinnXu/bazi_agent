"use client"

import React, { memo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
}

const ChatMessage = memo(function ChatMessage({ message, isStreaming = false }: ChatMessageProps) {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-4xl px-6 py-4 rounded-3xl font-light leading-relaxed ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-card/70 backdrop-blur-sm border border-border text-foreground glass-minimal'
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : isStreaming ? (
          <div className="markdown-content max-w-none text-foreground whitespace-pre-wrap">{message.content}</div>
        ) : (
          <div className="markdown-content max-w-none text-foreground">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // 自定义标题样式
                h1: ({ children }) => (
                  <h1 className="text-xl font-semibold mt-6 mb-3 text-foreground first:mt-0">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-lg font-semibold mt-5 mb-2 text-foreground first:mt-0">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-base font-semibold mt-4 mb-2 text-foreground first:mt-0">{children}</h3>
                ),
                h4: ({ children }) => (
                  <h4 className="text-sm font-semibold mt-3 mb-1 text-foreground first:mt-0">{children}</h4>
                ),
                // 自定义段落样式
                p: ({ children }) => (
                  <p className="my-3 leading-relaxed first:mt-0 last:mb-0">{children}</p>
                ),
                // 自定义列表样式
                ul: ({ children }) => (
                  <ul className="my-3 ml-5 list-disc space-y-1.5 first:mt-0 last:mb-0">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="my-3 ml-5 list-decimal space-y-1.5 first:mt-0 last:mb-0">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="leading-relaxed pl-1">{children}</li>
                ),
                // 自定义强调样式 - 使用金色（好运提示）
                strong: ({ children }) => (
                  <strong className="font-semibold text-accent">{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="italic text-muted-foreground">{children}</em>
                ),
                // 自定义代码样式
                code: ({ children, className }) => {
                  const isInline = !className;
                  if (isInline) {
                    return (
                      <code className="px-1.5 py-0.5 bg-muted text-primary rounded text-sm font-mono">
                        {children}
                      </code>
                    );
                  }
                  return (
                    <code className={className}>{children}</code>
                  );
                },
                pre: ({ children }) => (
                  <pre className="my-4 p-4 bg-muted border border-border rounded-lg overflow-x-auto text-sm font-mono">
                    {children}
                  </pre>
                ),
                // 自定义引用样式 - 用于重要提示
                blockquote: ({ children }) => (
                  <blockquote className="my-4 pl-4 py-2 border-l-4 border-primary bg-primary/5 text-foreground rounded-r-lg">
                    {children}
                  </blockquote>
                ),
                // 自定义链接样式
                a: ({ href, children }) => (
                  <a 
                    href={href} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
                  >
                    {children}
                  </a>
                ),
                // 自定义分割线
                hr: () => (
                  <hr className="my-6 border-border" />
                ),
                // 自定义表格样式
                table: ({ children }) => (
                  <div className="my-4 overflow-x-auto rounded-lg border border-border">
                    <table className="min-w-full border-collapse">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="bg-muted">{children}</thead>
                ),
                th: ({ children }) => (
                  <th className="px-4 py-2 border-b border-border text-left font-medium text-foreground">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-4 py-2 border-b border-border">{children}</td>
                ),
                tr: ({ children }) => (
                  <tr className="hover:bg-muted/50 transition-colors">{children}</tr>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
});

export { ChatMessage };
