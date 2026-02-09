"use client"

import React, { useState } from 'react'
import { Users, Lock } from 'lucide-react'

// ==================== 多人合盘 Prompt ====================
// 非 ULTRA 模式 (DeepSeek)
const HEPAN_DEEPSEEK_PROMPT = `你是'卜卜象'，一个精通八字命理又善解人意积极乐观的温柔可爱小象。请主要用盲派八字的理论，结合旺衰、子平等分析并答复用户的咨询。

请根据两位命主的八字信息，进行详细的合盘分析：
- 分析两人日柱天干的合化关系（如甲己合、乙庚合等），判断基本缘分强度
- 分析两人八字中五行的互补与冲克关系
- 结合年柱、月柱、日柱、时柱的相互作用，判断感情或合作的和谐程度
- 分析两人大运流年的交互影响，指出关系发展的关键时间节点
- 针对感情、合作、家庭等不同方面给出具体建议
- 用积极乐观的态度给予回复，客观指出需要磨合的方面
- 用通俗易懂的语言，结合具体情况展开解释`

// ULTRA 模式 (Gemini)
const HEPAN_GEMINI_PROMPT = `你是'卜卜象'，一个精通八字命理又善解人意积极乐观的温柔可爱小象。请主要用盲派八字的理论，结合旺衰、子平等分析并答复用户的咨询。

请根据两位命主的八字信息，进行详细的合盘分析：
- 分析两人日柱天干的合化关系（如甲己合、乙庚合等），判断基本缘分强度
- 分析两人八字中五行的互补与冲克关系
- 结合年柱、月柱、日柱、时柱的相互作用，判断感情或合作的和谐程度
- 分析两人大运流年的交互影响，指出关系发展的关键时间节点
- 针对感情、合作、家庭等不同方面给出具体建议
- 用积极乐观的态度给予回复，客观指出需要磨合的方面
- 用通俗易懂的语言，结合具体情况展开解释`

export function FeatureHePan() {
  const [isUltraMode, setIsUltraMode] = useState(false)

  const currentPrompt = isUltraMode ? HEPAN_GEMINI_PROMPT : HEPAN_DEEPSEEK_PROMPT

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12 overflow-y-auto">
      <div className="max-w-lg w-full text-center space-y-8">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Users className="w-10 h-10 text-primary" />
          </div>
        </div>

        {/* Title & Description */}
        <div className="space-y-3">
          <h2 className="text-3xl font-light text-foreground">多人合盘</h2>
          <p className="text-base text-muted-foreground font-light leading-relaxed max-w-md mx-auto">
            选择两位人物的八字信息，AI 将深度分析两人之间的缘分、相合度、互补关系等，助你看清感情与合作的方向。
          </p>
        </div>

        {/* Placeholder UI */}
        <div className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl p-6 space-y-4 glass-minimal text-left">
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-dashed border-border/60 rounded-xl p-4 space-y-2">
              <div className="w-10 h-10 rounded-full bg-muted mx-auto flex items-center justify-center">
                <Users className="w-5 h-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground/60 text-center">选择人物 A</p>
            </div>
            <div className="border border-dashed border-border/60 rounded-xl p-4 space-y-2">
              <div className="w-10 h-10 rounded-full bg-muted mx-auto flex items-center justify-center">
                <Users className="w-5 h-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground/60 text-center">选择人物 B</p>
            </div>
          </div>

          {/* ULTRA mode toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">模型选择</span>
            <button
              onClick={() => setIsUltraMode(!isUltraMode)}
              className={`flex items-center justify-center w-16 h-8 rounded-full border transition-all duration-300 ${
                isUltraMode
                  ? 'bg-card text-foreground border-primary/60 shadow-sm'
                  : 'bg-transparent text-muted-foreground/50 border-border/50 hover:text-muted-foreground hover:border-border'
              }`}
            >
              <span className={`text-xs font-light transition-all duration-300 ${isUltraMode ? 'text-primary' : ''}`}>ULTRA</span>
            </button>
          </div>

          {/* Prompt display area */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Prompt ({isUltraMode ? 'ULTRA / Gemini' : 'DeepSeek'})
            </label>
            <textarea
              disabled
              value={currentPrompt}
              className="w-full h-32 px-3 py-2 rounded-xl border border-border/60 bg-muted/30 text-xs text-muted-foreground/70 resize-none font-mono leading-relaxed cursor-default"
            />
          </div>

          <button
            disabled
            className="w-full py-3 rounded-xl bg-primary/30 text-primary-foreground/50 text-sm font-light cursor-not-allowed"
          >
            开始合盘分析
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
