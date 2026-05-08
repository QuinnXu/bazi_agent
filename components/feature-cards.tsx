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
    title: '合盘',
    description: '两人或多人缘分碰撞，看看彼此的能量如何流动 🌹',
    cost: 2,
    icon: Users,
    accent: 'rose',
  },
  {
    id: 'fortune',
    title: '运势',
    description: '近期能量起伏与行事天气预报，提前看清风向 🌤️',
    cost: 1,
    icon: CalendarRange,
    accent: 'gold',
  },
  {
    id: 'avatar',
    title: '头像',
    description: '用色彩和风格滋养你的面相，让气场更顺 🌸',
    cost: 3,
    icon: ImageIcon,
    accent: 'violet',
  },
  {
    id: 'lifepath',
    title: '人生脉络',
    description: '铺展你的专属大运长卷，看见属于你的人生风景 📜',
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
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {ITEMS.map(item => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => onPick(item.id)}
              className="group min-h-[82px] min-w-0 rounded-lg border border-border bg-card/76 p-2.5 text-left backdrop-blur-sm transition-all duration-200 hover:border-primary/35 hover:bg-card hover:shadow-sm sm:min-h-[104px] sm:p-3"
            >
              <div className="flex h-full flex-col justify-between gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={`h-7 w-7 rounded-md flex items-center justify-center border ${ACCENT_BG[item.accent]} flex-shrink-0 sm:h-8 sm:w-8`}
                  >
                    <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </div>
                  <span className="whitespace-nowrap rounded-md border border-primary/15 bg-primary/8 px-1.5 py-0.5 text-[10px] font-light text-primary/80">
                    苹果 ×{item.cost}
                  </span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-foreground leading-snug truncate">
                    {item.title}
                  </h3>
                  <p className="mt-1 line-clamp-1 text-[11px] font-light leading-snug text-muted-foreground sm:text-xs">
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
