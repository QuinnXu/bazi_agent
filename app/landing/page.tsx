"use client"

import React, { useMemo, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  CalendarRange,
  ChevronRight,
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
import { buildFeatureCardItems } from "@/lib/bubu-content"
import { GUEST_FIRST_QA_FLOW } from "@/lib/guest-first-qa-flow"
import type { FeatureKind } from "@/lib/feature-types"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { label: "开始", href: "#start" },
  { label: "功能", href: "#features" },
  { label: "路径", href: "#path" },
  { label: "边界", href: "#safety" },
] as const

const QUICK_PROMPTS = [
  { label: "今日运势", prompt: "请帮我看看今天的整体运势和行动建议", icon: Sparkles },
  { label: "事业节奏", prompt: "我想看看近期事业发展和职业选择建议", icon: CalendarRange },
  { label: "关系相处", prompt: "请帮我分析一段关系里的相处节奏和磨合点", icon: HeartHandshake },
  { label: "性格画像", prompt: "请帮我做一份性格画像和成长建议", icon: UserRound },
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

const FEATURE_STYLES: Record<FeatureKind, string> = {
  hepan: "border-primary/22 bg-primary/10 text-primary",
  fortune: "border-accent/36 bg-accent/18 text-[oklch(0.53_0.105_40.07)]",
  avatar: "border-[oklch(0.72_0.070_245)]/34 bg-[oklch(0.72_0.070_245)]/13 text-[oklch(0.52_0.090_245)]",
  lifepath: "border-[oklch(0.762_0.060_171.34)]/36 bg-[oklch(0.762_0.060_171.34)]/16 text-[oklch(0.43_0.075_171.34)]",
}

const FEATURE_DETAILS: Record<
  FeatureKind,
  { image: string; line: string; cta: string; imageAlt: string }
> = {
  hepan: {
    image: "/landing/bubu-theme-relationship.png",
    line: "关系、合作、相处节奏。",
    cta: "看关系",
    imageAlt: "卜卜象关系合盘主题图",
  },
  fortune: {
    image: "/landing/bubu-theme-fortune.png",
    line: "近期窗口、行动节奏。",
    cta: "看运势",
    imageAlt: "卜卜象近期运势主题图",
  },
  avatar: {
    image: "/landing/bubu-theme-avatar.png",
    line: "头像气质、风格建议。",
    cta: "看头像",
    imageAlt: "卜卜象头像分析主题图",
  },
  lifepath: {
    image: "/landing/bubu-theme-lifepath.png",
    line: "长期阶段、人生地图。",
    cta: "看脉络",
    imageAlt: "卜卜象人生脉络主题图",
  },
}

const PATH_STEPS = GUEST_FIRST_QA_FLOW.copy.tutorialSteps

const SAFETY_POINTS = [
  { text: "首页不收集出生信息", icon: LockKeyhole },
  { text: "只给趋势与参考", icon: ShieldCheck },
  { text: "重要问题回到专业意见", icon: HeartHandshake },
] as const

export default function LandingPage() {
  const router = useRouter()
  const [prompt, setPrompt] = useState("")
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const featureCards = useMemo(() => buildFeatureCardItems(), [])

  const buildTrialUrl = (nextPrompt?: string) => {
    const value = (nextPrompt ?? prompt).trim()
    const params = new URLSearchParams({
      from: "landing",
      trialFlow: GUEST_FIRST_QA_FLOW.id,
    })
    if (value) params.set("prompt", value)
    return `/?${params.toString()}`
  }

  const goToChat = (nextPrompt?: string) => {
    const nextUrl = buildTrialUrl(nextPrompt)
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
    <main className="relative min-h-dvh overflow-x-hidden bg-[oklch(0.985_0.006_82)] text-foreground">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,oklch(0.945_0.032_6.5)_0%,transparent_34%),linear-gradient(180deg,oklch(0.995_0.003_82)_0%,oklch(0.982_0.006_82)_54%,oklch(0.962_0.012_250)_100%)]" />
      <div className="absolute inset-x-0 top-0 -z-10 h-[42rem] opacity-45 [background-image:linear-gradient(to_right,oklch(0.84_0.010_250/0.42)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.84_0.010_250/0.34)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />

      <header className="sticky top-0 z-30 border-b border-border/55 bg-[oklch(0.985_0.006_82/0.82)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-3 sm:gap-3 sm:px-6">
          <button
            type="button"
            onClick={() => goToChat()}
            className="flex min-w-0 items-center gap-3 text-left"
            aria-label="回到卜卜象聊天"
          >
            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-foreground/10 bg-card shadow-sm">
              <Image src="/logo.jpg" alt="卜卜象" fill className="object-contain" priority />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold leading-tight text-foreground">卜卜象</span>
              <span className="block truncate text-xs font-light text-muted-foreground">AI 命理分析</span>
            </span>
          </button>

          <nav className="hidden items-center gap-7 text-sm text-foreground/72 lg:flex">
            {NAV_ITEMS.map(item => (
              <a key={item.label} href={item.href} className="hover:text-foreground">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAuthDialog(true)}
              className="hidden h-9 rounded-full border-foreground/12 bg-card/70 px-3 text-sm font-light text-foreground/74 shadow-sm hover:bg-card sm:inline-flex sm:px-5"
            >
              登录
            </Button>
            <Button
              type="button"
              onClick={() => goToChat()}
              className="h-9 rounded-full border border-primary/30 bg-primary px-3 text-sm font-light text-primary-foreground shadow-[0_12px_28px_oklch(0.696_0.137_3.34/0.18)] hover:bg-primary/92 sm:px-5"
            >
              免费先看
              <Sparkles className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <section id="start" className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-14 pt-10 sm:px-6 sm:pb-18 sm:pt-14 lg:grid-cols-[minmax(19rem,0.92fr)_minmax(0,1.08fr)] lg:items-center lg:pb-20 lg:pt-18">
        <div className="mx-auto w-full max-w-[34rem] lg:mx-0">
          <div className="relative mx-auto aspect-square w-full max-w-[30rem] overflow-hidden rounded-[2rem] border border-primary/14 bg-card/72 shadow-[0_28px_90px_oklch(0.245_0.012_255/0.13)] lg:max-w-none">
            <Image
              src="/landing/bubu-theme-question.png"
              alt="卜卜象引导问题进入分析路径"
              fill
              sizes="(min-width: 1024px) 44vw, 92vw"
              className="object-cover"
              priority
              unoptimized
            />
          </div>
        </div>

        <div className="mx-auto w-full max-w-2xl text-center lg:mx-0 lg:text-left">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/18 bg-card/76 px-3 py-1 text-sm font-light text-muted-foreground shadow-sm backdrop-blur-sm">
            <span className="relative h-5 w-5 overflow-hidden rounded-full">
              <Image src="/avatar-small.png" alt="卜卜象头像" fill className="object-contain" priority />
            </span>
            {GUEST_FIRST_QA_FLOW.copy.landing.badge}
          </p>

          <h1 className="mt-5 text-4xl font-light leading-[1.08] tracking-normal text-foreground sm:text-6xl lg:text-7xl">
            {GUEST_FIRST_QA_FLOW.copy.landing.headlineLead}
            <span className="block text-primary">{GUEST_FIRST_QA_FLOW.copy.landing.headlineAccent}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[19rem] text-sm font-light leading-6 text-muted-foreground sm:max-w-[32rem] sm:text-lg sm:leading-7 lg:mx-0">
            {GUEST_FIRST_QA_FLOW.copy.landing.description}
          </p>

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
            <Button
              type="button"
              onClick={() => goToChat("我第一次使用卜卜象，请先帮我判断适合从哪里开始")}
              className="h-12 w-full rounded-full border border-primary/30 bg-primary px-7 text-base font-light text-primary-foreground shadow-[0_16px_34px_oklch(0.696_0.137_3.34/0.22)] hover:bg-primary/92 sm:w-auto"
            >
              {GUEST_FIRST_QA_FLOW.copy.landing.primaryCta}
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAuthDialog(true)}
              className="h-12 w-full rounded-full border-foreground/12 bg-card/72 px-7 text-base font-light text-foreground/78 shadow-sm hover:bg-card sm:w-auto"
            >
              {GUEST_FIRST_QA_FLOW.copy.landing.secondaryCta}
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="mx-auto mt-6 w-full max-w-2xl min-w-0 lg:mx-0">
            <div className="relative min-h-24 rounded-2xl border border-primary/24 bg-card/92 p-4 pb-13 shadow-[0_22px_70px_oklch(0.245_0.012_255/0.10)] backdrop-blur-xl [view-transition-name:bubu-composer] focus-within:border-primary/58">
              <textarea
                value={prompt}
                onChange={event => setPrompt(event.target.value)}
                placeholder={GUEST_FIRST_QA_FLOW.copy.landing.inputPlaceholder}
                rows={2}
                className="min-h-12 w-full resize-none bg-transparent pr-1 text-sm font-light leading-6 text-foreground outline-none placeholder:text-muted-foreground/70 focus:outline-none sm:text-base"
              />
              <Button
                type="submit"
                size="icon"
                aria-label="发送给卜卜象"
                className="absolute bottom-3 right-3 h-10 w-10 rounded-full shadow-[0_12px_28px_oklch(0.696_0.137_3.34/0.22)]"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>

          <div className="mx-auto mt-3 flex w-full max-w-2xl flex-wrap justify-center gap-2 lg:mx-0 lg:justify-start">
            {GUEST_FIRST_QA_FLOW.copy.landing.trialPoints.map(item => (
              <span
                key={item}
                className="inline-flex h-7 items-center rounded-full border border-primary/14 bg-card/70 px-3 text-xs font-light text-muted-foreground shadow-sm backdrop-blur-sm"
              >
                {item}
              </span>
            ))}
          </div>

          <div className="mx-auto mt-4 flex w-full max-w-[19.5rem] flex-wrap justify-center gap-2 sm:max-w-2xl lg:mx-0 lg:justify-start">
            {QUICK_PROMPTS.map(item => {
              const Icon = item.icon
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => goToChat(item.prompt)}
                  className="inline-flex h-9 basis-[calc(50%-0.25rem)] items-center justify-center gap-1.5 rounded-full border border-foreground/10 bg-card/74 px-2 text-xs font-light text-muted-foreground shadow-sm backdrop-blur-sm hover:border-foreground/18 hover:bg-card hover:text-foreground sm:basis-auto sm:px-3 sm:text-sm"
                >
                  <Icon className="h-3.5 w-3.5 text-primary/76" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <section id="features" className="border-y border-border/60 bg-[oklch(0.994_0.003_82/0.58)]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-light text-primary">功能就是品牌</p>
            <h2 className="mt-3 text-3xl font-light leading-tight text-foreground sm:text-5xl">
              想看的事，直接选。
            </h2>
          </div>

          <div className="mt-9 grid gap-4 md:grid-cols-2">
            {featureCards.map(item => {
              const Icon = FEATURE_ICONS[item.id]
              const detail = FEATURE_DETAILS[item.id]
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goToChat(FEATURE_PROMPTS[item.id])}
                  className="group grid min-w-0 grid-cols-[7.5rem_minmax(0,1fr)] gap-4 rounded-[1.5rem] border border-foreground/10 bg-card/88 p-3 text-left shadow-[0_18px_60px_oklch(0.245_0.012_255/0.08)] transition hover:-translate-y-0.5 hover:border-primary/24 hover:shadow-[0_24px_70px_oklch(0.245_0.012_255/0.12)] sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:p-4"
                >
                  <span className="relative aspect-square min-w-0 overflow-hidden rounded-[1.15rem] bg-[oklch(0.985_0.004_82)]">
                    <Image src={detail.image} alt={detail.imageAlt} fill sizes="180px" className="object-cover" unoptimized />
                  </span>
                  <span className="flex min-w-0 flex-col justify-center py-1">
                    <span className={cn("flex h-9 w-9 items-center justify-center rounded-full border", FEATURE_STYLES[item.id])}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="mt-3 text-xl font-medium leading-tight text-foreground group-hover:text-primary">
                      {item.title}
                    </span>
                    <span className="mt-2 text-sm font-light leading-6 text-muted-foreground">{detail.line}</span>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                      {detail.cta}
                      <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <section id="path" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18">
        <div className="grid gap-8 lg:grid-cols-[0.84fr_1.16fr] lg:items-center">
          <div className="max-w-xl">
            <p className="text-sm font-light text-primary">像陪练一样推进</p>
            <h2 className="mt-3 text-3xl font-light leading-tight text-foreground sm:text-4xl lg:text-5xl">
              不是填表，是一步步说清楚。
            </h2>
            <p className="mt-4 text-base font-light leading-7 text-muted-foreground">
              首页先不收集出生信息。需要命盘时，小象再提醒你补。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            {PATH_STEPS.map((step, index) => (
              <div
                key={step.label}
                className="relative overflow-hidden rounded-[1.4rem] border border-foreground/10 bg-card/82 p-4 shadow-sm"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/18 bg-primary/10 text-lg font-medium text-primary">
                  {step.label}
                </span>
                <p className="mt-5 text-base font-light leading-6 text-foreground">{step.title}</p>
                <p className="mt-2 min-h-12 text-xs font-light leading-5 text-muted-foreground">{step.description}</p>
                <p className="mt-4 text-xs font-light text-muted-foreground">0{index + 1}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="safety" className="border-y border-border/60 bg-[oklch(0.970_0.004_82/0.62)]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-sm font-light text-primary">温柔也要有边界</p>
            <h2 className="mt-3 text-3xl font-light leading-tight text-foreground sm:text-5xl">
              给参考，不替你下结论。
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {SAFETY_POINTS.map(item => {
              const Icon = item.icon
              return (
                <div key={item.text} className="rounded-[1.25rem] border border-foreground/10 bg-card/76 p-4 shadow-sm">
                  <Icon className="h-5 w-5 text-primary" />
                  <p className="mt-4 text-sm font-light leading-6 text-muted-foreground">{item.text}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18">
        <div className="grid gap-6 rounded-[1.75rem] border border-primary/18 bg-card/86 p-6 shadow-[0_22px_80px_oklch(0.245_0.012_255/0.10)] sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
          <div className="max-w-2xl">
            <p className="text-sm font-light text-primary">{GUEST_FIRST_QA_FLOW.copy.landing.finalCtaEyebrow}</p>
            <h2 className="mt-2 text-2xl font-light leading-tight text-foreground sm:text-4xl">
              {GUEST_FIRST_QA_FLOW.copy.landing.finalCtaTitle}
            </h2>
          </div>
          <Button
            type="button"
            onClick={() => goToChat()}
            className="h-11 w-fit rounded-full border border-primary/30 bg-primary px-6 text-sm font-light text-primary-foreground shadow-[0_12px_28px_oklch(0.696_0.137_3.34/0.18)] hover:bg-primary/92"
          >
            {GUEST_FIRST_QA_FLOW.copy.landing.primaryCta}
            <Sparkles className="h-4 w-4" />
          </Button>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-xs font-light text-muted-foreground sm:px-6 sm:py-10 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">卜卜象</p>
          <p className="mt-1">AI 命理分析 · 看见更多可能</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" />
            隐私优先
          </span>
          <span className="hidden h-3 w-px bg-border sm:inline-block" />
          <span>登录后保存上下文</span>
        </div>
      </footer>

      <AuthDialog isOpen={showAuthDialog} onClose={() => setShowAuthDialog(false)} />
    </main>
  )
}
