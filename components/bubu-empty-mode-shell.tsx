"use client"

import Image from 'next/image'
import React from 'react'

interface BubuEmptyModeShellProps {
  modeKey: string
  title: string
  description: React.ReactNode
  modeSwitch?: React.ReactNode
  cards: React.ReactNode
  footer?: React.ReactNode
}

export function BubuEmptyModeShell({
  modeKey,
  title,
  description,
  modeSwitch,
  cards,
  footer,
}: BubuEmptyModeShellProps) {
  return (
    <div className="flex min-h-[calc(100dvh-14rem)] items-center justify-center py-6 md:py-8">
      <div className="bubu-empty-grid">
        <div className="bubu-empty-logo-slot">
          <div className="relative h-16 w-16 sm:h-24 sm:w-24">
            <Image
              src="/logo.jpg"
              alt="卜卜象"
              fill
              className="rounded-full object-contain shadow-sm"
              priority
            />
          </div>
        </div>

        <div key={`${modeKey}-copy`} className="bubu-empty-copy-slot bubu-mode-enter">
          <h1 className="text-3xl font-light leading-tight text-foreground sm:text-4xl md:text-5xl">
            {title}
          </h1>
          <p className="mx-auto max-w-xl px-4 text-sm font-light leading-relaxed text-muted-foreground md:text-base">
            {description}
          </p>
        </div>

        <div className="bubu-empty-switch-slot">
          {modeSwitch}
        </div>

        <div key={`${modeKey}-cards`} className="bubu-empty-cards-slot bubu-mode-enter">
          {cards}
        </div>

        <div className="bubu-empty-footer-slot">
          {footer}
        </div>
      </div>
    </div>
  )
}
