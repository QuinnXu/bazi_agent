"use client"

import React from 'react'
import { Users, CalendarRange, ImageIcon, Compass } from 'lucide-react'
import type { FeatureType } from '@/components/app-sidebar'
import { BUBU_COPY } from '@/lib/bubu-content'

interface FeatureCardItem {
  id: Exclude<FeatureType, 'chat'>
  title: string
  description: string
  cost: number
  icon: React.ElementType
  accent: 'rose' | 'gold' | 'violet' | 'teal'
}

const ITEM_ICONS: Record<FeatureCardItem['id'], React.ElementType> = {
  hepan: Users,
  fortune: CalendarRange,
  avatar: ImageIcon,
  lifepath: Compass,
}

const ITEM_ACCENTS: Record<FeatureCardItem['id'], FeatureCardItem['accent']> = {
  hepan: 'rose',
  fortune: 'gold',
  avatar: 'violet',
  lifepath: 'teal',
}

const ITEMS: FeatureCardItem[] = BUBU_COPY.featureCards.items.map(item => ({
  ...item,
  icon: ITEM_ICONS[item.id],
  accent: ITEM_ACCENTS[item.id],
}))

const ACCENT_BG: Record<FeatureCardItem['accent'], string> = {
  rose: 'bg-[oklch(0.696_0.137_3.34)]/12 text-[oklch(0.696_0.137_3.34)] border-[oklch(0.696_0.137_3.34)]/20',
  gold: 'bg-[oklch(0.844_0.115_40.07)]/15 text-[oklch(0.65_0.115_40.07)] border-[oklch(0.844_0.115_40.07)]/30',
  violet: 'bg-[oklch(0.660_0.116_243.69)]/12 text-[oklch(0.660_0.116_243.69)] border-[oklch(0.660_0.116_243.69)]/25',
  teal: 'bg-[oklch(0.762_0.060_171.34)]/15 text-[oklch(0.55_0.080_171.34)] border-[oklch(0.762_0.060_171.34)]/30',
}

interface FeatureCardsProps {
  onPick: (feature: Exclude<FeatureType, 'chat'>) => void
  showCost?: boolean
}

export function FeatureCards({ onPick, showCost = true }: FeatureCardsProps) {
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
                  {showCost && (
                    <span className="whitespace-nowrap rounded-md border border-primary/15 bg-primary/8 px-1.5 py-0.5 text-[10px] font-light text-primary/80">
                      苹果 ×{item.cost}
                    </span>
                  )}
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
