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
      <div className="pl-16 pr-16 md:pl-20 md:pr-20 pt-3 pb-3 border-b border-border/40 bg-card/30 backdrop-blur-sm flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={onBack}
              disabled={loading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all disabled:opacity-40"
            >
              <ArrowLeft className="w-4 h-4" />
              返回
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

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>第</span>
              <span className="text-foreground font-medium">{step}</span>
              <span>/</span>
              <span>{totalSteps}</span>
              <span>步</span>
            </div>
          </div>

          {/* Progress + step labels */}
          <div className="mt-3 space-y-1.5">
            <div className="h-1 rounded-full bg-muted/60 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
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
      <div className="px-4 md:px-6 py-3 border-t border-border/40 bg-card/30 backdrop-blur-sm flex-shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <button
            onClick={onPrev}
            disabled={!canPrev || step === 1 || loading}
            className="px-5 py-2.5 rounded-full text-sm font-light text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
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
                需消耗 <span className="text-primary">🍎 × {cost}</span>
              </span>
            ) : null}
          </div>

          {isLastStep ? (
            <button
              onClick={onSubmit}
              disabled={!canSubmit || loading}
              className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-light hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              开始分析
            </button>
          ) : (
            <button
              onClick={onNext}
              disabled={!canNext || loading}
              className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-light hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              下一步
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
