"use client"

import React, { useMemo, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  CalendarRange,
  Compass,
  HeartHandshake,
  ImageIcon,
  LockKeyhole,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react"

import { AuthDialog } from "@/components/auth-dialog"
import { Button } from "@/components/ui/button"
import type { FeatureKind } from "@/lib/feature-types"
import { buildFeatureCardItems } from "@/lib/bubu-content"
import { cn } from "@/lib/utils"

const NAV_ITEMS = ["产品", "能力", "场景", "定价", "关于"] as const

const QUICK_PROMPTS = [
  { label: "今日运势", prompt: "请帮我看看今天的整体运势和行动建议", icon: Sparkles },
  { label: "事业建议", prompt: "我想看看近期事业发展和职业选择建议", icon: CalendarRange },
  { label: "关系洞察", prompt: "请帮我分析一段关系里的相处节奏和磨合点", icon: HeartHandshake },
  { label: "性格画像", prompt: "请帮我做一份性格画像和成长建议", icon: UserRound },
  { label: "AI 解读", prompt: "我想让卜卜象帮我做一次综合命理分析", icon: Sparkles },
] as const

const FEATURE_ICONS: Record<FeatureKind, React.ElementType> = {
  hepan: Users,
  fortune: CalendarRange,
  avatar: ImageIcon,
  lifepath: Compass,
}

const FEATURE_PROMPTS: Record<FeatureKind, string> = {
  hepan: "我想做合盘或应事分析，请引导我补充必要信息",
  fortune: "我想看近期运势，请引导我选择命主、时间范围和关注方向",
  avatar: "我想做头像分析和风格建议，请引导我上传头像并补充偏好",
  lifepath: "我想做人生脉络分析，请引导我选择命主并开始分析",
}

const FEATURE_ACCENTS: Record<FeatureKind, string> = {
  hepan: "bg-primary/10 text-primary border-primary/20",
  fortune: "bg-accent/18 text-[oklch(0.62_0.115_40.07)] border-accent/30",
  avatar: "bg-[oklch(0.660_0.116_243.69)]/10 text-[oklch(0.660_0.116_243.69)] border-[oklch(0.660_0.116_243.69)]/25",
  lifepath: "bg-[oklch(0.762_0.060_171.34)]/16 text-[oklch(0.50_0.075_171.34)] border-[oklch(0.762_0.060_171.34)]/30",
}

export default function LandingPage() {
  const router = useRouter()
  const [prompt, setPrompt] = useState("")
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const featureCards = useMemo(() => buildFeatureCardItems(), [])

  const goToChat = (nextPrompt?: string) => {
    const value = (nextPrompt ?? prompt).trim()
    router.push(value ? `/?prompt=${encodeURIComponent(value)}` : "/")
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    goToChat()
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-background px-3 py-3 text-foreground sm:px-5 sm:py-5">
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,oklch(0.992_0.004_80)_0%,oklch(0.986_0.006_80)_42%,oklch(0.965_0.011_250)_100%)]" />
      <div className="absolute inset-0 -z-10 opacity-[0.22] [background-image:linear-gradient(to_right,oklch(0.895_0.012_250/0.52)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.895_0.012_250/0.38)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_82%,transparent)]" />

      <section className="mx-auto flex min-h-[calc(100dvh-1.5rem)] w-full max-w-7xl flex-col overflow-hidden rounded-[1.75rem] border border-border/80 bg-card/72 shadow-[0_24px_80px_oklch(0.245_0.012_255/0.10)] backdrop-blur-2xl sm:min-h-[calc(100dvh-2.5rem)]">
        <header className="flex h-20 shrink-0 items-center justify-between gap-4 px-5 sm:px-7 lg:px-10">
          <button
            type="button"
            onClick={() => goToChat()}
            className="flex min-w-0 items-center gap-3 text-left"
            aria-label="回到卜卜象聊天"
          >
            <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-primary/15 bg-card shadow-sm">
              <Image src="/logo.jpg" alt="卜卜象" fill className="object-contain" priority />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-semibold leading-tight text-foreground">卜卜象</span>
              <span className="block truncate text-xs font-light text-muted-foreground">AI 陪伴 · 看见更多可能</span>
            </span>
          </button>

          <nav className="hidden items-center gap-12 text-sm text-foreground/86 lg:flex">
            {NAV_ITEMS.map(item => (
              <a key={item} href={`#${item}`} className="hover:text-primary">
                {item}
              </a>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAuthDialog(true)}
              className="h-10 rounded-full border-primary/25 bg-primary/8 px-4 font-light text-primary shadow-sm hover:border-primary/40 hover:bg-primary/12 sm:px-8"
            >
              登录
            </Button>
            <Button
              type="button"
              onClick={() => goToChat()}
              className="h-10 rounded-full border border-primary/30 bg-primary px-4 font-light text-primary-foreground shadow-[0_12px_30px_oklch(0.696_0.137_3.34/0.24)] hover:bg-primary/92 sm:px-7"
            >
              <span className="hidden sm:inline">立即体验</span>
              <span className="sm:hidden">体验</span>
              <Sparkles className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="flex flex-1 flex-col items-center px-4 pb-5 pt-7 sm:px-8 sm:pt-10 lg:pb-7">
          <div id="产品" className="flex w-full flex-1 flex-col items-center justify-center">
            <div className="relative h-24 w-24 sm:h-32 sm:w-32">
              <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl" />
              <Image
                src="/logo.jpg"
                alt="卜卜象"
                fill
                className="relative rounded-full object-contain shadow-[0_18px_42px_oklch(0.696_0.137_3.34/0.16)]"
                priority
              />
            </div>

            <div className="mt-3 max-w-3xl text-center sm:mt-5">
              <h1 className="text-4xl font-light leading-tight text-foreground sm:text-5xl lg:text-6xl">
                陪你看见<span className="text-primary">更多可能</span>
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-sm font-light leading-7 text-muted-foreground sm:text-base">
                卜卜象是你的 AI 命理陪伴助手，能解答问题、结构化分析，也能用温柔的方式给你生活指引与力量。
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-7 w-full max-w-3xl sm:mt-8">
              <div className="relative min-h-32 rounded-2xl border border-primary/35 bg-card/88 p-4 pb-16 shadow-[0_18px_60px_oklch(0.696_0.137_3.34/0.10)] backdrop-blur-xl focus-within:border-primary/60 sm:min-h-36 sm:p-5 sm:pb-16">
                <textarea
                  value={prompt}
                  onChange={event => setPrompt(event.target.value)}
                  placeholder="想聊点什么？问事业、运势、关系或日常选择..."
                  rows={3}
                  className="min-h-16 w-full resize-none bg-transparent pr-1 text-base font-light leading-7 text-foreground outline-none placeholder:text-muted-foreground/75 focus:outline-none sm:text-lg"
                />
                <Button
                  type="submit"
                  size="icon"
                  aria-label="发送给卜卜象"
                  className="absolute bottom-3 right-3 h-11 w-11 rounded-full shadow-[0_10px_24px_oklch(0.696_0.137_3.34/0.25)] sm:bottom-4 sm:right-4 sm:h-12 sm:w-12"
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            </form>

            <div id="场景" className="mt-5 flex max-w-3xl flex-wrap justify-center gap-2.5">
              {QUICK_PROMPTS.map(item => {
                const Icon = item.icon
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => goToChat(item.prompt)}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-border/85 bg-card/76 px-4 text-sm font-light text-muted-foreground shadow-sm backdrop-blur-sm hover:border-primary/25 hover:bg-card hover:text-foreground"
                  >
                    <Icon className="h-4 w-4 text-primary/80" />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div id="能力" className="mt-8 grid w-full max-w-5xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {featureCards.map(item => {
              const Icon = FEATURE_ICONS[item.id]
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goToChat(FEATURE_PROMPTS[item.id])}
                  className="group relative min-h-[9.5rem] overflow-hidden rounded-xl border border-border/80 bg-card/74 p-5 text-left shadow-sm backdrop-blur-sm hover:border-primary/30 hover:bg-card hover:shadow-md"
                >
                  <div className="relative z-10 flex h-full flex-col">
                    <div
                      className={cn(
                        "flex h-11 w-11 items-center justify-center rounded-full border",
                        FEATURE_ACCENTS[item.id],
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="mt-auto pt-8">
                      <h2 className="text-lg font-semibold text-foreground">{item.title}</h2>
                      <p className="mt-2 line-clamp-2 text-sm font-light leading-6 text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </div>
                  <div className="absolute -bottom-12 -right-10 h-32 w-32 rounded-full border border-primary/10 bg-primary/5 opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              )
            })}
          </div>

          <footer id="关于" className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-light text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" />
              隐私安全优先
            </span>
            <span className="hidden h-3 w-px bg-border sm:inline-block" />
            <span>对话内容仅对你可见</span>
            <span className="hidden h-3 w-px bg-border sm:inline-block" />
            <span className="inline-flex items-center gap-1.5">
              <LockKeyhole className="h-4 w-4" />
              不保存敏感信息
            </span>
          </footer>
        </div>
      </section>

      <AuthDialog isOpen={showAuthDialog} onClose={() => setShowAuthDialog(false)} />
    </main>
  )
}
