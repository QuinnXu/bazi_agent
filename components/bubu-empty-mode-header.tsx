"use client"

import Image from "next/image"
import type React from "react"

import type { ChatMode } from "@/components/app-sidebar"

interface BubuEmptyModeHeaderProps {
  title: string
  activeMode: ChatMode
  modeSwitch?: React.ReactNode
}

export function BubuEmptyModeHeader({
  title,
  activeMode,
  modeSwitch,
}: BubuEmptyModeHeaderProps) {
  const avatar = activeMode === "liuyao"
    ? {
        src: "/avatar-liuyao-small.png",
        alt: "卜卜卦小象",
        title: "卜卜卦小象",
      }
    : {
        src: "/avatar-small.png",
        alt: "本命屋小象",
        title: "本命屋小象",
      }

  return (
    <div className="mb-5 flex flex-col items-center text-center">
      <div
        className="relative h-28 w-28 overflow-hidden rounded-full border border-primary/30 bg-card shadow-sm ring-4 ring-primary/10 sm:h-32 sm:w-32"
        title={avatar.title}
      >
        <Image
          src={avatar.src}
          alt={avatar.alt}
          fill
          sizes="(min-width: 640px) 128px, 112px"
          className="object-cover"
          priority
        />
      </div>

      {modeSwitch && (
        <div className="mt-4">
          {modeSwitch}
        </div>
      )}

      <h1 className="mt-4 max-w-full whitespace-normal break-keep text-2xl font-light leading-tight text-foreground sm:text-3xl">
        {title}
      </h1>
    </div>
  )
}
