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
import { GUEST_FIRST_QA_FLOW } from "@/lib/guest-first-qa-flow"
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
  hepan: "text-primary bg-primary/10 border-primary/20",
  fortune: "text-[oklch(0.62_0.115_40.07)] bg-accent/18 border-accent/30",
  avatar: "text-[oklch(0.660_0.116_243.69)] bg-[oklch(0.660_0.116_243.69)]/10 border-[oklch(0.660_0.116_243.69)]/25",
  lifepath: "text-[oklch(0.50_0.075_171.34)] bg-[oklch(0.762_0.060_171.34)]/16 border-[oklch(0.762_0.060_171.34)]/30",
}

const HOW_IT_WORKS = [
  {
    label: "01",
    title: "先问一句",
    description: "不用先登录，也不用一开始就填出生信息。把你的问题放进对话框，卜卜象会先判断适合从哪里开始。",
  },
  {
    label: "02",
    title: "需要命盘时再补资料",
    description: "合盘、运势、人生脉络等深度能力才会引导你创建人物档案，出生时间和地点只在需要排盘时填写。",
  },
  {
    label: "03",
    title: "登录后保存上下文",
    description: "登录后可以保存聊天记录和人物档案，下次继续分析时不用重复补充背景。",
  },
] as const

const KV_SECTIONS = [
  {
    id: "能力",
    kicker: "AI 陪伴",
    title: "日常问题直接问，系统会判断下一步。",
    description: "事业、关系、选择、状态复盘都可以先用自然语言说清楚。简洁 Agent 和经典聊天适合轻量试用，深度报告再进入结构化流程。",
    image: "/landing/insight-kv.png",
    alt: "抽象玻璃界面展示结构化洞察和 AI 分析",
  },
  {
    id: "场景",
    kicker: "渐进资料",
    title: "个人信息不放在首页收集，只在真正需要时出现。",
    description: "当你进入合盘、近期运势或人生脉络等流程，卜卜象才会解释为什么需要出生信息，并把资料保存到可管理的人物档案。",
    image: "/landing/profile-kv.png",
    alt: "柔和笔记本视觉表示人物档案和隐私资料",
  },
] as const

export default function LandingPage() {
  const router = useRouter()
  const [prompt, setPrompt] = useState("")
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const featureCards = useMemo(() => buildFeatureCardItems(), [])

  const goToChat = (nextPrompt?: string) => {
    const value = (nextPrompt ?? prompt).trim()
    const nextUrl = value
      ? `/?prompt=${encodeURIComponent(value)}&from=landing&trialFlow=${GUEST_FIRST_QA_FLOW.id}`
      : "/?from=landing"
    const navigate = () => router.push(nextUrl)
    if (typeof document !== "undefined" && "startViewTransition" in document) {
      ;(document as Document & { startViewTransition: (callback: () => void) => void }).startViewTransition(navigate)
      return
    }
    navigate()
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    goToChat()
  }

  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,oklch(0.992_0.004_80)_0%,oklch(0.986_0.006_80)_42%,oklch(0.965_0.011_250)_100%)]" />
      <div className="absolute inset-0 -z-10 opacity-[0.28] [background-image:linear-gradient(to_right,oklch(0.895_0.012_250/0.55)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.895_0.012_250/0.45)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_76%,transparent)]" />

      <header className="sticky top-0 z-30 border-b border-border/55 bg-background/78 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => goToChat()}
            className="flex min-w-0 items-center gap-3 text-left"
            aria-label="回到卜卜象聊天"
          >
            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-primary/15 bg-card shadow-sm">
              <Image src="/logo.jpg" alt="卜卜象" fill className="object-contain" priority />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold leading-tight text-foreground">卜卜象</span>
              <span className="block truncate text-xs font-light text-muted-foreground">AI 陪伴 · 看见更多可能</span>
            </span>
          </button>

          <nav className="hidden items-center gap-8 text-sm text-foreground/86 lg:flex">
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
              className="h-9 rounded-full border-primary/25 bg-primary/8 px-3 text-sm font-light text-primary shadow-sm hover:border-primary/40 hover:bg-primary/12 sm:px-6"
            >
              登录
            </Button>
            <Button
              type="button"
              onClick={() => goToChat()}
              className="h-9 rounded-full border border-primary/30 bg-primary px-3 text-sm font-light text-primary-foreground shadow-[0_10px_24px_oklch(0.696_0.137_3.34/0.20)] hover:bg-primary/92 sm:px-5"
            >
              <span className="hidden sm:inline">立即体验</span>
              <span className="sm:hidden">体验</span>
              <Sparkles className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <section id="产品" className="mx-auto w-full max-w-6xl px-4 pb-8 pt-8 sm:px-6 sm:pb-10 sm:pt-10 lg:flex lg:min-h-[calc(100dvh-4rem)] lg:flex-col lg:pb-14">
        <div className="grid gap-8 lg:flex-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)] lg:items-center">
          <div className="mx-auto w-full max-w-3xl text-center lg:mx-0 lg:text-left">
            <p className="text-sm font-light text-primary">给第一次来的你</p>
            <h1 className="mt-3 text-4xl font-light leading-tight text-foreground sm:text-5xl lg:text-6xl">
              先问一句，再看见<span className="text-primary">更多可能</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm font-light leading-7 text-muted-foreground sm:text-base lg:mx-0">
              卜卜象是你的 AI 命理陪伴助手。你可以先从一个问题开始；真的需要命盘时，再按步骤补充资料。
            </p>

            <form onSubmit={handleSubmit} className="mt-6 w-full max-w-2xl lg:mt-7">
              <div className="relative min-h-24 rounded-2xl border border-primary/30 bg-card/90 p-3 pb-12 shadow-[0_14px_40px_oklch(0.696_0.137_3.34/0.09)] backdrop-blur-xl [view-transition-name:bubu-composer] focus-within:border-primary/60 sm:min-h-28 sm:rounded-xl sm:p-4 sm:pb-12">
                <textarea
                  value={prompt}
                  onChange={event => setPrompt(event.target.value)}
                  placeholder="先问一句试试：事业、运势、关系或日常选择..."
                  rows={2}
                  className="min-h-12 w-full resize-none bg-transparent pr-1 text-sm font-light leading-6 text-foreground outline-none placeholder:text-muted-foreground/75 focus:outline-none sm:min-h-14 sm:text-base"
                />
                <Button
                  type="submit"
                  size="icon"
                  aria-label="发送给卜卜象"
                  className="absolute bottom-2.5 right-2.5 h-9 w-9 rounded-full shadow-[0_8px_20px_oklch(0.696_0.137_3.34/0.22)] sm:bottom-3 sm:right-3 sm:h-10 sm:w-10"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </form>

            <div className="mt-4 flex max-w-2xl flex-wrap justify-center gap-2 lg:justify-start">
              {QUICK_PROMPTS.map(item => {
                const Icon = item.icon
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => goToChat(item.prompt)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/85 bg-card/78 px-3 text-xs font-light text-muted-foreground shadow-sm backdrop-blur-sm hover:border-primary/25 hover:bg-card hover:text-foreground sm:text-sm"
                  >
                    <Icon className="h-3.5 w-3.5 text-primary/80" />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-light text-muted-foreground lg:justify-start">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary/80" />
                不在首页收集出生信息
              </span>
              <span className="hidden h-3 w-px bg-border sm:inline-block" />
              <span>对话和人物资料只用于你的分析体验</span>
            </div>
          </div>

          <div className="relative min-h-40 overflow-hidden rounded-xl border border-border/55 bg-card/40 shadow-[0_18px_70px_oklch(0.245_0.012_255/0.12)] sm:min-h-[28rem] lg:min-h-[34rem]">
            <Image
              src="/landing/hero-kv.png"
              alt="粉色水晶球和柔和星图组成的卜卜象主视觉"
              fill
              className="object-cover"
              priority
            />
          </div>
        </div>
      </section>

      <section className="border-y border-border/55 bg-background/52">
        <div className="mx-auto grid max-w-6xl gap-0 px-4 sm:px-6 lg:grid-cols-3">
          {HOW_IT_WORKS.map((item, index) => (
            <div
              key={item.title}
              className={cn(
                "py-7 lg:px-6 lg:py-9",
                index > 0 && "border-t border-border/55 lg:border-l lg:border-t-0",
              )}
            >
              <p className="text-xs font-light text-primary">{item.label}</p>
              <h2 className="mt-3 text-xl font-light leading-tight text-foreground">{item.title}</h2>
              <p className="mt-3 text-sm font-light leading-6 text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {KV_SECTIONS.map((section, index) => (
        <section
          key={section.id}
          id={section.id}
          className="mx-auto grid max-w-6xl items-center gap-8 border-b border-border/55 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2"
        >
          <div className={cn("max-w-xl", index % 2 === 1 && "lg:order-2 lg:ml-auto")}>
            <p className="text-sm font-light text-primary">{section.kicker}</p>
            <h2 className="mt-3 text-3xl font-light leading-tight text-foreground sm:text-4xl">{section.title}</h2>
            <p className="mt-4 text-sm font-light leading-7 text-muted-foreground sm:text-base">{section.description}</p>
          </div>
          <div className="relative min-h-[16rem] overflow-hidden rounded-xl border border-border/55 bg-card/38 shadow-sm sm:min-h-[24rem]">
            <Image src={section.image} alt={section.alt} fill className="object-cover" />
          </div>
        </section>
      ))}

      <section className="mx-auto max-w-6xl border-b border-border/55 px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div id="定价" className="max-w-xl">
            <p className="text-sm font-light text-primary">能力入口</p>
            <h2 className="mt-3 text-3xl font-light leading-tight text-foreground sm:text-4xl">
              轻量先试，深度能力再消耗苹果。
            </h2>
            <p className="mt-4 text-sm font-light leading-7 text-muted-foreground sm:text-base">
              经典聊天和简洁 Agent 可先试用；结构化能力按当前配置每次消耗 1 个苹果。所有入口都会继续进入主 chat，而不是在首页收集个人信息。
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => goToChat("我第一次使用卜卜象，请先帮我判断适合从哪里开始")}
              className="mt-5 h-9 rounded-full border-primary/25 bg-card/72 px-4 text-sm font-light text-primary hover:bg-primary/8"
            >
              帮我选择入口
            </Button>
          </div>

          <div className="divide-y divide-border/55">
            {featureCards.map(item => {
              const Icon = FEATURE_ICONS[item.id]
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goToChat(FEATURE_PROMPTS[item.id])}
                  className="group grid w-full grid-cols-[auto_1fr] gap-4 py-5 text-left transition-colors hover:text-primary sm:grid-cols-[auto_1fr_auto]"
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-md border",
                      FEATURE_ACCENTS[item.id],
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-base font-medium text-foreground group-hover:text-primary">{item.title}</span>
                    <span className="mt-1 line-clamp-2 block text-sm font-light leading-6 text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                  <span className="hidden self-center text-xs font-light text-muted-foreground sm:block">进入主 chat</span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <footer id="关于" className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8 text-xs font-light text-muted-foreground sm:px-6 sm:py-10 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">卜卜象</p>
          <p className="mt-1">AI 陪伴 · 看见更多可能</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" />
            隐私安全优先
          </span>
          <span className="hidden h-3 w-px bg-border sm:inline-block" />
          <span>登录后保存聊天和人物档案</span>
          <span className="hidden h-3 w-px bg-border sm:inline-block" />
          <span className="inline-flex items-center gap-1.5">
            <LockKeyhole className="h-4 w-4" />
            出生信息只在需要命盘时填写
          </span>
        </div>
      </footer>

      <AuthDialog isOpen={showAuthDialog} onClose={() => setShowAuthDialog(false)} />
    </main>
  )
}
