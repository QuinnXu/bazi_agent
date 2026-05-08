"use client"

import React, { memo, useMemo, useState } from "react"
import Image from "next/image"
import ReactMarkdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import remarkGfm from "remark-gfm"
import {
  CalendarRange,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Copy,
  ImageIcon,
  Loader2,
  Sparkles,
  Users,
} from "lucide-react"
import type { FeatureKind } from "@/lib/feature-types"
import { sanitizeReplacementChars } from "@/lib/text-sanitize"
import {
  AgentInputRequest,
  type AgentInlineInputRequest,
  type AgentInputValues,
} from "@/components/agent-input-request"

export type MessageRunKind = "classic" | "agent" | "feature"

export interface MessageStreamState {
  status: "queued" | "streaming" | "complete" | "stopped" | "error"
  runKind: MessageRunKind
  phase?: "understanding" | "retrieving" | "generating" | "finalizing"
  label: string
}

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: Date
  streamState?: MessageStreamState
  agentUi?: AgentInlineInputRequest
  agentUiStatus?: "pending" | "submitted"
}

interface ChatMessageProps {
  message: Message
  isStreaming?: boolean
  reportType?: FeatureKind
  onFollowUp?: (text: string) => void
  onAgentUiSubmit?: (request: AgentInlineInputRequest, values: AgentInputValues) => void | Promise<void>
}

const SENTINEL_TO_KIND: Record<string, FeatureKind> = {
  "合盘": "hepan",
  "近期运势": "fortune",
  "头像": "avatar",
  "人生脉络": "lifepath",
}

const FEATURE_META: Record<
  FeatureKind,
  { title: string; icon: React.ElementType; suggests: string[] }
> = {
  hepan: {
    title: "合盘分析报告",
    icon: Users,
    suggests: ["我们的相处节奏？", "哪一年关系会更近？", "需要注意哪些磨合点？"],
  },
  fortune: {
    title: "近期运势推演",
    icon: CalendarRange,
    suggests: ["这段时间财运会怎样？", "感情上要注意什么？", "哪几天最适合行动？"],
  },
  avatar: {
    title: "头像气质报告",
    icon: ImageIcon,
    suggests: ["再生成 3 个风格建议", "适合什么配色？", "可以再给一个头像 prompt 吗？"],
  },
  lifepath: {
    title: "人生脉络总览",
    icon: Compass,
    suggests: ["哪个大运最关键？", "三十岁前的重点是什么？", "晚年要注意什么？"],
  },
}

const DEFAULT_FOLLOW_UPS = ["继续展开", "提炼三个重点", "下一步怎么做？"]

const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-xl font-semibold mt-6 mb-3 text-foreground first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-lg font-semibold mt-5 mb-2 text-foreground first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-base font-semibold mt-4 mb-2 text-foreground first:mt-0">{children}</h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="text-sm font-semibold mt-3 mb-1 text-foreground first:mt-0">{children}</h4>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="my-3 leading-relaxed first:mt-0 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="my-3 ml-5 list-disc space-y-1.5 first:mt-0 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="my-3 ml-5 list-decimal space-y-1.5 first:mt-0 last:mb-0">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed pl-1">{children}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-accent">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic text-muted-foreground">{children}</em>
  ),
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
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
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="my-4 p-4 bg-muted border border-border rounded-lg overflow-x-auto text-sm font-mono">
      {children}
    </pre>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-4 pl-4 py-2 border-l-4 border-primary bg-primary/5 text-foreground rounded-r-lg">
      {children}
    </blockquote>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
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
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => <thead className="bg-muted">{children}</thead>,
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-4 py-2 border-b border-border text-left font-medium text-foreground">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-4 py-2 border-b border-border">{children}</td>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="hover:bg-muted/50 transition-colors">{children}</tr>
  ),
}

export function detectFeatureKindFromContent(content: string): FeatureKind | null {
  if (!content) return null
  const match = content.match(/^\[卜卜象·([^\]]+)\]/)
  if (!match) return null
  return SENTINEL_TO_KIND[match[1]] ?? null
}

function getRestAfterSentinel(content: string): string {
  return content.replace(/^\[卜卜象·[^\]]+\][^\n]*\n*/, "").trim()
}

function summarizeUserRequest(kind: FeatureKind, content: string): string {
  const lines = content.split("\n").map(line => line.trim()).filter(Boolean)
  if (kind === "fortune") {
    return lines.find(line => line.includes("时间范围") || line.includes("关注方向")) || ""
  }
  if (kind === "hepan") {
    return lines.find(line => line.includes("人物") || line.includes("应事") || line.includes("关系类型")) || ""
  }
  if (kind === "avatar") return "上传了头像，请卜卜象看图"
  if (kind === "lifepath") {
    return lines.find(line => line.includes("命主信息")) || ""
  }
  return ""
}

function UserFeatureCard({ kind, content }: { kind: FeatureKind; content: string }) {
  const [expanded, setExpanded] = useState(false)
  const meta = FEATURE_META[kind]
  const Icon = meta.icon
  const summary = summarizeUserRequest(kind, content)
  const rest = getRestAfterSentinel(content)

  return (
    <div className="rounded-xl border border-primary-foreground/25 bg-primary-foreground/10 backdrop-blur-sm px-3.5 py-3 max-w-md">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-md bg-primary-foreground/20 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            我想做：{meta.title.replace("报告", "").replace("总览", "").replace("推演", "")}
          </p>
          {summary && <p className="text-[11px] opacity-80 mt-1 truncate">{summary}</p>}
        </div>
      </div>
      {rest && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(value => !value)}
            className="mt-2 text-[11px] opacity-70 hover:opacity-100 inline-flex items-center gap-1"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? "收起完整请求" : "查看完整请求"}
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

function ReportHeader({ kind }: { kind: FeatureKind }) {
  const meta = FEATURE_META[kind]
  const Icon = meta.icon
  return (
    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border/50">
      <div className="w-7 h-7 rounded-md bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70">卜卜象 · 报告</p>
        <p className="text-sm font-medium text-foreground">{meta.title}</p>
      </div>
      <Sparkles className="w-3.5 h-3.5 text-accent" />
    </div>
  )
}

function FollowUp({
  kind,
  onFollowUp,
}: {
  kind?: FeatureKind
  onFollowUp?: (text: string) => void
}) {
  if (!onFollowUp) return null
  const suggests = kind ? FEATURE_META[kind].suggests : DEFAULT_FOLLOW_UPS
  return (
    <div className="mt-4 pt-3 border-t border-border/50">
      <p className="text-[11px] text-muted-foreground/70 mb-2">想继续追问：</p>
      <div className="flex flex-wrap gap-2">
        {suggests.map(text => (
          <button
            key={text}
            type="button"
            onClick={() => onFollowUp(text)}
            className="px-3 py-1.5 rounded-lg text-xs font-light bg-muted/60 hover:bg-primary/10 hover:text-primary text-muted-foreground border border-border/40 hover:border-primary/30 transition-all"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  )
}

function MessageSkeleton() {
  return (
    <div className="space-y-3 py-1">
      <div className="h-3.5 w-11/12 rounded-md bg-muted animate-pulse" />
      <div className="h-3.5 w-4/5 rounded-md bg-muted animate-pulse" />
      <div className="h-3.5 w-2/3 rounded-md bg-muted animate-pulse" />
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="my-4 overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid grid-cols-3 border-b border-border bg-muted/60">
        <div className="h-9 border-r border-border/70" />
        <div className="h-9 border-r border-border/70" />
        <div className="h-9" />
      </div>
      {[0, 1, 2].map(row => (
        <div key={row} className="grid grid-cols-3 border-b border-border/60 last:border-b-0">
          <div className="h-10 border-r border-border/50 p-2">
            <div className="h-3 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-10 border-r border-border/50 p-2">
            <div className="h-3 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-10 p-2">
            <div className="h-3 rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

function isFenceOpen(text: string): boolean {
  const matches = text.match(/```/g)
  return Boolean(matches && matches.length % 2 === 1)
}

function findLastStableBoundary(text: string): number {
  if (!text) return 0
  if (/\n$/.test(text)) return text.length

  const paragraph = text.lastIndexOf("\n\n")
  const punctuation = Math.max(
    text.lastIndexOf("。"),
    text.lastIndexOf("！"),
    text.lastIndexOf("？"),
    text.lastIndexOf("!"),
    text.lastIndexOf("?"),
    text.lastIndexOf("；"),
    text.lastIndexOf(";"),
  )
  const boundary = Math.max(paragraph === -1 ? 0 : paragraph + 2, punctuation === -1 ? 0 : punctuation + 1)
  if (boundary >= 10) return boundary

  const newline = text.lastIndexOf("\n")
  if (newline > 80) return newline + 1

  return 0
}

function looksLikeTableBlock(block: string): boolean {
  const lines = block.trim().split("\n").filter(Boolean)
  return lines.length >= 2 &&
    lines.some(line => line.includes("|")) &&
    lines.some(line => /^\s*\|?\s*:?-{3,}:?\s*\|/.test(line))
}

function splitStreamingMarkdown(content: string) {
  if (!content) {
    return {
      stableMarkdown: "",
      draftText: "",
      codeBlockDraft: "",
      hasPendingCodeBlock: false,
      hasPendingTable: false,
    }
  }

  if (isFenceOpen(content)) {
    const fenceStart = content.lastIndexOf("```")
    const stableMarkdown = content.slice(0, fenceStart)
    const draftText = content.slice(fenceStart)
    const codeBlockDraft = draftText
      .replace(/^```[^\n]*\n?/, "")
      .replace(/```$/, "")
    return {
      stableMarkdown,
      draftText: "",
      codeBlockDraft,
      hasPendingCodeBlock: true,
      hasPendingTable: false,
    }
  }

  const stableEnd = findLastStableBoundary(content)
  let stableMarkdown = stableEnd > 0 ? content.slice(0, stableEnd) : ""
  const draftText = stableEnd > 0 ? content.slice(stableEnd) : content
  let hasPendingTable = false

  const blockStart = Math.max(0, stableMarkdown.lastIndexOf("\n\n") + 2)
  const lastBlock = stableMarkdown.slice(blockStart)
  if (lastBlock && looksLikeTableBlock(lastBlock) && !stableMarkdown.endsWith("\n\n")) {
    stableMarkdown = stableMarkdown.slice(0, blockStart)
    hasPendingTable = true
  }

  return {
    stableMarkdown,
    draftText,
    codeBlockDraft: "",
    hasPendingCodeBlock: false,
    hasPendingTable,
  }
}

function StreamingMarkdown({ content }: { content: string }) {
  const parts = useMemo(() => splitStreamingMarkdown(content), [content])

  if (!content) return <MessageSkeleton />

  return (
    <div className="markdown-content max-w-none text-foreground">
      {parts.stableMarkdown && <MarkdownRenderer content={parts.stableMarkdown} />}
      {parts.hasPendingTable && <TableSkeleton />}
      {parts.hasPendingCodeBlock && (
        <div className="my-4 rounded-lg border border-border bg-muted">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span>代码生成中</span>
          </div>
          <pre className="max-h-72 overflow-auto p-4 text-sm font-mono whitespace-pre-wrap">
            {parts.codeBlockDraft || " "}
          </pre>
        </div>
      )}
      {parts.draftText && (
        <p className="my-3 whitespace-pre-wrap leading-relaxed text-foreground/92 first:mt-0 last:mb-0">
          {parts.draftText}
          <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle animate-pulse" />
        </p>
      )}
    </div>
  )
}

function AssistantActions({
  content,
  isStreaming,
  isCollapsed,
  canCollapse,
  copied,
  onCopy,
  onToggleCollapse,
}: {
  content: string
  isStreaming: boolean
  isCollapsed: boolean
  canCollapse: boolean
  copied: boolean
  onCopy: () => void
  onToggleCollapse: () => void
}) {
  if (!content.trim()) return null

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/45 pt-3">
      <button
        type="button"
        onClick={onCopy}
        disabled={isStreaming}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
        title={isStreaming ? "生成完成后可复制" : "复制全文"}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "已复制" : "复制"}
      </button>
      {canCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          disabled={isStreaming}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
          title={isCollapsed ? "展开全文" : "折叠长答案"}
        >
          {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          {isCollapsed ? "展开" : "折叠"}
        </button>
      )}
    </div>
  )
}

function streamLabel(message: Message, isStreaming: boolean, reportType?: FeatureKind): string {
  if (message.streamState?.label) return message.streamState.label
  if (isStreaming && !message.content) {
    if (reportType) return "正在整理报告"
    return "正在生成回复"
  }
  if (isStreaming) return "正在生成"
  if (message.streamState?.status === "stopped") return "已停止"
  if (message.streamState?.status === "error") return "生成失败"
  return "已完成"
}

const ChatMessage = memo(function ChatMessage({
  message,
  isStreaming = false,
  reportType,
  onFollowUp,
  onAgentUiSubmit,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const isUser = message.role === "user"
  const displayContent = useMemo(
    () => sanitizeReplacementChars(message.content),
    [message.content],
  )

  const userKind = useMemo(
    () => (isUser ? detectFeatureKindFromContent(displayContent) : null),
    [isUser, displayContent],
  )

  const hasStoppedWithContent = message.streamState?.status === "stopped" && Boolean(displayContent.trim())
  const actionsDisabled = isStreaming && !hasStoppedWithContent
  const canCollapse = displayContent.length > 1400 || displayContent.split("\n").length > 22
  const contentClassName = collapsed && canCollapse && !isStreaming
    ? "relative max-h-[28rem] overflow-hidden"
    : "relative"

  const handleCopy = async () => {
    if (actionsDisabled || !displayContent.trim()) return
    try {
      await navigator.clipboard.writeText(displayContent)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  if (isUser) {
    return (
      <div className="flex w-full justify-end">
        <div className="max-w-[min(88%,42rem)] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 font-light leading-relaxed text-primary-foreground shadow-sm md:max-w-[min(82%,42rem)] md:rounded-lg md:rounded-br-sm md:py-3">
          {userKind ? (
            <UserFeatureCard kind={userKind} content={displayContent} />
          ) : (
            <div className="whitespace-pre-wrap">{displayContent}</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full justify-start">
      <div className="w-full max-w-3xl px-0 py-1.5 md:px-2 md:py-2">
        <article
          className="min-w-0 flex-1 rounded-2xl border border-border/65 bg-card/82 px-4 py-3 font-light leading-relaxed text-foreground shadow-sm backdrop-blur-sm md:rounded-xl md:bg-card/76"
          data-streaming={isStreaming ? "true" : "false"}
        >
          <div className="mb-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="h-7 w-7 flex-shrink-0 overflow-hidden rounded-lg border border-primary/20 bg-card shadow-sm">
              <Image src="/avatar.png" alt="卜卜象" width={28} height={28} className="h-full w-full object-contain" />
            </span>
            <span className="font-medium text-foreground/80">卜卜象</span>
            <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-muted/55 px-2 py-0.5 text-[10px] text-muted-foreground">
              {isStreaming && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary animate-pulse" />}
              <span className="truncate">{streamLabel(message, isStreaming, reportType)}</span>
            </span>
          </div>

          {reportType && <ReportHeader kind={reportType} />}

          <div className={contentClassName}>
            {isStreaming ? (
              <StreamingMarkdown content={displayContent} />
            ) : (
              <div className="markdown-content max-w-none text-foreground">
                {displayContent ? <MarkdownRenderer content={displayContent} /> : <MessageSkeleton />}
              </div>
            )}
            {collapsed && canCollapse && !isStreaming && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card to-transparent" />
            )}
          </div>

          <AssistantActions
            content={displayContent}
            isStreaming={actionsDisabled}
            isCollapsed={collapsed}
            canCollapse={canCollapse}
            copied={copied}
            onCopy={handleCopy}
            onToggleCollapse={() => setCollapsed(value => !value)}
          />

          {!isStreaming && displayContent && (
            <FollowUp kind={reportType} onFollowUp={onFollowUp} />
          )}

          {message.agentUi && onAgentUiSubmit && (
            <AgentInputRequest
              request={message.agentUi}
              disabled={message.agentUiStatus === "submitted"}
              onSubmit={onAgentUiSubmit}
            />
          )}
        </article>
      </div>
    </div>
  )
})

export { ChatMessage }
