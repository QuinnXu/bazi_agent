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
  rose: 'bg-[oklch(0.705_0.158_357.00)]/12 text-[oklch(0.705_0.158_357.00)] border-[oklch(0.705_0.158_357.00)]/20',
  gold: 'bg-[oklch(0.875_0.145_78.00)]/15 text-[oklch(0.65_0.115_40.07)] border-[oklch(0.875_0.145_78.00)]/30',
  violet: 'bg-[oklch(0.660_0.116_243.69)]/12 text-[oklch(0.660_0.116_243.69)] border-[oklch(0.660_0.116_243.69)]/25',
  teal: 'bg-[oklch(0.762_0.060_171.34)]/15 text-[oklch(0.55_0.080_171.34)] border-[oklch(0.762_0.060_171.34)]/30',
}

interface FeatureCardsProps {
  onPick: (feature: Exclude<FeatureType, 'chat'>) => void
  showCost?: boolean
  variant?: 'cards' | 'pills'
}

export function FeatureCards({ onPick, showCost = true, variant = 'cards' }: FeatureCardsProps) {
  if (variant === 'pills') {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-center gap-2">
        {ITEMS.map(item => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onPick(item.id)}
              className="inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-full border border-border bg-card/86 px-3 text-sm font-light text-muted-foreground shadow-sm backdrop-blur-sm transition-[color,background-color,border-color,box-shadow,transform] duration-150 hover:border-primary/35 hover:bg-card hover:text-foreground active:scale-[0.98] sm:px-4"
              title={item.description}
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${ACCENT_BG[item.accent]}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="whitespace-nowrap">{item.title}</span>
              {showCost && (
                <span className="hidden text-xs text-muted-foreground/70 sm:inline">
                  ×{item.cost}
                </span>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {ITEMS.map(item => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onPick(item.id)}
              className="group h-[132px] min-w-0 rounded-lg border border-border bg-card/76 p-3 text-left backdrop-blur-sm transition-[color,background-color,border-color,box-shadow,transform] duration-150 hover:border-primary/35 hover:bg-card hover:shadow-sm active:scale-[0.99] sm:h-[132px]"
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
