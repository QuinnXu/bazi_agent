"use client"

import React from 'react'
import { Users, CalendarRange, ImageIcon, Compass } from 'lucide-react'
import type { FeatureType } from '@/components/app-sidebar'

interface FeatureCardItem {
  id: Exclude<FeatureType, 'chat'>
  title: string
  description: string
  cost: number
  icon: React.ElementType
  accent: 'rose' | 'gold' | 'violet' | 'teal'
}

const ITEMS: FeatureCardItem[] = [
  {
    id: 'hepan',
    title: '合盘 · 双人 / 多人 / 应事',
    description: '看看你们的缘分倾向、互动模式与关键时间节点',
    cost: 2,
    icon: Users,
    accent: 'rose',
  },
  {
    id: 'fortune',
    title: '近期运势推演',
    description: '选时间段，逐日 / 逐月给出走势与行动建议',
    cost: 1,
    icon: CalendarRange,
    accent: 'gold',
  },
  {
    id: 'avatar',
    title: '头像分析推荐',
    description: '上传头像，结合气质与五行给风格与配色建议',
    cost: 3,
    icon: ImageIcon,
    accent: 'violet',
  },
  {
    id: 'lifepath',
    title: '人生脉络与总体分析',
    description: '从第一步大运到晚年，一起看清整段人生节奏',
    cost: 2,
    icon: Compass,
    accent: 'teal',
  },
]

const ACCENT_BG: Record<FeatureCardItem['accent'], string> = {
  rose: 'bg-[oklch(0.696_0.137_3.34)]/12 text-[oklch(0.696_0.137_3.34)] border-[oklch(0.696_0.137_3.34)]/20',
  gold: 'bg-[oklch(0.844_0.115_40.07)]/15 text-[oklch(0.65_0.115_40.07)] border-[oklch(0.844_0.115_40.07)]/30',
  violet: 'bg-[oklch(0.660_0.116_243.69)]/12 text-[oklch(0.660_0.116_243.69)] border-[oklch(0.660_0.116_243.69)]/25',
  teal: 'bg-[oklch(0.762_0.060_171.34)]/15 text-[oklch(0.55_0.080_171.34)] border-[oklch(0.762_0.060_171.34)]/30',
}

interface FeatureCardsProps {
  onPick: (feature: Exclude<FeatureType, 'chat'>) => void
}

export function FeatureCards({ onPick }: FeatureCardsProps) {
  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="text-center mb-3 sm:mb-4">
        <p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-muted-foreground/70 font-light">
          想试试结构化的小象功能？
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 md:gap-4">
        {ITEMS.map(item => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => onPick(item.id)}
              className="group text-left rounded-2xl border border-border bg-card/70 backdrop-blur-sm p-3.5 sm:p-4 md:p-5 hover:bg-card/90 hover:border-primary/40 hover:shadow-md transition-all duration-300 glass-minimal"
            >
              <div className="flex items-start gap-2.5 sm:gap-3">
                <div
                  className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center border ${ACCENT_BG[item.accent]} flex-shrink-0`}
                >
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm md:text-base font-medium text-foreground leading-snug">
                      {item.title}
                    </h3>
                    <span className="text-[10px] sm:text-[11px] text-primary/80 bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5 whitespace-nowrap font-light flex-shrink-0">
                      🍎×{item.cost}
                    </span>
                  </div>
                  <p className="text-xs md:text-sm text-muted-foreground font-light leading-relaxed mt-1">
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
