"use client"

import React, { useMemo } from "react"
import { X } from "lucide-react"
import Image from "next/image"
import { BUBU_COPY } from "@/lib/bubu-content"

interface DonationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  appleQuota?: { remaining: number; dailyLimit: number; isPaid: boolean } | null;
}

export function DonationDialog({ isOpen, onClose, appleQuota }: DonationDialogProps) {
  // Pick a stable random message per dialog open
  const randomMessage = useMemo(() => {
    const messages = BUBU_COPY.donation.messages
    return messages[Math.floor(Math.random() * messages.length)]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 弹窗内容 */}
      <div className="relative bg-card/95 backdrop-blur-sm border border-border rounded-2xl p-6 max-w-sm w-full shadow-xl glass-minimal animate-fade-in">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 w-8 h-8 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* 标题 */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-lg">
            🍎
          </div>
          <h2 className="text-xl font-light text-foreground">{BUBU_COPY.donation.title}</h2>
        </div>

        {/* 内容 */}
        <div className="text-center space-y-4">
          {/* 卜卜象口吻的随机文案 */}
          <p className="text-sm text-muted-foreground font-light leading-relaxed">
            {randomMessage}
          </p>

          {/* 苹果余额提示 */}
          {appleQuota && (
            <div className="inline-flex items-center gap-1.5 bg-secondary/50 rounded-full px-3 py-1.5">
              <span className="text-xs font-light text-foreground">
                {BUBU_COPY.donation.quota(appleQuota.remaining)}
              </span>
              {appleQuota.isPaid && (
                <span className="bg-accent/20 text-accent rounded-full px-1.5 py-0.5 text-[10px] font-light">
                  {BUBU_COPY.donation.vipBadge}
                </span>
              )}
            </div>
          )}

          {/* 二维码 */}
          <div className="flex justify-center">
            <div className="bg-card p-4 rounded-xl border border-border shadow-sm">
              <Image
                src="/qr_code.png"
                alt="打赏二维码"
                width={200}
                height={200}
                className="rounded-lg"
                priority
              />
            </div>
          </div>

          {/* 升级提示 */}
          <p className="text-[11px] text-muted-foreground/70 font-light leading-relaxed">
            {BUBU_COPY.donation.vipHint}
          </p>
        </div>
      </div>
    </div>
  );
}

// Keep the old DonationButton export for backward compatibility,
// but it's now unused since page.tsx manages the dialog state directly.
export function DonationButton() {
  return null;
}
