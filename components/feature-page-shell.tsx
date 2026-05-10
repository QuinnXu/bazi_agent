"use client"

import React from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'

interface FeaturePageShellProps {
  title: string
  subtitle?: string
  step: number // 1-indexed
  totalSteps: number
  stepLabels?: string[]
  onBack: () => void
  onPrev?: () => void
  onNext?: () => void
  onSubmit?: () => void
  canPrev?: boolean
  canNext?: boolean
  canSubmit?: boolean
  isLastStep?: boolean
  loading?: boolean
  loadingText?: string
  cost?: number // apples to consume
  children: React.ReactNode
}

export function FeaturePageShell({
  title,
  subtitle,
  step,
  totalSteps,
  stepLabels,
  onBack,
  onPrev,
  onNext,
  onSubmit,
  canPrev = true,
  canNext = false,
  canSubmit = false,
  isLastStep = false,
  loading = false,
  loadingText = '小象正在认真思考中…',
  cost,
  children,
}: FeaturePageShellProps) {
  const progress = Math.round((step / Math.max(totalSteps, 1)) * 100)

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* ---- Top bar ---- */}
      {/* pl/pr-16 leave room for floating sidebar toggle (left) and user menu (right) */}
      <div className="pl-16 pr-16 md:pl-20 md:pr-20 pt-3 pb-3 border-b border-border/50 bg-background/82 backdrop-blur-xl flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={onBack}
              disabled={loading}
              className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all disabled:opacity-40"
            >
              <ArrowLeft className="w-4 h-4" />
              回聊天
            </button>

            <div className="flex-1 text-center min-w-0">
              <h1 className="text-base md:text-lg font-light text-foreground truncate">
                {title}
              </h1>
              {subtitle && (
                <p className="text-[11px] text-muted-foreground/80 truncate mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground">
              <span className="text-foreground font-medium">{step}</span>
              <span>/</span>
              <span>{totalSteps}</span>
            </div>
          </div>

          {/* Progress + step labels */}
          <div className="mt-3 space-y-1.5">
            <div className="h-1 rounded-full bg-muted/70 overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            {stepLabels && stepLabels.length > 0 && (
              <div className="flex justify-between text-[10px] text-muted-foreground/70">
                {stepLabels.map((label, i) => (
                  <span
                    key={i}
                    className={`truncate ${i + 1 <= step ? 'text-primary/80' : ''}`}
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---- Body ---- */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
        <div className="max-w-3xl mx-auto">{children}</div>
      </div>

      {/* ---- Footer ---- */}
      <div className="px-4 md:px-6 py-3 border-t border-border/50 bg-background/82 backdrop-blur-xl flex-shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <button
            onClick={onPrev}
            disabled={!canPrev || step === 1 || loading}
            className="h-9 rounded-lg px-4 text-sm font-light text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            上一步
          </button>

          <div className="flex-1 text-center text-[11px] text-muted-foreground/70">
            {loading ? (
              <span className="inline-flex items-center gap-2 text-primary/80">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {loadingText}
              </span>
            ) : isLastStep && cost !== undefined ? (
              <span>
                小象会吃 <span className="text-primary">苹果 × {cost}</span>
              </span>
            ) : null}
          </div>

          {isLastStep ? (
            <button
              onClick={onSubmit}
              disabled={!canSubmit || loading}
              className="flex h-9 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-light text-primary-foreground hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              让小象开看
            </button>
          ) : (
            <button
              onClick={onNext}
              disabled={!canNext || loading}
              className="h-9 rounded-lg bg-primary px-5 text-sm font-light text-primary-foreground hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              下一步
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
