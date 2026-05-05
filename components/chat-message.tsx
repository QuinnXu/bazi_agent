"use client"

import React, { memo, useMemo, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Users, CalendarRange, ImageIcon, Compass, Sparkles, ChevronDown, ChevronUp } from "lucide-react"
import type { FeatureKind } from "@/lib/feature-types"

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  /**
   * If set, render the assistant bubble with a feature report header + follow-up
   * suggestion buttons. Provided by the parent based on the previous user message's sentinel.
   */
  reportType?: FeatureKind;
  onFollowUp?: (text: string) => void;
}

// ==================== Sentinel detection ====================

const SENTINEL_TO_KIND: Record<string, FeatureKind> = {
  '合盘': 'hepan',
  '近期运势': 'fortune',
  '头像': 'avatar',
  '人生脉络': 'lifepath',
}

const FEATURE_META: Record<
  FeatureKind,
  { title: string; icon: React.ElementType; suggests: string[] }
> = {
  hepan: {
    title: '合盘分析报告',
    icon: Users,
    suggests: ['我们的相处节奏？', '哪一年关系会更近？', '需要注意哪些磨合点？'],
  },
  fortune: {
    title: '近期运势推演',
    icon: CalendarRange,
    suggests: ['这段时间财运会怎样？', '感情上要注意什么？', '哪几天最适合行动？'],
  },
  avatar: {
    title: '头像气质报告',
    icon: ImageIcon,
    suggests: ['再生成 3 个风格建议', '适合什么配色？', '可以再给一个头像 prompt 吗？'],
  },
  lifepath: {
    title: '人生脉络总览',
    icon: Compass,
    suggests: ['哪个大运最关键？', '三十岁前的重点是什么？', '晚年要注意什么？'],
  },
}

/**
 * Detect feature sentinel from message content.
 * Returns the kind if matched at the start, else null.
 */
export function detectFeatureKindFromContent(content: string): FeatureKind | null {
  if (!content) return null
  const m = content.match(/^\[卜卜象·([^\]]+)\]/)
  if (!m) return null
  return SENTINEL_TO_KIND[m[1]] ?? null
}

// ==================== Helpers ====================

/**
 * Strip the sentinel header line and return the rest, used for "查看完整请求" expand.
 */
function getRestAfterSentinel(content: string): string {
  return content.replace(/^\[卜卜象·[^\]]+\][^\n]*\n*/, '').trim()
}

/**
 * Try to compute a 1-line summary for the user-side feature card.
 */
function summarizeUserRequest(kind: FeatureKind, content: string): string {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)
  // Look for first relevant signal
  if (kind === 'fortune') {
    const r = lines.find(l => l.includes('时间范围') || l.includes('关注方向'))
    if (r) return r
  }
  if (kind === 'hepan') {
    const r = lines.find(l => l.includes('人物') || l.includes('应事') || l.includes('关系类型'))
    if (r) return r
  }
  if (kind === 'avatar') return '上传了头像，请卜卜象看图'
  if (kind === 'lifepath') {
    const r = lines.find(l => l.includes('命主信息'))
    if (r) return r
  }
  return ''
}

// ==================== User-side feature card ====================

function UserFeatureCard({
  kind,
  content,
}: {
  kind: FeatureKind
  content: string
}) {
  const [expanded, setExpanded] = useState(false)
  const meta = FEATURE_META[kind]
  const Icon = meta.icon
  const summary = summarizeUserRequest(kind, content)
  const rest = getRestAfterSentinel(content)

  return (
    <div className="rounded-2xl border border-primary-foreground/30 bg-primary-foreground/10 backdrop-blur-sm px-4 py-3 max-w-md">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary-foreground/20 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">我想做：{meta.title.replace('报告', '').replace('总览', '').replace('推演', '')}</p>
          {summary && (
            <p className="text-[11px] opacity-80 mt-1 truncate">{summary}</p>
          )}
        </div>
      </div>
      {rest && (
        <>
          <button
            onClick={() => setExpanded(e => !e)}
            className="mt-2 text-[11px] opacity-70 hover:opacity-100 inline-flex items-center gap-1"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? '收起完整请求' : '查看完整请求'}
          </button>
          {expanded && (
            <pre className="mt-2 text-[11px] whitespace-pre-wrap opacity-85 font-light max-h-60 overflow-y-auto leading-relaxed">
              {rest}
            </pre>
          )}
        </>
      )}
    </div>
  )
}

// ==================== Assistant report header ====================

function ReportHeader({ kind }: { kind: FeatureKind }) {
  const meta = FEATURE_META[kind]
  const Icon = meta.icon
  return (
    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border/50">
      <div className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
          卜卜象 · 报告
        </p>
        <p className="text-sm font-medium text-foreground">{meta.title}</p>
      </div>
      <Sparkles className="w-3.5 h-3.5 text-accent" />
    </div>
  )
}

function ReportFollowUp({
  kind,
  onFollowUp,
}: {
  kind: FeatureKind
  onFollowUp?: (text: string) => void
}) {
  if (!onFollowUp) return null
  const meta = FEATURE_META[kind]
  return (
    <div className="mt-4 pt-3 border-t border-border/50">
      <p className="text-[11px] text-muted-foreground/70 mb-2">想继续追问：</p>
      <div className="flex flex-wrap gap-2">
        {meta.suggests.map(s => (
          <button
            key={s}
            onClick={() => onFollowUp(s)}
            className="px-3 py-1.5 rounded-full text-xs font-light bg-muted/60 hover:bg-primary/10 hover:text-primary text-muted-foreground border border-border/40 hover:border-primary/30 transition-all"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

// ==================== Main component ====================

const ChatMessage = memo(function ChatMessage({
  message,
  isStreaming = false,
  reportType,
  onFollowUp,
}: ChatMessageProps) {
  const isUser = message.role === 'user'

  const userKind = useMemo(
    () => (isUser ? detectFeatureKindFromContent(message.content) : null),
    [isUser, message.content],
  )

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
          userKind ? (
            <UserFeatureCard kind={userKind} content={message.content} />
          ) : (
            <div className="whitespace-pre-wrap">{message.content}</div>
          )
        ) : (
          <>
            {reportType && <ReportHeader kind={reportType} />}
            {isStreaming ? (
              <div className="markdown-content max-w-none text-foreground whitespace-pre-wrap">
                {message.content}
              </div>
            ) : (
              <div className="markdown-content max-w-none text-foreground">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
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
                    p: ({ children }) => (
                      <p className="my-3 leading-relaxed first:mt-0 last:mb-0">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="my-3 ml-5 list-disc space-y-1.5 first:mt-0 last:mb-0">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="my-3 ml-5 list-decimal space-y-1.5 first:mt-0 last:mb-0">{children}</ol>
                    ),
                    li: ({ children }) => (
                      <li className="leading-relaxed pl-1">{children}</li>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-accent">{children}</strong>
                    ),
                    em: ({ children }) => (
                      <em className="italic text-muted-foreground">{children}</em>
                    ),
                    code: ({ children, className }) => {
                      const isInline = !className
                      if (isInline) {
                        return (
                          <code className="px-1.5 py-0.5 bg-muted text-primary rounded text-sm font-mono">
                            {children}
                          </code>
                        )
                      }
                      return <code className={className}>{children}</code>
                    },
                    pre: ({ children }) => (
                      <pre className="my-4 p-4 bg-muted border border-border rounded-lg overflow-x-auto text-sm font-mono">
                        {children}
                      </pre>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="my-4 pl-4 py-2 border-l-4 border-primary bg-primary/5 text-foreground rounded-r-lg">
                        {children}
                      </blockquote>
                    ),
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
                    hr: () => <hr className="my-6 border-border" />,
                    table: ({ children }) => (
                      <div className="my-4 overflow-x-auto rounded-lg border border-border">
                        <table className="min-w-full border-collapse">{children}</table>
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
            {reportType && !isStreaming && message.content && (
              <ReportFollowUp kind={reportType} onFollowUp={onFollowUp} />
            )}
          </>
        )}
      </div>
    </div>
  )
})

export { ChatMessage }
