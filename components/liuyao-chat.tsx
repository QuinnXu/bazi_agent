"use client"

import Image from 'next/image'
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  CalendarRange,
  Compass,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import {
  castLiuYaoLine,
  coinLabel,
  LINE_HINTS,
  LINE_NAMES,
} from '@/lib/liuyao/divination'
import type {
  CoinFace,
  DivinationSession,
  LineCast,
  LineIndex,
  LiuYaoCalendarInfo,
  LiuYaoContextPayload,
  LiuYaoPlotResult,
  LiuYaoStoredMessage,
} from '@/lib/liuyao/types'
import { BubuEmptyModeShell } from '@/components/bubu-empty-mode-shell'

interface LiuYaoChatProps {
  resetKey?: number
  currentSessionId: string | null
  modeSwitch?: React.ReactNode
  onSessionCreated: (sessionId: string) => void
  onSessionListRefresh: () => void
}

type FlowStage = 'empty' | 'ritual' | 'casting' | 'reading'
type RequestStatus = 'idle' | 'loading' | 'streaming' | 'done' | 'error'
type QuestionPromptKind = 'relationship' | 'career' | 'fortune' | 'decision'

interface FollowUpMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: 'streaming' | 'done' | 'error'
}

const RITUAL_CUES = [
  '小象先陪你慢慢呼吸，把注意力带回此刻',
  '在心中默念你刚刚写下的问题，小象会帮你守住这一问',
  '不急着追答案，只和小象一起保持同一个念头',
  '问题已经落定，小象陪你开始起爻',
]

const RITUAL_CUE_DURATION_MS = 2800
const RITUAL_READY_DELAY_MS = RITUAL_CUE_DURATION_MS * RITUAL_CUES.length

const FUTURE_FLOW_CARDS: Array<{
  id: QuestionPromptKind
  title: string
  description: string
  badge: string
  icon: React.ElementType
  accent: 'rose' | 'gold' | 'violet' | 'teal'
  prompt: string
}> = [
  {
    id: 'relationship',
    title: '感情关系',
    description: '这段关系接下来应该推进还是先观察？',
    badge: '关系',
    icon: Users,
    accent: 'rose',
    prompt: '我想问这段关系接下来应该推进还是先观察？',
  },
  {
    id: 'career',
    title: '事业选择',
    description: '眼前这个事业选择是否适合继续投入？',
    badge: '事业',
    icon: Compass,
    accent: 'teal',
    prompt: '我想问眼前这个事业选择是否适合继续投入？',
  },
  {
    id: 'fortune',
    title: '近期运势',
    description: '接下来一段时间最需要注意什么？',
    badge: '运势',
    icon: CalendarRange,
    accent: 'gold',
    prompt: '我想问接下来一段时间最需要注意什么？',
  },
  {
    id: 'decision',
    title: '决策应事',
    description: '这件事现在做，时机是否合适？',
    badge: '应事',
    icon: Sparkles,
    accent: 'violet',
    prompt: '我想问这件事现在做，时机是否合适？',
  },
]

const FUTURE_FLOW_ACCENT_BG: Record<'rose' | 'gold' | 'violet' | 'teal', string> = {
  rose: 'bg-[oklch(0.696_0.137_3.34)]/12 text-[oklch(0.696_0.137_3.34)] border-[oklch(0.696_0.137_3.34)]/20',
  gold: 'bg-[oklch(0.844_0.115_40.07)]/15 text-[oklch(0.65_0.115_40.07)] border-[oklch(0.844_0.115_40.07)]/30',
  violet: 'bg-[oklch(0.660_0.116_243.69)]/12 text-[oklch(0.660_0.116_243.69)] border-[oklch(0.660_0.116_243.69)]/25',
  teal: 'bg-[oklch(0.762_0.060_171.34)]/15 text-[oklch(0.55_0.080_171.34)] border-[oklch(0.762_0.060_171.34)]/30',
}

const LIUYAO_MARKDOWN_REMARK_PLUGINS = [remarkGfm]
const LIUYAO_MARKDOWN_COMPONENTS = {
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="mb-2 mt-5 text-lg font-semibold text-foreground first:mt-0">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="mb-2 mt-4 text-base font-semibold text-foreground first:mt-0">{children}</h3>,
  p: ({ children }: { children?: React.ReactNode }) => <p className="my-3 leading-7 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="my-3 ml-5 list-disc space-y-1.5">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="my-3 ml-5 list-decimal space-y-1.5">{children}</ol>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-accent">{children}</strong>,
}

export function LiuYaoChat({
  resetKey = 0,
  currentSessionId,
  modeSwitch,
  onSessionCreated,
  onSessionListRefresh,
}: LiuYaoChatProps) {
  const [stage, setStage] = useState<FlowStage>('empty')
  const [draftQuestion, setDraftQuestion] = useState('')
  const [followUpInput, setFollowUpInput] = useState('')
  const [session, setSession] = useState<DivinationSession | null>(null)
  const [plot, setPlot] = useState<LiuYaoPlotResult | null>(null)
  const [stablePlot, setStablePlot] = useState<LiuYaoPlotResult | null>(null)
  const [activeLineIndex, setActiveLineIndex] = useState<LineIndex | null>(null)
  const [ritualCueIndex, setRitualCueIndex] = useState(0)
  const [ritualReady, setRitualReady] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [sessionStatus, setSessionStatus] = useState<RequestStatus>('idle')
  const [plotStatus, setPlotStatus] = useState<RequestStatus>('idle')
  const [analysisStatus, setAnalysisStatus] = useState<RequestStatus>('idle')
  const [followUpStatus, setFollowUpStatus] = useState<RequestStatus>('idle')
  const [analysisText, setAnalysisText] = useState('')
  const [errorText, setErrorText] = useState<string | null>(null)
  const [followUpMessages, setFollowUpMessages] = useState<FollowUpMessage[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const questionComposerRef = useRef<HTMLTextAreaElement>(null)
  const analysisAbortRef = useRef<AbortController | null>(null)
  const followUpAbortRef = useRef<AbortController | null>(null)

  const question = session?.question || ''
  const displayPlot = plot || stablePlot
  const canAskQuestion = stage === 'empty' && sessionStatus !== 'loading'
  const canFollowUp =
    stage === 'reading' &&
    Boolean(displayPlot) &&
    analysisStatus === 'done' &&
    followUpStatus !== 'streaming'

  const clearLocalState = useCallback(() => {
    analysisAbortRef.current?.abort()
    followUpAbortRef.current?.abort()
    setStage('empty')
    setDraftQuestion('')
    setFollowUpInput('')
    setSession(null)
    setPlot(null)
    setStablePlot(null)
    setActiveLineIndex(null)
    setRitualCueIndex(0)
    setRitualReady(false)
    setDetailsOpen(false)
    setSessionStatus('idle')
    setPlotStatus('idle')
    setAnalysisStatus('idle')
    setFollowUpStatus('idle')
    setAnalysisText('')
    setErrorText(null)
    setFollowUpMessages([])
  }, [])

  useEffect(() => {
    if (!currentSessionId) clearLocalState()
  }, [clearLocalState, currentSessionId, resetKey])

  const scrollToLatest = useCallback((smooth = true) => {
    endRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'instant',
      block: 'end',
    })
  }, [])

  useEffect(() => {
    if (stage !== 'empty') {
      window.requestAnimationFrame(() => scrollToLatest())
    }
  }, [
    activeLineIndex,
    analysisText,
    followUpMessages,
    ritualCueIndex,
    stage,
    scrollToLatest,
  ])

  const fillQuestionFromCard = useCallback((item: typeof FUTURE_FLOW_CARDS[number]) => {
    setDraftQuestion(item.prompt)
    window.requestAnimationFrame(() => {
      questionComposerRef.current?.focus()
    })
  }, [])

  const restoreSession = useCallback(async (sessionId: string) => {
    analysisAbortRef.current?.abort()
    followUpAbortRef.current?.abort()
    setSessionStatus('loading')
    setErrorText(null)
    setStage('empty')
    setSession(null)
    setPlot(null)
    setStablePlot(null)
    setActiveLineIndex(null)
    setDetailsOpen(false)
    setAnalysisText('')
    setFollowUpMessages([])
    setPlotStatus('idle')
    setAnalysisStatus('idle')
    setFollowUpStatus('idle')
    try {
      const response = await fetch(`/api/liuyao/session?sessionId=${encodeURIComponent(sessionId)}`, {
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({})) as {
        session?: { id: string }
        messages?: LiuYaoStoredMessage[]
        context?: LiuYaoContextPayload | null
        message?: string
      }
      if (!response.ok || !data.session) {
        throw new Error(data.message || '卜卜卦记录暂时无法加载。')
      }

      const messages = data.messages || []
      const questionMessage = messages.find(message => message.metadata?.kind === 'liuyao_question')
        || messages.find(message => message.role === 'user')
      const restoredQuestion = questionMessage?.content?.trim() || ''
      if (!restoredQuestion) throw new Error('这条问卦记录缺少原问题。')

      if (!data.context) {
        setSession({
          sessionId,
          question: restoredQuestion,
          questionLockedAt: questionMessage?.created_at || new Date().toISOString(),
          method: 'app_simulated_coins',
          coinRule: { yang: 3, yin: 2 },
          status: 'casting',
          lines: [],
        })
        setPlot(null)
        setStablePlot(null)
        setAnalysisText('')
        setFollowUpMessages([])
        setActiveLineIndex(null)
        setRitualReady(false)
        setRitualCueIndex(0)
        setStage('ritual')
        setAnalysisStatus('idle')
        setSessionStatus('done')
        return
      }

      const analysisMessages = messages.filter(message => message.metadata?.kind === 'liuyao_analysis')
      const initialAnalysis = analysisMessages.at(-1)?.content || ''
      const firstAnalysisIndex = messages.findIndex(message => message.metadata?.kind === 'liuyao_analysis')
      const restoredFollowUps = messages
        .filter((message, index) => (
          index > firstAnalysisIndex &&
          message.metadata?.kind === 'liuyao_followup'
        ))
        .map(message => ({
          id: message.id,
          role: message.role,
          content: message.content,
          status: 'done' as const,
        }))

      setSession(data.context.session)
      setPlot(data.context.plot)
      setStablePlot(data.context.plot)
      setAnalysisText(initialAnalysis)
      setAnalysisStatus(initialAnalysis ? 'done' : 'idle')
      setFollowUpMessages(restoredFollowUps)
      setActiveLineIndex(null)
      setRitualReady(true)
      setRitualCueIndex(RITUAL_CUES.length - 1)
      setStage('reading')
      setSessionStatus('done')
    } catch (error) {
      setSessionStatus('error')
      setErrorText(error instanceof Error ? error.message : '卜卜卦记录暂时无法加载。')
    }
  }, [])

  useEffect(() => {
    if (currentSessionId) void restoreSession(currentSessionId)
  }, [currentSessionId, restoreSession])

  useEffect(() => {
    if (stage !== 'ritual' || ritualReady) return
    setRitualCueIndex(0)
    const timers = [
      ...RITUAL_CUES.slice(1).map((_, index) => (
        window.setTimeout(
          () => setRitualCueIndex((index + 1) as 1 | 2 | 3),
          RITUAL_CUE_DURATION_MS * (index + 1),
        )
      )),
      window.setTimeout(() => setRitualReady(true), RITUAL_READY_DELAY_MS),
    ]
    return () => timers.forEach(timer => window.clearTimeout(timer))
  }, [ritualReady, stage])

  const submitQuestion = useCallback(async () => {
    const nextQuestion = draftQuestion.trim()
    if (!nextQuestion || !canAskQuestion) return
    setSessionStatus('loading')
    setErrorText(null)
    setPlot(null)
    setStablePlot(null)
    setAnalysisText('')
    setFollowUpMessages([])
    setPlotStatus('idle')
    setAnalysisStatus('idle')
    setFollowUpStatus('idle')
    setDetailsOpen(false)
    try {
      const response = await fetch('/api/liuyao/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: nextQuestion }),
      })
      const data = await response.json().catch(() => ({})) as {
        session?: { id: string }
        message?: string
      }
      if (!response.ok || !data.session) {
        throw new Error(data.message || '这次问卦没有保存下来，请重试。')
      }

      const created: DivinationSession = {
        sessionId: data.session.id,
        question: nextQuestion,
        questionLockedAt: new Date().toISOString(),
        method: 'app_simulated_coins',
        coinRule: { yang: 3, yin: 2 },
        status: 'casting',
        lines: [],
      }
      setSession(created)
      setDraftQuestion('')
      setStage('ritual')
      setRitualCueIndex(0)
      setRitualReady(false)
      setSessionStatus('done')
      onSessionCreated(data.session.id)
      onSessionListRefresh()
    } catch (error) {
      setSessionStatus('error')
      setErrorText(error instanceof Error ? error.message : '这次问卦没有保存下来，请重试。')
    }
  }, [
    canAskQuestion,
    draftQuestion,
    onSessionCreated,
    onSessionListRefresh,
  ])

  const beginCasting = useCallback(() => {
    if (!ritualReady || !session) return
    setStage('casting')
    setActiveLineIndex(1)
    setErrorText(null)
  }, [ritualReady, session])

  const commitLine = useCallback((cast: LineCast) => {
    setSession(previous => {
      if (!previous || previous.status !== 'casting') return previous
      const expectedIndex = (previous.lines.length + 1) as LineIndex
      if (cast.lineIndex !== expectedIndex || previous.lines.length >= 6) return previous
      const lines = [...previous.lines, cast]
      return {
        ...previous,
        lines,
        status: lines.length === 6 ? 'completed' : 'casting',
      }
    })
  }, [])

  const advanceCasting = useCallback(() => {
    setSession(previous => {
      if (!previous || activeLineIndex === null) return previous
      if (!previous.lines.some(line => line.lineIndex === activeLineIndex)) return previous
      if (activeLineIndex < 6) {
        setActiveLineIndex((activeLineIndex + 1) as LineIndex)
        return previous
      }
      if (previous.lines.length !== 6) return previous
      setActiveLineIndex(null)
      setStage('reading')
      setPlotStatus('idle')
      return { ...previous, status: 'plotted' }
    })
  }, [activeLineIndex])

  const createPlotAndContext = useCallback(async () => {
    if (
      !currentSessionId ||
      !session ||
      session.lines.length !== 6 ||
      plotStatus === 'loading'
    ) return
    setPlotStatus('loading')
    setErrorText(null)
    try {
      const plotResponse = await fetch('/api/liuyao/plot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          session,
          persistContext: true,
          timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
        }),
      })
      const plotData = await plotResponse.json().catch(() => ({})) as {
        plot?: LiuYaoPlotResult
        message?: string
      }
      if (!plotResponse.ok || !plotData.plot) {
        throw new Error(plotData.message || '排盘暂时不可用。')
      }

      setPlot(plotData.plot)
      setStablePlot(plotData.plot)
      setPlotStatus('done')
      onSessionListRefresh()
    } catch (error) {
      setPlotStatus('error')
      setErrorText(error instanceof Error ? error.message : '排盘暂时不可用。')
    }
  }, [
    currentSessionId,
    onSessionListRefresh,
    plotStatus,
    session,
  ])

  useEffect(() => {
    if (
      stage === 'reading' &&
      session?.lines.length === 6 &&
      !plot &&
      plotStatus === 'idle'
    ) {
      void createPlotAndContext()
    }
  }, [createPlotAndContext, plot, plotStatus, session, stage])

  const analyze = useCallback(async () => {
    if (!currentSessionId || !displayPlot || analysisStatus === 'streaming') return
    analysisAbortRef.current?.abort()
    const controller = new AbortController()
    analysisAbortRef.current = controller
    setAnalysisStatus('streaming')
    setAnalysisText('')
    setErrorText(null)
    try {
      const response = await fetch('/api/liuyao/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSessionId }),
        signal: controller.signal,
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { message?: string }
        throw new Error(data.message || `解卦暂时不可用（${response.status}）`)
      }
      if (!response.body) throw new Error('解卦服务没有返回内容流。')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let output = ''
      let commitFrame: number | null = null
      const scheduleCommit = () => {
        if (commitFrame !== null) return
        commitFrame = window.requestAnimationFrame(() => {
          commitFrame = null
          setAnalysisText(output)
        })
      }
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        if (chunk) {
          output += chunk
          scheduleCommit()
        }
      }
      const tail = decoder.decode()
      if (tail) output += tail
      if (commitFrame !== null) {
        window.cancelAnimationFrame(commitFrame)
        commitFrame = null
      }
      setAnalysisText(output)
      setAnalysisStatus('done')
      onSessionListRefresh()
    } catch (error) {
      if (controller.signal.aborted) return
      setAnalysisStatus('error')
      setErrorText(error instanceof Error ? error.message : '解卦暂时不可用。')
    } finally {
      if (analysisAbortRef.current === controller) analysisAbortRef.current = null
    }
  }, [analysisStatus, currentSessionId, displayPlot, onSessionListRefresh])

  useEffect(() => {
    if (displayPlot && !analysisText && analysisStatus === 'idle') void analyze()
  }, [analysisStatus, analysisText, analyze, displayPlot])

  const submitFollowUp = useCallback(async (retry?: {
    userId: string
    assistantId: string
    text: string
  }) => {
    const text = (retry?.text || followUpInput).trim()
    if (!currentSessionId || !text || !canFollowUp) return

    const cleanHistory = retry
      ? followUpMessages.filter(message => (
        message.id !== retry.userId && message.id !== retry.assistantId
      ))
      : followUpMessages
    const userMessage: FollowUpMessage = {
      id: `liuyao-user-${Date.now()}`,
      role: 'user',
      content: text,
      status: 'done',
    }
    const assistantId = `liuyao-assistant-${Date.now()}`
    const assistantMessage: FollowUpMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      status: 'streaming',
    }
    const requestMessages = [
      { role: 'assistant' as const, content: analysisText },
      ...cleanHistory.map(message => ({
        role: message.role,
        content: message.content,
      })),
      { role: 'user' as const, content: text },
    ]

    setFollowUpMessages(previous => [
      ...previous.filter(message => (
        !retry || (message.id !== retry.userId && message.id !== retry.assistantId)
      )),
      userMessage,
      assistantMessage,
    ])
    setFollowUpInput('')
    setFollowUpStatus('streaming')
    setErrorText(null)
    const controller = new AbortController()
    followUpAbortRef.current = controller

    try {
      const response = await fetch('/api/liuyao/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          messages: requestMessages,
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { message?: string }
        throw new Error(data.message || `追问暂时没有接住（${response.status}）`)
      }
      if (!response.body) throw new Error('追问服务没有返回内容流。')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let output = ''
      let commitFrame: number | null = null
      const scheduleCommit = () => {
        if (commitFrame !== null) return
        commitFrame = window.requestAnimationFrame(() => {
          commitFrame = null
          setFollowUpMessages(previous => previous.map(message =>
            message.id === assistantId ? { ...message, content: output } : message
          ))
        })
      }
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        if (!chunk) continue
        output += chunk
        scheduleCommit()
      }
      output += decoder.decode()
      if (commitFrame !== null) {
        window.cancelAnimationFrame(commitFrame)
        commitFrame = null
      }
      setFollowUpMessages(previous => previous.map(message =>
        message.id === assistantId
          ? { ...message, content: output, status: 'done' }
          : message
      ))
      setFollowUpStatus('done')
      onSessionListRefresh()
    } catch (error) {
      if (controller.signal.aborted) return
      const message = error instanceof Error ? error.message : '追问暂时没有接住。'
      setFollowUpMessages(previous => previous.map(item =>
        item.id === assistantId
          ? { ...item, content: message, status: 'error' }
          : item
      ))
      setFollowUpStatus('error')
    } finally {
      if (followUpAbortRef.current === controller) followUpAbortRef.current = null
    }
  }, [
    analysisText,
    canFollowUp,
    currentSessionId,
    followUpInput,
    followUpMessages,
    onSessionListRefresh,
  ])

  useEffect(() => () => {
    analysisAbortRef.current?.abort()
    followUpAbortRef.current?.abort()
  }, [])

  const committedActive = session && activeLineIndex
    ? session.lines.find(line => line.lineIndex === activeLineIndex) || null
    : null

  return (
    <>
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto px-3 pb-6 pt-16 [scrollbar-gutter:stable] md:px-6 md:pb-8"
      >
        <div className="mx-auto w-full max-w-3xl">
          {sessionStatus === 'loading' && currentSessionId ? (
            <TimelineLoading />
          ) : stage === 'empty' ? (
            <>
              <EmptyLiuYaoState
                modeSwitch={modeSwitch}
                onPromptPick={fillQuestionFromCard}
              />
              <div ref={endRef} />
            </>
          ) : (
            <div className="space-y-4 py-3 md:space-y-6 md:py-4">
              <UserBubble content={question} />

              {(stage === 'ritual' || stage === 'casting') && session && (
                <AssistantShell label={stage === 'ritual' ? '小象带你起卦' : '小象陪你起爻'}>
                  {stage === 'ritual' ? (
                    <RitualCard
                      question={session.question}
                      cue={RITUAL_CUES[ritualCueIndex]}
                      ready={ritualReady}
                      onReady={beginCasting}
                    />
                  ) : activeLineIndex ? (
                    <CastingCard
                      key={activeLineIndex}
                      question={session.question}
                      lineIndex={activeLineIndex}
                      lines={session.lines}
                      committed={committedActive}
                      onCommit={commitLine}
                      onProceed={advanceCasting}
                    />
                  ) : null}
                </AssistantShell>
              )}

              {stage === 'reading' && session && (
                <>
                  <AssistantShell label={displayPlot ? '六爻已成' : '正在排盘'}>
                    <CompletedCastingSummary
                      session={session}
                      plot={displayPlot}
                      status={plotStatus}
                      error={plotStatus === 'error' ? errorText : null}
                      detailsOpen={detailsOpen}
                      onToggleDetails={() => setDetailsOpen(open => !open)}
                      onRetry={() => void createPlotAndContext()}
                    />
                  </AssistantShell>

                  {displayPlot && (
                    <AssistantShell
                      label={analysisStatus === 'streaming' ? '小象正在解读' : '小象解卦'}
                      streaming={analysisStatus === 'streaming'}
                    >
                      <AnalysisCard
                        content={analysisText}
                        status={analysisStatus}
                        error={analysisStatus === 'error' ? errorText : null}
                        onRetry={() => void analyze()}
                      />
                    </AssistantShell>
                  )}

                  {followUpMessages.map((message, index) => (
                    message.role === 'user' ? (
                      <UserBubble key={message.id} content={message.content} />
                    ) : (
                      <AssistantShell
                        key={message.id}
                        label={message.status === 'streaming' ? '小象正在回应' : '小象继续解卦'}
                        streaming={message.status === 'streaming'}
                      >
                        <MarkdownContent content={message.content} loading={message.status === 'streaming'} />
                        {message.status === 'error' && followUpMessages[index - 1]?.role === 'user' && (
                          <button
                            type="button"
                            onClick={() => void submitFollowUp({
                              userId: followUpMessages[index - 1].id,
                              assistantId: message.id,
                              text: followUpMessages[index - 1].content,
                            })}
                            className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm text-primary-foreground"
                          >
                            <RefreshCw className="h-4 w-4" />
                            重试追问
                          </button>
                        )}
                      </AssistantShell>
                    )
                  ))}
                </>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border/45 bg-background/90 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl md:px-4">
        <div className="mx-auto max-w-3xl">
          {errorText && (stage === 'empty' || sessionStatus === 'error') && (
            <div className="mb-2 rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-xs text-destructive">
              {errorText}
            </div>
          )}
          <form
            onSubmit={event => {
              event.preventDefault()
              if (stage === 'empty') void submitQuestion()
              else if (canFollowUp) void submitFollowUp()
            }}
          >
            <div className="rounded-2xl border border-border/80 bg-card/90 px-2 py-1.5 shadow-[0_16px_48px_oklch(0.245_0.012_255/0.10)] backdrop-blur-xl md:rounded-xl">
              <div className="flex items-end gap-2">
                <textarea
                  ref={questionComposerRef}
                  rows={1}
                  maxLength={stage === 'empty' ? 120 : 500}
                  value={stage === 'empty' ? draftQuestion : followUpInput}
                  onChange={event => {
                    if (stage === 'empty') setDraftQuestion(event.target.value)
                    else setFollowUpInput(event.target.value)
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      if (stage === 'empty') void submitQuestion()
                      else if (canFollowUp) void submitFollowUp()
                    }
                  }}
                  placeholder={composerPlaceholder({
                    stage,
                    ritualReady,
                    plotStatus,
                    analysisStatus,
                  })}
                  disabled={!canAskQuestion && !canFollowUp}
                  className="composer-textarea h-8 min-h-8 max-h-28 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-1.5 text-sm font-light leading-5 text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-65"
                />
                <button
                  type="submit"
                  disabled={
                    stage === 'empty'
                      ? !draftQuestion.trim() || !canAskQuestion
                      : !followUpInput.trim() || !canFollowUp
                  }
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
                  title={stage === 'empty' ? '发送问题' : '发送追问'}
                >
                  {sessionStatus === 'loading' || followUpStatus === 'streaming' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : stage === 'empty' ? (
                    <Send className="h-4 w-4" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

function EmptyLiuYaoState({
  modeSwitch,
  onPromptPick,
}: {
  modeSwitch?: React.ReactNode
  onPromptPick: (item: typeof FUTURE_FLOW_CARDS[number]) => void
}) {
  return (
    <BubuEmptyModeShell
      modeKey="liuyao"
      title="一卦，只问一件事"
      description="小象会陪你先静下来，再完成六次起爻。把此刻真正想问的事写在下方，后续追问也会围绕同一卦继续。"
      modeSwitch={modeSwitch}
      cards={<FutureFlowIntroCards onPick={onPromptPick} />}
    />
  )
}

function FutureFlowIntroCards({
  onPick,
}: {
  onPick: (item: typeof FUTURE_FLOW_CARDS[number]) => void
}) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {FUTURE_FLOW_CARDS.map(item => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onPick(item)}
              className="group h-[132px] min-w-0 rounded-lg border border-border bg-card/76 p-3 text-left backdrop-blur-sm transition-all duration-200 hover:border-primary/35 hover:bg-card hover:shadow-sm sm:h-[132px]"
            >
              <div className="flex h-full flex-col justify-between gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border sm:h-8 sm:w-8 ${FUTURE_FLOW_ACCENT_BG[item.accent]}`}
                  >
                    <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </div>
                  <span className="whitespace-nowrap rounded-md border border-primary/15 bg-primary/8 px-1.5 py-0.5 text-[10px] font-light text-primary/80">
                    {item.badge}
                  </span>
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium leading-snug text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-[11px] font-light leading-snug text-muted-foreground sm:text-xs">
                    {item.description}
                  </p>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TimelineLoading() {
  return (
    <div className="space-y-5 py-4">
      <div className="ml-auto h-11 w-64 max-w-[82%] animate-pulse rounded-2xl bg-primary/16" />
      <div className="w-full rounded-2xl border border-border/65 bg-card/70 p-4">
        <div className="mb-4 h-7 w-28 animate-pulse rounded-lg bg-muted" />
        <div className="space-y-2">
          <div className="h-3 w-full animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-8/12 animate-pulse rounded-full bg-muted/70" />
        </div>
      </div>
    </div>
  )
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex w-full justify-end">
      <div className="max-w-[min(88%,42rem)] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 font-light leading-relaxed text-primary-foreground shadow-sm md:max-w-[min(82%,42rem)] md:rounded-lg md:rounded-br-sm md:py-3">
        <div className="whitespace-pre-wrap">{content}</div>
      </div>
    </div>
  )
}

function AssistantShell({
  label,
  streaming = false,
  children,
}: {
  label: string
  streaming?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex w-full justify-start">
      <article className="w-full max-w-3xl rounded-2xl border border-border/65 bg-card/82 px-4 py-3 font-light leading-relaxed text-foreground shadow-sm backdrop-blur-sm md:rounded-xl md:px-5 md:py-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="h-7 w-7 flex-shrink-0 overflow-hidden rounded-lg border border-primary/20 bg-card shadow-sm">
            <Image src="/avatar-small.png" alt="卜卜象" width={28} height={28} className="h-full w-full object-contain" />
          </span>
          <span className="font-medium text-foreground/80">卜卜象</span>
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-muted/55 px-2 py-0.5 text-[10px] text-muted-foreground">
            {streaming && <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
            <span>{label}</span>
          </span>
        </div>
        {children}
      </article>
    </div>
  )
}

function RitualCard({
  question,
  cue,
  ready,
  onReady,
}: {
  question: string
  cue: string
  ready: boolean
  onReady: () => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-b from-primary/7 via-card/70 to-card">
      <div className="relative grid min-h-64 place-items-center px-5 py-8 text-center">
        <div className="liuyao-breathing-field" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="relative z-10 max-w-lg">
          <div className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-full border border-primary/15 bg-card/70 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
            <span className="h-7 w-7 overflow-hidden rounded-full border border-primary/20 bg-card">
              <Image src="/avatar-small.png" alt="卜卜象头像" width={28} height={28} className="h-full w-full object-contain" />
            </span>
            <span>小象在这里，先把这一问放稳</span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium tracking-[0.14em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            心念落定
          </span>
          <p key={cue} className="mt-4 animate-fade-in text-lg font-light leading-8 text-foreground md:text-xl">
            {cue}
          </p>
          <div className="mt-5 rounded-xl border border-primary/15 bg-card/65 px-4 py-3 backdrop-blur-sm">
            <span className="block text-[10px] tracking-[0.12em] text-muted-foreground">这一卦只问</span>
            <strong className="mt-1.5 block text-sm font-medium leading-6 text-foreground">{question}</strong>
          </div>
          {ready && (
            <button
              type="button"
              onClick={onReady}
              className="mt-6 h-10 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground shadow-[0_10px_28px_oklch(0.696_0.137_3.34/0.25)] transition-all hover:-translate-y-0.5 hover:opacity-90"
            >
              我准备好了
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function CastingCard({
  question,
  lineIndex,
  lines,
  committed,
  onCommit,
  onProceed,
}: {
  question: string
  lineIndex: LineIndex
  lines: LineCast[]
  committed: LineCast | null
  onCommit: (cast: LineCast) => void
  onProceed: () => void
}) {
  const [cast, setCast] = useState<LineCast | null>(committed)
  const [revealed, setRevealed] = useState(Boolean(committed))
  const [tooSoon, setTooSoon] = useState(false)
  const committedRef = useRef(Boolean(committed))
  const previousCast = useMemo(() => {
    if (lineIndex <= 1) return null
    return lines.find(line => line.lineIndex === (lineIndex - 1)) || null
  }, [lineIndex, lines])

  useEffect(() => {
    setCast(committed)
    setRevealed(Boolean(committed))
    setTooSoon(false)
    committedRef.current = Boolean(committed)
  }, [committed, lineIndex])

  useEffect(() => {
    if (!cast) return
    const timer = window.setTimeout(onProceed, 1250)
    return () => window.clearTimeout(timer)
  }, [cast, onProceed])

  const complete = useCallback(() => {
    if (committedRef.current) return
    committedRef.current = true
    setTooSoon(false)
    const result = castLiuYaoLine(lineIndex)
    setCast(result)
    setRevealed(false)
    onCommit(result)
    window.requestAnimationFrame(() => setRevealed(true))
  }, [lineIndex, onCommit])

  const { holding, progress, charged, handlers } = useLongPress({
    holdMs: 600,
    disabled: Boolean(cast),
    onComplete: complete,
    onTooSoon: () => setTooSoon(true),
  })
  const displayCoins = cast?.coins || previousCast?.coins || null
  const displayRevealed = Boolean(cast) && revealed
  const spinDurationMs = Math.round(520 - progress * 240)
  const focusHint = charged
    ? '松手，小象帮你看三枚铜钱落定'
    : holding
    ? '小象在，继续守住这个问题…'
    : null

  return (
    <div>
      <div className="mb-4 grid grid-cols-6 gap-2" aria-label={`已完成 ${lines.length} 爻`}>
        {[1, 2, 3, 4, 5, 6].map(index => (
          <span
            key={index}
            className={`h-1.5 rounded-full ${
              index <= lines.length
                ? 'bg-primary'
                : index === lineIndex
                ? 'bg-primary/45'
                : 'bg-muted'
            }`}
          />
        ))}
      </div>

      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <span className="text-xs font-medium text-primary">第 {lineIndex} / 6 次</span>
          <h2 className="mt-1 text-xl font-light text-foreground">{LINE_NAMES[lineIndex]}</h2>
        </div>
        <span className="text-right text-xs text-muted-foreground">{LINE_HINTS[lineIndex]}</span>
      </div>

      <div
        className={`liuyao-coin-stage relative flex min-h-52 w-full flex-col items-center justify-center overflow-hidden rounded-2xl border px-4 py-7 text-center ${
          cast ? 'is-settled border-primary/20' : 'border-primary/15'
        }`}
      >
        <CoinSet
          coins={displayCoins}
          charging={holding}
          revealed={displayRevealed}
          spinDurationMs={spinDurationMs}
        />
        <div className="mt-5 flex min-h-20 w-full flex-col items-center justify-center gap-1.5">
          {cast
            ? (
              <span className="liuyao-cast-status">
                {`${cast.coins.map(coinLabel).join(' · ')}　合计 ${cast.total} · ${cast.lineType}${cast.moving ? ' · 动爻' : ''}`}
              </span>
            )
            : (
              <>
                <p className="liuyao-question-focus" title={question}>{question}</p>
                {focusHint && <span className="liuyao-cast-status is-active">{focusHint}</span>}
              </>
            )}
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center gap-2">
        <button
          type="button"
          disabled={Boolean(cast)}
          aria-label={`长按起${LINE_NAMES[lineIndex]}`}
          {...handlers}
          className={`liuyao-cast-button ${holding ? 'is-holding' : ''} ${charged ? 'is-charged' : ''} ${cast ? 'is-complete' : ''}`}
        >
          <span className="liuyao-cast-button-glow" aria-hidden="true" />
          <span className="liuyao-cast-button-dot" aria-hidden="true" />
          <span className="relative z-10">
            {cast
              ? `${cast.lineType}${cast.moving ? ' · 动爻' : ''}`
              : charged
              ? '松手落币'
              : holding
              ? '保持心念'
              : '按住起这一爻'}
          </span>
        </button>
        <span className="liuyao-cast-progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${progress})` }} />
        </span>
      </div>
      {tooSoon && <p className="mt-2 text-center text-xs text-primary">小象提醒：再多停留一小会儿。</p>}

      <HexagramPreview lines={lines} compact />
    </div>
  )
}

function CoinSet({
  coins,
  charging,
  revealed,
  spinDurationMs,
}: {
  coins: CoinFace[] | null
  charging: boolean
  revealed: boolean
  spinDurationMs: number
}) {
  const faces: Array<CoinFace | null> = coins || [null, null, null]
  const animationStyle = {
    '--liuyao-coin-spin-duration': `${spinDurationMs}ms`,
    '--liuyao-coin-hover-duration': `${Math.max(480, Math.round(spinDurationMs * 1.65))}ms`,
  } as React.CSSProperties
  return (
    <span className="liuyao-coin-set" style={animationStyle} aria-hidden="true">
      {faces.map((face, index) => (
        <span
          key={index}
          className={[
            'liuyao-coin',
            charging ? 'is-charging' : '',
            revealed ? 'is-revealed' : '',
            face === 'yang' ? 'is-logo' : '',
            face === 'yin' ? 'is-bu' : '',
            face === null && !charging ? 'is-pending' : '',
          ].filter(Boolean).join(' ')}
        >
          <span className="liuyao-coin-inner" style={{ animationDelay: `${index * 150}ms` }}>
            <span className="liuyao-coin-face liuyao-coin-face-logo">
              <Image src="/logo面.png" alt="" width={96} height={96} className="liuyao-coin-art" />
            </span>
            <span className="liuyao-coin-face liuyao-coin-face-bu">
              <Image src="/卜字面.png" alt="" width={96} height={96} className="liuyao-coin-art" />
            </span>
          </span>
        </span>
      ))}
    </span>
  )
}

function CompletedCastingSummary({
  session,
  plot,
  status,
  error,
  detailsOpen,
  onToggleDetails,
  onRetry,
}: {
  session: DivinationSession
  plot: LiuYaoPlotResult | null
  status: RequestStatus
  error: string | null
  detailsOpen: boolean
  onToggleDetails: () => void
  onRetry: () => void
}) {
  if (!plot) {
    return (
      <div className="rounded-xl border border-border/70 bg-muted/25 px-4 py-6 text-center">
        {status === 'error' ? (
          <>
            <p className="text-sm text-destructive">{error || '排盘暂时不可用。'}</p>
            <button type="button" onClick={onRetry} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm text-primary-foreground">
              <RefreshCw className="h-4 w-4" />
              重试排盘
            </button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
            <p className="mt-3 text-sm text-foreground">六爻已经落定，小象正在排盘</p>
            <p className="mt-1 text-xs text-muted-foreground">小象会整理本卦、变卦、六亲六神与神煞。</p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-xs text-primary">本卦 {plot.view.original}</span>
          <h2 className="mt-1 text-2xl font-light tracking-tight text-foreground">{plot.view.title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">变卦 {plot.view.changed}</span>
          <button
            type="button"
            onClick={onToggleDetails}
            aria-expanded={detailsOpen}
            className="inline-flex h-8 items-center rounded-full border border-primary/18 bg-primary/8 px-3 text-xs font-medium text-primary transition-all hover:border-primary/35 hover:bg-primary/12"
          >
            {detailsOpen ? '收起排盘' : '查看排盘'}
          </button>
        </div>
      </div>
      <HexagramPreview
        lines={session.lines}
        compact
        originalName={plot.view.original}
        changedName={plot.payload.movingLines.length ? plot.view.changed : undefined}
      />
      {detailsOpen && (
        <div className="mt-3 w-full animate-fade-in rounded-2xl border border-border/75 bg-card/98 p-3 shadow-2xl backdrop-blur-xl md:ml-auto md:max-w-xl md:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">卦象与排盘</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">简表信息，仅保留解读所需的关键项。</p>
            </div>
            <button
              type="button"
              onClick={onToggleDetails}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-muted/35 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="关闭排盘"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <PlotDetails plot={plot} />
        </div>
      )}
    </div>
  )
}

function AnalysisCard({
  content,
  status,
  error,
  onRetry,
}: {
  content: string
  status: RequestStatus
  error: string | null
  onRetry: () => void
}) {
  return (
    <div>
      {error && (
        <div className="mb-4 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <MarkdownContent content={content} loading={status === 'streaming'} />
      {status === 'error' && (
        <button type="button" onClick={onRetry} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm text-primary-foreground">
          <RefreshCw className="h-4 w-4" />
          重试解读
        </button>
      )}
    </div>
  )
}

const MarkdownContent = React.memo(function MarkdownContent({ content, loading }: { content: string; loading?: boolean }) {
  if (!content) {
    return (
      <div className="space-y-3" aria-label={loading ? '正在生成' : '暂无内容'}>
        <span className="block h-3 w-full animate-pulse rounded-full bg-muted" />
        <span className="block h-3 w-10/12 animate-pulse rounded-full bg-muted/80" />
        <span className="block h-3 w-8/12 animate-pulse rounded-full bg-muted/60" />
      </div>
    )
  }
  return (
    <div className="markdown-content max-w-none text-sm text-foreground">
      <ReactMarkdown
        remarkPlugins={LIUYAO_MARKDOWN_REMARK_PLUGINS}
        components={LIUYAO_MARKDOWN_COMPONENTS}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})

type LineGlyphValue = Pick<LineCast, 'total' | 'moving'>

function HexagramPreview({
  lines,
  compact = false,
  originalName,
  changedName,
}: {
  lines: LineCast[]
  compact?: boolean
  originalName?: string
  changedName?: string
}) {
  const byIndex = useMemo(() => new Map(lines.map(line => [line.lineIndex, line])), [lines])
  const displayOrder: LineIndex[] = [6, 5, 4, 3, 2, 1]
  const hasChanged = Boolean(changedName && lines.some(line => line.moving))

  if (hasChanged) {
    return (
      <div className={`${compact ? 'mt-4' : ''} rounded-xl border border-border/65 bg-muted/22 p-3`}>
        {!compact && <div className="mb-3 text-xs font-medium text-muted-foreground">卦象</div>}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-3">
          <HexagramColumn
            label="本卦"
            name={originalName || '本卦'}
            lines={displayOrder.map(index => byIndex.get(index) || null)}
            mode="original"
          />
          <div className="my-1 w-px rounded-full bg-border/70" aria-hidden="true" />
          <HexagramColumn
            label="变卦"
            name={changedName || '变卦'}
            lines={displayOrder.map(index => byIndex.get(index) || null)}
            mode="changed"
          />
        </div>
      </div>
    )
  }

  return (
    <div className={`${compact ? 'mt-4' : ''} rounded-xl border border-border/65 bg-muted/22 p-3`}>
      {!compact && <div className="mb-3 text-xs font-medium text-muted-foreground">卦象</div>}
      <div className="space-y-1.5">
        {displayOrder.map(index => {
          const cast = byIndex.get(index) || null
          return (
            <div key={index} className="grid grid-cols-[4.25rem_minmax(0,1fr)_4.25rem] items-center gap-2 text-[11px] sm:grid-cols-[5rem_minmax(0,1fr)_5rem]">
              <span className="text-muted-foreground">{positionLabel(index)}</span>
              <LineGlyph cast={cast} />
              <span className="truncate text-right text-muted-foreground">
                {cast ? `${cast.lineType}${cast.moving ? ' · 动' : ''}` : '待起'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HexagramColumn({
  label,
  name,
  lines,
  mode,
}: {
  label: string
  name: string
  lines: Array<LineCast | null>
  mode: 'original' | 'changed'
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex min-w-0 items-baseline justify-center gap-1.5 text-[11px]">
        <span className="shrink-0 text-primary/85">{label}</span>
        <strong className="truncate font-medium text-foreground">{name}</strong>
      </div>
      <div className="space-y-1.5" aria-label={`${label}${name}`}>
        {lines.map((cast, index) => (
          <div key={`${mode}-${index}`} className="flex h-5 items-center justify-center">
            <LineGlyph
              cast={mode === 'changed' ? getChangedLineGlyph(cast) : cast}
              pair
              transition={mode === 'changed' && Boolean(cast?.moving)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function getChangedLineGlyph(cast: LineCast | null): LineGlyphValue | null {
  if (!cast) return null
  return {
    total: cast.total === 6 ? 7 : cast.total === 9 ? 8 : cast.total,
    moving: false,
  }
}

function LineGlyph({
  cast,
  pair = false,
  transition = false,
}: {
  cast: LineGlyphValue | null
  pair?: boolean
  transition?: boolean
}) {
  if (!cast) return <span className="liuyao-line-glyph is-pending" />
  const yang = cast.total === 7 || cast.total === 9
  return (
    <span className={`liuyao-line-glyph ${pair ? 'is-pair' : ''} ${yang ? 'is-yang' : 'is-yin'} ${cast.moving ? 'is-moving' : ''} ${transition ? 'is-transition' : ''}`}>
      <span className="liuyao-line-left" />
      {!yang && <span className="liuyao-line-right" />}
      {cast.moving && <span className="liuyao-line-mark">{cast.total === 9 ? '○' : '×'}</span>}
    </span>
  )
}

const BRANCH_CLASHES: Record<string, string> = {
  子: '午',
  丑: '未',
  寅: '申',
  卯: '酉',
  辰: '戌',
  巳: '亥',
  午: '子',
  未: '丑',
  申: '寅',
  酉: '卯',
  戌: '辰',
  亥: '巳',
}

function resolvePlotCalendar(plot: LiuYaoPlotResult): LiuYaoCalendarInfo {
  if (plot.calendar) return plot.calendar

  const pillars = (plot.view.stemBranch || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const [yearPillar = '_', monthPillar = '_', dayPillar = '_', hourPillar = '_'] = pillars
  const monthBranch = getPillarBranch(monthPillar)
  const dayBranch = getPillarBranch(dayPillar)

  return {
    stemBranchFull: plot.view.stemBranch || '_',
    yearPillar,
    monthPillar,
    dayPillar,
    hourPillar,
    dayEmptiness: plot.view.dayEmptiness || '_',
    monthBranch,
    dayBranch,
    monthBreak: BRANCH_CLASHES[monthBranch] || '_',
  }
}

function getPillarBranch(pillar: string): string {
  if (!pillar || pillar === '_') return '_'
  return pillar.slice(-1)
}

function PlotDetails({ plot }: { plot: LiuYaoPlotResult }) {
  const changedLines = new Map(plot.view.changedLines.map(line => [line.position, line]))
  const calendar = resolvePlotCalendar(plot)
  const movingLines = plot.payload.movingLines.length ? plot.payload.movingLines.join('、') : '无'
  return (
    <div className="max-h-[min(66vh,32rem)] space-y-4 overflow-y-auto pr-1">
      <div className="grid gap-2 sm:grid-cols-2">
        <Fact label="本卦 / 变卦" value={`${plot.view.original} → ${plot.view.changed}`} />
        <Fact label="排盘时间" value={plot.time.display} />
        <Fact label="四柱" value={calendar.stemBranchFull} />
        <Fact label="月建 / 日辰" value={`${calendar.monthBranch} / ${calendar.dayBranch}`} />
        <Fact label="日旬空 / 月破" value={`${calendar.dayEmptiness || '_'} / ${calendar.monthBreak || '_'}`} />
        <Fact label="宫位" value={`${plot.view.palace}宫 · ${plot.view.palaceFivePhase}`} />
        <Fact label="动爻" value={movingLines} />
      </div>

      <section>
        <h3 className="mb-2 text-xs font-medium text-foreground">六爻简表</h3>
        <div className="overflow-x-auto rounded-xl border border-border/65">
          <table className="w-full min-w-[560px] border-collapse text-xs">
            <thead className="bg-muted/55 text-muted-foreground">
              <tr>
                {['爻位', '四象', '动', '干支', '六亲', '六神', '世应', '变卦'].map(label => (
                  <th key={label} className="border-b border-border/70 px-3 py-2 text-left font-medium">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plot.view.lines.map(line => {
                const changed = changedLines.get(line.position)
                return (
                  <tr key={line.position} className="border-b border-border/45 last:border-0">
                    {[
                      line.position,
                      line.fourSymbol,
                      line.changing ? '是' : '_',
                      line.stemBranch,
                      line.sixKin,
                      line.sixSpirit,
                      line.worldPosition,
                      changed ? `${changed.stemBranch} · ${changed.sixKin}` : '_',
                    ].map((value, index) => (
                      <td key={index} className="whitespace-nowrap px-3 py-2.5 text-foreground/85">{value}</td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-medium text-foreground">五行旺衰</h3>
        <div className="flex flex-wrap gap-2">
          {plot.view.fivePhaseStates.map(item => (
            <span key={item.fivePhase} className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/35 px-3 py-1.5 text-xs">
              <strong className="font-medium text-foreground">{item.fivePhase}</strong>
              <span className="text-muted-foreground">{item.state}</span>
            </span>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-medium text-foreground">神煞</h3>
        <div className="flex flex-wrap gap-2">
          {plot.view.stars.map(star => (
            <div key={star.name} className="inline-flex items-center gap-2 rounded-full border border-border/65 bg-muted/25 px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">{star.name}</span>
              <strong className="font-medium text-foreground">{star.branches || '_'}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2">
      <span className="block text-[10px] text-muted-foreground">{label}</span>
      <strong className="mt-1 block break-words text-xs font-medium leading-5 text-foreground">{value}</strong>
    </div>
  )
}

function composerPlaceholder({
  stage,
  ritualReady,
  plotStatus,
  analysisStatus,
}: {
  stage: FlowStage
  ritualReady: boolean
  plotStatus: RequestStatus
  analysisStatus: RequestStatus
}) {
  if (stage === 'empty') return '一卦一事，写下你真正想问的事'
  if (stage === 'ritual') return ritualReady ? '请先点击“我准备好了”' : '先跟着小象安静下来'
  if (stage === 'casting') return '请完成六次起爻'
  if (plotStatus === 'loading') return '正在排盘'
  if (analysisStatus === 'streaming' || analysisStatus === 'idle') return '正在解读这一卦'
  return '基于这一卦继续追问'
}

function positionLabel(index: LineIndex): string {
  return ({ 1: '初', 2: '二', 3: '三', 4: '四', 5: '五', 6: '上' } as const)[index]
}

function useLongPress({
  holdMs,
  onComplete,
  onTooSoon,
  disabled,
}: {
  holdMs: number
  onComplete: () => void
  onTooSoon: () => void
  disabled: boolean
}) {
  const [holding, setHolding] = useState(false)
  const [progress, setProgress] = useState(0)
  const [charged, setCharged] = useState(false)
  const startRef = useRef(0)
  const rafRef = useRef(0)
  const reachedRef = useRef(false)
  const holdingRef = useRef(false)
  const activePointerIdRef = useRef<number | null>(null)
  const activePointerTargetRef = useRef<HTMLButtonElement | null>(null)

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
  }, [])

  const tick = useCallback(() => {
    const nextProgress = Math.min(1, (performance.now() - startRef.current) / holdMs)
    setProgress(nextProgress)
    if (nextProgress >= 1) {
      reachedRef.current = true
      setCharged(true)
    } else {
      rafRef.current = requestAnimationFrame(tick)
    }
  }, [holdMs])

  const start = useCallback(() => {
    if (disabled || holdingRef.current) return
    holdingRef.current = true
    reachedRef.current = false
    startRef.current = performance.now()
    setHolding(true)
    setCharged(false)
    setProgress(0)
    stop()
    rafRef.current = requestAnimationFrame(tick)
  }, [disabled, stop, tick])

  const releasePointerCapture = useCallback(() => {
    const pointerId = activePointerIdRef.current
    const target = activePointerTargetRef.current
    if (pointerId !== null && target?.hasPointerCapture?.(pointerId)) {
      target.releasePointerCapture(pointerId)
    }
    activePointerIdRef.current = null
    activePointerTargetRef.current = null
  }, [])

  const end = useCallback(() => {
    if (!holdingRef.current) return
    holdingRef.current = false
    releasePointerCapture()
    stop()
    setHolding(false)
    setCharged(false)
    setProgress(0)
    if (reachedRef.current || performance.now() - startRef.current >= holdMs) onComplete()
    else onTooSoon()
  }, [holdMs, onComplete, onTooSoon, releasePointerCapture, stop])

  const cancel = useCallback(() => {
    holdingRef.current = false
    releasePointerCapture()
    stop()
    setHolding(false)
    setCharged(false)
    setProgress(0)
  }, [releasePointerCapture, stop])

  useEffect(() => stop, [stop])

  return {
    holding,
    progress,
    charged,
    handlers: {
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return
        if (disabled || holdingRef.current) return
        event.preventDefault()
        activePointerIdRef.current = event.pointerId
        activePointerTargetRef.current = event.currentTarget
        event.currentTarget.setPointerCapture?.(event.pointerId)
        start()
      },
      onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
        if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) return
        end()
      },
      onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => {
        if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) return
        cancel()
      },
      onLostPointerCapture: () => {
        activePointerIdRef.current = null
        activePointerTargetRef.current = null
      },
      onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault(),
      onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
          event.preventDefault()
          start()
        }
      },
      onKeyUp: (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault()
          end()
        }
      },
      onBlur: () => cancel(),
    },
  }
}
