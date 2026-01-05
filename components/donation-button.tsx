"use client"

import React, { useState } from "react"
import { Heart, X } from "lucide-react"
import Image from "next/image"

interface DonationDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

function DonationDialog({ isOpen, onClose }: DonationDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div 
        className="fixed inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* 弹窗内容 */}
      <div className="relative bg-card/95 backdrop-blur-sm border border-border rounded-2xl p-6 max-w-sm w-full shadow-xl glass-minimal">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 w-8 h-8 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* 标题 */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <Heart className="w-4 h-4 text-primary" />
          </div>
          <h2 className="text-xl font-light text-foreground">感谢投喂</h2>
        </div>

        {/* 内容 */}
        <div className="text-center space-y-4">
          <p className="text-sm text-muted-foreground font-light">
            给卜卜象买个苹果🍎
          </p>
          
          {/* 二维码 */}
          <div className="flex justify-center">
            <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
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
          
          <p className="text-xs text-muted-foreground font-light">
            谢谢！谢谢！
          </p>
        </div>
      </div>
    </div>
  );
}

export function DonationButton() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsDialogOpen(true)}
        className="fixed bottom-20 right-4 w-12 h-12 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 flex items-center justify-center group"
        title="打赏支持"
      >
        <Heart className="w-5 h-5 group-hover:animate-pulse" />
      </button>
      
      <DonationDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
      />
    </>
  );
}
