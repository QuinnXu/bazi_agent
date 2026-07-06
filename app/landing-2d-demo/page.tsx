"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  BookOpen,
  BadgeCheck,
  CalendarRange,
  ChevronRight,
  Compass,
  Flame,
  HeartHandshake,
  ImageIcon,
  MousePointerClick,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Users,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type HeroMode = "avatar" | "logo" | "mixed"
type LessonId = "hepan" | "fortune" | "avatar" | "lifepath"

const HERO_MODES: Array<{
  id: HeroMode
  label: string
  note: string
}> = [
  { id: "avatar", label: "主图", note: "看新主视觉插图" },
  { id: "logo", label: "功能图", note: "看功能插图方向" },
  { id: "mixed", label: "组合", note: "主视觉和功能插图一起看" },
]

const LESSONS: Array<{
  id: LessonId
  order: string
  title: string
  subtitle: string
  prompt: string
  image: string
  icon: React.ElementType
  badge: string
  chips: string[]
  tone: "rose" | "gold" | "blue" | "teal"
}> = [
  {
    id: "hepan",
    order: "01",
    title: "合盘",
    subtitle: "关系、合作、相处节奏先放进同一张路径里。",
    prompt: "我想先看合盘和关系节奏，帮我整理开场信息",
    image: "/landing-2d-demo/hepan-poster-v3.png",
    icon: Users,
    badge: "推荐",
    chips: ["关系", "合作", "节奏"],
    tone: "rose",
  },
  {
    id: "fortune",
    order: "02",
    title: "运势",
    subtitle: "近期窗口、行动重点、要先观察什么。",
    prompt: "请帮我看本周运势和行动建议",
    image: "/landing-2d-demo/fortune-poster-v3.png",
    icon: CalendarRange,
    badge: "热度高",
    chips: ["近期", "趋势", "行动"],
    tone: "gold",
  },
  {
    id: "avatar",
    order: "03",
    title: "头像",
    subtitle: "气质、风格、第一眼记忆点。",
    prompt: "我想看头像气质和适合的视觉风格",
    image: "/landing-2d-demo/avatar-poster-v3.png",
    icon: ImageIcon,
    badge: "可开始",
    chips: ["气质", "审美", "风格"],
    tone: "blue",
  },
  {
    id: "lifepath",
    order: "04",
    title: "人生脉络",
    subtitle: "长期阶段、转折节点、下一步怎么走。",
    prompt: "我想看人生脉络和阶段重点",
    image: "/landing-2d-demo/lifepath-poster-v3.png",
    icon: Compass,
    badge: "深入",
    chips: ["阶段", "脉络", "长线"],
    tone: "teal",
  },
]

const QUICK_PROMPTS = [
  "先看今天的整体方向",
  "帮我整理合盘开场信息",
  "我想要头像气质建议",
  "给我一版人生脉络",
]

function buildTrialUrl(prompt: string) {
  const params = new URLSearchParams({
    from: "landing-2d-demo",
    prompt,
  })
  return `/?${params.toString()}`
}

function toneClasses(tone: (typeof LESSONS)[number]["tone"], active = false) {
  switch (tone) {
    case "rose":
      return active
        ? "border-primary/30 bg-primary/10 text-primary"
        : "border-primary/20 bg-primary/10 text-primary"
    case "gold":
      return active
        ? "border-[oklch(0.844_0.115_40.07/0.42)] bg-[oklch(0.844_0.115_40.07/0.14)] text-[oklch(0.53_0.105_40.07)]"
        : "border-[oklch(0.844_0.115_40.07/0.26)] bg-[oklch(0.844_0.115_40.07/0.10)] text-[oklch(0.53_0.105_40.07)]"
    case "blue":
      return active
        ? "border-[oklch(0.72_0.070_245/0.42)] bg-[oklch(0.72_0.070_245/0.14)] text-[oklch(0.52_0.090_245)]"
        : "border-[oklch(0.72_0.070_245/0.26)] bg-[oklch(0.72_0.070_245/0.09)] text-[oklch(0.52_0.090_245)]"
    case "teal":
      return active
        ? "border-[oklch(0.762_0.060_171.34/0.42)] bg-[oklch(0.762_0.060_171.34/0.14)] text-[oklch(0.43_0.075_171.34)]"
        : "border-[oklch(0.762_0.060_171.34/0.26)] bg-[oklch(0.762_0.060_171.34/0.10)] text-[oklch(0.43_0.075_171.34)]"
  }
}

function HeroScene({
  mode,
  lesson,
  onStart,
  onFocusPath,
}: {
  mode: HeroMode
  lesson: (typeof LESSONS)[number]
  onStart: (prompt: string) => void
  onFocusPath: () => void
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
      <div className="relative isolate overflow-hidden rounded-[2rem] border border-border/70 bg-[linear-gradient(180deg,oklch(0.996_0.003_80)_0%,oklch(0.986_0.006_80)_100%)] p-4 shadow-[0_24px_70px_oklch(0.245_0.012_255/0.08)] sm:p-6">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(135deg,rgba(231,111,154,0.06),transparent_42%,rgba(246,193,119,0.08)_72%,transparent_100%)]" />
        <div className="absolute inset-x-0 top-0 -z-10 h-14 bg-[linear-gradient(180deg,rgba(255,255,255,0.75),transparent)]" />
        <div className="absolute left-4 top-4 flex items-center gap-2 text-primary/55 sm:left-6 sm:top-6">
          <Sparkles className="h-4 w-4" />
          <Sparkles className="h-3 w-3" />
        </div>
        <div className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm sm:right-6 sm:top-6">
          <Flame className="h-3.5 w-3.5 text-primary" />
          连续 12 天
        </div>

        {mode === "avatar" ? (
          <div className="grid gap-4 pt-6 lg:grid-cols-[minmax(0,1.12fr)_minmax(12rem,0.88fr)] lg:items-end">
            <div className="relative aspect-square overflow-hidden rounded-[2rem] border border-primary/16 bg-[#fff1f0]">
              <Image
                src="/landing-2d-demo/hero-poster-v3.png"
                alt="卜卜象新主视觉插图"
                fill
                priority
                sizes="(min-width: 1024px) 50vw, 92vw"
                className="object-contain p-2"
              />
              <span className="absolute left-4 top-4 inline-flex items-center rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-medium text-primary shadow-sm">
                新主视觉
              </span>
              <span className="absolute bottom-4 right-4 inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-medium text-foreground/75 shadow-sm">
                <Star className="h-3.5 w-3.5 text-accent" />
                亲和
              </span>
            </div>

            <div className="flex min-w-0 flex-col justify-between gap-5 border-t border-border/60 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">今日预览</p>
                <h2 className="mt-2 text-3xl font-semibold leading-tight text-foreground sm:text-[2.15rem]">
                  用新插图把角色和路径讲清楚
                </h2>
                <p className="mt-3 max-w-[30rem] text-sm leading-6 text-muted-foreground sm:text-base">
                  {lesson.subtitle}
                </p>
              </div>

              <dl className="grid grid-cols-3 gap-3">
                <div className="border-t border-border/60 pt-3">
                  <dt className="text-xs font-medium text-muted-foreground">路径</dt>
                  <dd className="mt-1 text-base font-semibold text-foreground">4 个入口</dd>
                </div>
                <div className="border-t border-border/60 pt-3">
                  <dt className="text-xs font-medium text-muted-foreground">状态</dt>
                  <dd className="mt-1 text-base font-semibold text-foreground">可直接开始</dd>
                </div>
                <div className="border-t border-border/60 pt-3">
                  <dt className="text-xs font-medium text-muted-foreground">视觉</dt>
                  <dd className="mt-1 text-base font-semibold text-foreground">2D 版</dd>
                </div>
              </dl>

              <div className="space-y-3">
                <div className={cn("rounded-[1.35rem] border px-4 py-3", toneClasses(lesson.tone, true))}>
                  <div className="flex items-start gap-3">
                    <lesson.icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{lesson.prompt}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">当前提示</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    onClick={() => onStart(lesson.prompt)}
                    className="h-11 rounded-full px-5 text-sm font-medium shadow-[0_16px_34px_oklch(0.696_0.137_3.34/0.22)]"
                  >
                    开始这一课
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onFocusPath}
                    className="h-11 rounded-full border-border/70 bg-white/80 px-5 text-sm font-medium text-foreground/80 shadow-sm"
                  >
                    看下方路径
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {mode === "logo" ? (
          <div className="grid gap-4 pt-6 lg:grid-cols-[minmax(16rem,0.98fr)_minmax(0,1.02fr)] lg:items-center">
            <div className="relative mx-auto aspect-square w-full max-w-[24rem] overflow-hidden rounded-[2rem] border border-border/70 bg-[#fff1f0] shadow-[0_22px_60px_oklch(0.245_0.012_255/0.08)]">
              <Image src={lesson.image} alt={`${lesson.title}新插图`} fill priority sizes="(min-width: 1024px) 35vw, 86vw" className="object-cover" />
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">插图层</p>
                <h2 className="mt-2 text-3xl font-semibold leading-tight text-foreground sm:text-[2.15rem]">每个功能都有一张新插图</h2>
                <p className="mt-3 max-w-[32rem] text-sm leading-6 text-muted-foreground sm:text-base">
                  让角色在不同场景里说明功能，再把四个入口挂到同一条节奏线上。
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.4rem] border border-border/70 bg-white/80 p-4">
                  <div className="flex items-center gap-3">
                    <Image src="/landing-2d-demo/hepan-poster-v3.png" alt="合盘新插图" width={56} height={56} className="h-14 w-14 shrink-0 rounded-[1.1rem] border border-border/50 bg-white object-cover" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">合盘场景</p>
                      <p className="text-xs leading-5 text-muted-foreground">关系星图和连接感。</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-[1.4rem] border border-border/70 bg-white/80 p-4">
                  <div className="flex items-center gap-3">
                    <Image src="/landing-2d-demo/fortune-poster-v3.png" alt="运势新插图" width={56} height={56} className="h-14 w-14 shrink-0 rounded-[1.1rem] border border-border/50 bg-white object-cover" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">运势场景</p>
                      <p className="text-xs leading-5 text-muted-foreground">日程和时机感。</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" onClick={() => onStart(lesson.prompt)} className="h-11 rounded-full px-5 text-sm font-medium">
                  看这一条路径
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onFocusPath}
                  className="h-11 rounded-full border-border/70 bg-white/80 px-5 text-sm font-medium text-foreground/80 shadow-sm"
                >
                  往下看卡片
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {mode === "mixed" ? (
          <div className="grid gap-4 pt-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(16rem,0.92fr)] lg:items-center">
            <div className="relative aspect-square overflow-hidden rounded-[2rem] border border-border/70 bg-[#fff1f0]">
              <Image src="/landing-2d-demo/hero-poster-v3.png" alt="卜卜象新主视觉插图" fill priority sizes="(min-width: 1024px) 50vw, 92vw" className="object-cover" />
              <span className="absolute left-4 top-4 inline-flex items-center rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-medium text-primary shadow-sm">
                新插图
              </span>
              <span className="absolute bottom-4 left-4 inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-medium text-foreground/75 shadow-sm">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                安静、温柔
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-[1.4rem] border border-border/70 bg-white/80 p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <Image src="/landing-2d-demo/hepan-poster-v3.png" alt="合盘新插图" width={64} height={64} className="h-16 w-16 shrink-0 rounded-[1rem] border border-border/50 bg-white object-cover" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">合盘新插图</p>
                    <p className="text-xs leading-5 text-muted-foreground">关系星图场景。</p>
                  </div>
                </div>
              </div>
              <div className="rounded-[1.4rem] border border-border/70 bg-white/80 p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <Image src="/landing-2d-demo/fortune-poster-v3.png" alt="运势新插图" width={64} height={64} className="h-16 w-16 shrink-0 rounded-[1rem] border border-border/50 bg-white object-cover" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">运势新插图</p>
                    <p className="text-xs leading-5 text-muted-foreground">日历和时机感。</p>
                  </div>
                </div>
              </div>
              <div className="rounded-[1.4rem] border border-border/70 bg-white/80 p-4 shadow-sm sm:col-span-2 lg:col-span-1">
                <div className="flex items-center gap-3">
                  <Image src="/landing-2d-demo/avatar-poster-v3.png" alt="头像新插图" width={64} height={64} className="h-16 w-16 shrink-0 rounded-[1rem] border border-border/50 bg-white object-cover" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">头像新插图</p>
                    <p className="text-xs leading-5 text-muted-foreground">风格工作台场景。</p>
                  </div>
                </div>
              </div>
              <div className="flex items-end justify-between rounded-[1.4rem] border border-border/70 bg-[linear-gradient(180deg,rgba(231,111,154,0.08),rgba(255,255,255,0.85))] p-4 sm:col-span-2 lg:col-span-1">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">路径卡</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{lesson.title} 路径</p>
                </div>
                <Button type="button" size="icon" onClick={() => onStart(lesson.prompt)} className="rounded-full">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col rounded-[2rem] border border-border/70 bg-card/80 p-4 shadow-[0_24px_70px_oklch(0.245_0.012_255/0.08)] sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium", toneClasses(lesson.tone, true))}>
            <lesson.icon className="h-3.5 w-3.5" />
            {lesson.badge}
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/80 px-3 py-1 text-xs font-medium text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5" />
            今日 1/4
          </div>
        </div>

        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">当前关卡</p>
          <h2 className="mt-2 text-3xl font-semibold leading-tight text-foreground sm:text-[2.1rem]">{lesson.title}</h2>
          <p className="mt-3 max-w-[28rem] text-sm leading-6 text-muted-foreground sm:text-base">{lesson.subtitle}</p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[1.25rem] border border-border/70 bg-white/80 p-4">
            <p className="text-xs font-medium text-muted-foreground">节奏</p>
            <p className="mt-2 text-lg font-semibold text-foreground">顺手进入</p>
          </div>
          <div className="rounded-[1.25rem] border border-border/70 bg-white/80 p-4">
            <p className="text-xs font-medium text-muted-foreground">重点</p>
            <p className="mt-2 text-lg font-semibold text-foreground">先看入口</p>
          </div>
          <div className="rounded-[1.25rem] border border-border/70 bg-white/80 p-4">
            <p className="text-xs font-medium text-muted-foreground">状态</p>
            <p className="mt-2 text-lg font-semibold text-foreground">可继续</p>
          </div>
        </div>

        <div className="mt-6 space-y-4 border-t border-border/60 pt-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {lesson.chips.map(chip => (
              <div key={chip} className={cn("flex items-center gap-2 rounded-[1.15rem] border px-3 py-3 text-sm font-medium", toneClasses(lesson.tone, false))}>
                <BadgeCheck className="h-4 w-4 shrink-0" />
                <span className="truncate">{chip}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 rounded-[1.2rem] border border-border/70 bg-white/80 px-4 py-3">
            <MousePointerClick className="h-4 w-4 shrink-0 text-primary" />
            <p className="min-w-0 text-sm font-medium text-foreground/85">{lesson.prompt}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={() => onStart(lesson.prompt)} className="h-11 flex-1 rounded-full px-5 text-sm font-medium">
            进入正式流程
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onFocusPath}
            className="h-11 rounded-full border-border/70 bg-white/80 px-5 text-sm font-medium text-foreground/80 shadow-sm"
          >
            跳到路径
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function Landing2DDemoPage() {
  const router = useRouter()
  const pathRef = useRef<HTMLElement | null>(null)
  const [heroMode, setHeroMode] = useState<HeroMode>("mixed")
  const [activeLessonId, setActiveLessonId] = useState<LessonId>("avatar")
  const [prompt, setPrompt] = useState("")

  useEffect(() => {
    document.title = "卜卜象 - 2D 路径预览"
  }, [])

  const activeLesson = LESSONS.find(item => item.id === activeLessonId) ?? LESSONS[0]

  const navigateToChat = (nextPrompt: string) => {
    const nextUrl = buildTrialUrl(nextPrompt)
    const navigate = () => router.push(nextUrl)

    if (typeof document !== "undefined" && "startViewTransition" in document) {
      ;(document as Document & { startViewTransition: (callback: () => void) => void }).startViewTransition(navigate)
      return
    }

    navigate()
  }

  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-[linear-gradient(180deg,oklch(0.995_0.003_80)_0%,oklch(0.986_0.006_80)_42%,oklch(0.978_0.009_80)_100%)] text-foreground">
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,transparent_0%,transparent_49.5%,oklch(0.89_0.012_80/0.36)_49.5%,oklch(0.89_0.012_80/0.36)_50.5%,transparent_50.5%,transparent_100%),linear-gradient(180deg,transparent_0%,transparent_49.5%,oklch(0.89_0.012_80/0.22)_49.5%,oklch(0.89_0.012_80/0.22)_50.5%,transparent_50.5%,transparent_100%)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,rgba(0,0,0,0.78),transparent)]" />

      <header className="sticky top-0 z-30 border-b border-border/55 bg-[oklch(0.992_0.004_80/0.88)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <button type="button" onClick={() => navigateToChat(activeLesson.prompt)} className="flex min-w-0 items-center gap-3 text-left">
            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border/60 bg-white shadow-sm">
              <Image src="/logo.jpg" alt="卜卜象 logo" fill priority className="object-contain p-1" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold leading-tight text-foreground">卜卜象</span>
              <span className="block truncate text-xs font-medium tracking-wide text-muted-foreground">2D 路径预览</span>
            </span>
          </button>

          <div className="hidden items-center rounded-full border border-border/70 bg-white/80 p-1 shadow-sm md:flex">
            {HERO_MODES.map(item => {
              const active = item.id === heroMode
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setHeroMode(item.id)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition",
                    active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/72 hover:bg-muted"
                  )}
                  title={item.note}
                >
                  {item.label}
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => pathRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="hidden h-10 rounded-full border-border/70 bg-white/80 px-4 text-sm font-medium text-foreground/78 shadow-sm sm:inline-flex"
            >
              看路径
            </Button>
            <Button type="button" onClick={() => navigateToChat(activeLesson.prompt)} className="h-10 rounded-full px-4 text-sm font-medium sm:px-5">
              进入正式流程
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <section className="border-b border-border/55">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:py-10">
          <HeroScene
            mode={heroMode}
            lesson={activeLesson}
            onStart={navigateToChat}
            onFocusPath={() => pathRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
        </div>
      </section>

      <section ref={pathRef} id="path" className="border-b border-border/55 bg-[linear-gradient(180deg,oklch(0.989_0.004_80)_0%,oklch(0.984_0.006_80)_100%)]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-primary/14 bg-white/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                <Trophy className="h-3.5 w-3.5 text-accent" />
                四条路径
              </p>
              <h2 className="mt-3 text-2xl font-semibold leading-tight text-foreground sm:text-3xl">像走关卡一样，把功能排成一条路</h2>
            </div>
            <Button type="button" variant="outline" onClick={() => setActiveLessonId("hepan")} className="h-11 rounded-full border-border/70 bg-white/80 px-5 text-sm font-medium text-foreground/78 shadow-sm">
              从头开始
              <BookOpen className="h-4 w-4" />
            </Button>
          </div>

          <div className="relative mt-7">
            <div className="absolute left-6 top-0 h-full w-px bg-gradient-to-b from-primary/25 via-border/70 to-transparent md:left-8" />
            <div className="grid gap-4 lg:grid-cols-2">
              {LESSONS.map((lesson, index) => {
                const active = lesson.id === activeLessonId
                return (
                  <button
                    key={lesson.id}
                    type="button"
                    onClick={() => setActiveLessonId(lesson.id)}
                    className={cn(
                      "group relative flex w-full items-start gap-4 rounded-[1.6rem] border p-4 text-left shadow-sm outline-none transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/40",
                      active ? "border-primary/30 bg-primary/10" : "border-border/70 bg-white/80"
                    )}
                  >
                    <div className={cn("relative z-10 flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[1.1rem] border bg-white shadow-sm", toneClasses(lesson.tone, active))}>
                      <Image src={lesson.image} alt={lesson.title} fill sizes="56px" loading="eager" className="object-contain p-1.5" />
                      <span className="sr-only">{lesson.title}</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-semibold tracking-[0.12em]", toneClasses(lesson.tone, active))}>
                          {lesson.order}
                        </span>
                        <span className="text-base font-semibold text-foreground">{lesson.title}</span>
                        <span className={cn("inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-medium", toneClasses(lesson.tone, active))}>
                          {lesson.badge}
                        </span>
                      </div>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{lesson.subtitle}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {lesson.chips.map(chip => (
                          <span key={chip} className={cn("inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium", toneClasses(lesson.tone, active))}>
                            {chip}
                          </span>
                        ))}
                      </div>
                    </div>

                    <ChevronRight className={cn("mt-1 h-5 w-5 shrink-0 transition", active ? "text-primary" : "text-muted-foreground/60 group-hover:text-foreground")} />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[linear-gradient(180deg,oklch(0.986_0.006_80)_0%,oklch(0.992_0.004_80)_100%)]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
            <form
              onSubmit={event => {
                event.preventDefault()
                navigateToChat(prompt.trim() || activeLesson.prompt)
              }}
              className="min-w-0"
            >
              <div className="rounded-[1.6rem] border border-border/70 bg-white/80 p-4 shadow-[0_16px_40px_oklch(0.245_0.012_255/0.07)] sm:p-5">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  试一条
                </div>
                <textarea
                  value={prompt}
                  onChange={event => setPrompt(event.target.value)}
                  placeholder={activeLesson.prompt}
                  rows={2}
                  className="mt-3 min-h-24 w-full resize-none bg-transparent text-base leading-7 text-foreground outline-none placeholder:text-muted-foreground/70"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map(item => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setPrompt(item)}
                      className="inline-flex h-8 items-center rounded-full border border-border/70 bg-white px-3 text-xs font-medium text-foreground/78 shadow-sm transition hover:border-primary/30 hover:text-foreground"
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <HeartHandshake className="h-3.5 w-3.5 text-accent" />
                    试一句
                  </div>
                  <Button type="submit" className="h-11 rounded-full px-5 text-sm font-medium">
                    开始分析
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </form>

            <div className="flex flex-col gap-3 rounded-[1.6rem] border border-border/70 bg-card/80 p-4 shadow-[0_16px_40px_oklch(0.245_0.012_255/0.07)] sm:p-5">
              <div className="flex items-center gap-3">
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-border/60 bg-white">
                  <Image src="/landing-2d-demo/hero-poster-v3.png" alt="卜卜象新主视觉缩略图" fill className="object-cover" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">卜卜象</p>
                  <p className="truncate text-xs text-muted-foreground">新插图和路径都能先看一眼。</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-[1.15rem] border border-border/70 bg-white/80 p-3">
                  <p className="text-xs font-medium text-muted-foreground">页面风格</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">2D 预览</p>
                </div>
                <div className="rounded-[1.15rem] border border-border/70 bg-white/80 p-3">
                  <p className="text-xs font-medium text-muted-foreground">主视觉</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">新插图</p>
                </div>
                <div className="rounded-[1.15rem] border border-border/70 bg-white/80 p-3">
                  <p className="text-xs font-medium text-muted-foreground">节奏</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">像关卡</p>
                </div>
                <div className="rounded-[1.15rem] border border-border/70 bg-white/80 p-3">
                  <p className="text-xs font-medium text-muted-foreground">入口</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">可直接试</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex h-7 items-center rounded-full border border-primary/16 bg-primary/10 px-3 text-xs font-medium text-primary">
                  <Flame className="mr-1.5 h-3.5 w-3.5" />
                  12 天
                </span>
                <span className="inline-flex h-7 items-center rounded-full border border-border/70 bg-white px-3 text-xs font-medium text-foreground/75">
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5 text-primary" />
                  轻量进入
                </span>
                <span className="inline-flex h-7 items-center rounded-full border border-border/70 bg-white px-3 text-xs font-medium text-foreground/75">
                  <Trophy className="mr-1.5 h-3.5 w-3.5 text-accent" />
                  4 条路径
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
