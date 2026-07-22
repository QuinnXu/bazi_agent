"use client"

import Image from "next/image"
import { Apple, Loader2 } from "lucide-react"
import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  BUBU_LOADING_CUES,
  type BubuLoadingCue as BubuLoadingCueItem,
  type BubuLoadingScenario,
} from "@/lib/bubu-content"
import { playRitualFeedback } from "@/lib/ritual-feedback"

const APPEAR_DELAY_MS = 150
const ROTATION_INTERVAL_MS = 2800
const COMPLETION_PULSE_MS = 600

function isRepeatedEasterEgg(previous: BubuLoadingCueItem, next: BubuLoadingCueItem): boolean {
  return previous.visual !== "default" && previous.visual === next.visual
}
function shuffleCues(cues: readonly BubuLoadingCueItem[]): BubuLoadingCueItem[] {
  const result = [...cues]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }

  for (let index = 1; index < result.length; index += 1) {
    if (!isRepeatedEasterEgg(result[index - 1], result[index])) continue
    const swapIndex = result.findIndex((candidate, candidateIndex) => (
      candidateIndex > index && !isRepeatedEasterEgg(result[index - 1], candidate)
    ))
    if (swapIndex > index) {
      ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
    }
  }

  return result
}

function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const updatePreference = () => setReducedMotion(query.matches)
    updatePreference()
    query.addEventListener("change", updatePreference)
    return () => query.removeEventListener("change", updatePreference)
  }, [])

  return reducedMotion
}

export function useBubuCompletionCue({
  active,
  completed,
  hasContent,
  feedbackEnabled,
}: {
  active: boolean
  completed: boolean
  hasContent: boolean
  feedbackEnabled: boolean
}): boolean {
  const wasActiveRef = useRef(active)
  const feedbackEnabledRef = useRef(feedbackEnabled)
  const [completionPulse, setCompletionPulse] = useState(false)

  useEffect(() => {
    feedbackEnabledRef.current = feedbackEnabled
  }, [feedbackEnabled])

  useEffect(() => {
    const justCompleted = wasActiveRef.current && !active && completed && hasContent
    wasActiveRef.current = active
    if (!justCompleted) return

    setCompletionPulse(true)
    if (feedbackEnabledRef.current) void playRitualFeedback()
    const timer = window.setTimeout(() => setCompletionPulse(false), COMPLETION_PULSE_MS)
    return () => window.clearTimeout(timer)
  }, [active, completed, hasContent])

  return completionPulse
}

function CueVisual({ cue, reducedMotion }: { cue: BubuLoadingCueItem; reducedMotion: boolean }) {
  if (cue.visual === "apple") {
    return (
      <Apple
        aria-hidden="true"
        className={`h-5 w-5 fill-red-500 text-red-600 ${reducedMotion ? "" : "bubu-loading-apple"}`}
      />
    )
  }

  if (cue.visual === "elephant") {
    return (
      <span className={`block h-7 w-7 overflow-hidden rounded-full ${reducedMotion ? "" : "bubu-loading-elephant"}`}>
        <Image
          src="/avatar-small.png"
          alt=""
          width={28}
          height={28}
          className="h-full w-full object-cover"
        />
      </span>
    )
  }

  return <Loader2 aria-hidden="true" className={`h-5 w-5 text-primary ${reducedMotion ? "" : "animate-spin"}`} />
}

export function BubuLoadingCue({ scenario }: { scenario: BubuLoadingScenario }) {
  const reducedMotion = useReducedMotion()
  const cues = BUBU_LOADING_CUES[scenario]
  const cueSequence = useMemo(
    () => [cues[0], ...shuffleCues(cues.slice(1))],
    [cues],
  )
  const [visible, setVisible] = useState(false)
  const [cueIndex, setCueIndex] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), APPEAR_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!visible || reducedMotion) return

    let timer: number | null = null
    const scheduleNext = () => {
      if (document.hidden) return
      timer = window.setTimeout(() => {
        setCueIndex(index => (index + 1) % cueSequence.length)
        scheduleNext()
      }, ROTATION_INTERVAL_MS)
    }
    const handleVisibilityChange = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = null
      if (!document.hidden) scheduleNext()
    }

    scheduleNext()
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      if (timer !== null) window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [cueSequence.length, reducedMotion, visible])

  if (!visible) {
    return <span className="block min-h-14" role="status" aria-label="卜卜象正在生成回复" />
  }

  const cue = cueSequence[cueIndex]
  return (
    <div className="flex min-h-14 items-center rounded-xl border border-primary/12 bg-primary/[0.035] px-3.5 py-3" role="status">
      <span className="sr-only">卜卜象正在生成回复</span>
      <div key={`${scenario}-${cueIndex}`} aria-hidden="true" className="bubu-loading-cue flex min-w-0 items-center gap-3">
        <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-card text-primary shadow-sm ring-1 ring-primary/12">
          <CueVisual cue={cue} reducedMotion={reducedMotion} />
        </span>
        <p className="min-w-0 text-sm font-light leading-relaxed text-foreground/82">
          {cue.text}
        </p>
      </div>
    </div>
  )
}
