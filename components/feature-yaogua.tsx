"use client"

import React from 'react'
import { Sparkles, Lock, RotateCcw } from 'lucide-react'

export function FeatureYaoGua() {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full text-center space-y-8">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-primary" />
          </div>
        </div>

        {/* Title & Description */}
        <div className="space-y-3">
          <h2 className="text-3xl font-light text-foreground">卜卜象爻卦</h2>
          <p className="text-base text-muted-foreground font-light leading-relaxed max-w-md mx-auto">
            心中默念你想问的事情，让卜卜象帮你摇出一卦。AI 结合易经六十四卦，为你解读卦象，指引方向。
          </p>
        </div>

        {/* Placeholder UI */}
        <div className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl p-6 space-y-5 glass-minimal">
          {/* Hexagram display placeholder */}
          <div className="border border-dashed border-border/60 rounded-xl p-6 space-y-3">
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex justify-center gap-2">
                  <div className="h-2 w-16 rounded bg-muted" />
                  {i % 2 === 1 && <div className="h-2 w-4 bg-transparent" />}
                  {i % 2 === 1 && <div className="h-2 w-16 rounded bg-muted" />}
                  {i % 2 === 0 && <div className="h-2 w-36 rounded bg-muted" />}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground/50 pt-2">卦象将在这里显示</p>
          </div>

          {/* Shake button */}
          <button
            disabled
            className="w-full py-3 rounded-xl bg-primary/30 text-primary-foreground/50 text-sm font-light cursor-not-allowed flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            摇卦
          </button>
        </div>

        {/* Coming Soon Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/60 border border-border/50">
          <Lock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground font-light">功能即将上线，敬请期待</span>
        </div>
      </div>
    </div>
  )
}
