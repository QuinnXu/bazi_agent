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
      <div className="relative bg-white/95 backdrop-blur-sm border border-neutral-200/40 rounded-2xl p-6 max-w-sm w-full shadow-xl">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-neutral-600" />
        </button>

        {/* 标题 */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
            <Heart className="w-4 h-4 text-red-500" />
          </div>
          <h2 className="text-xl font-light text-neutral-800">感谢打赏</h2>
        </div>

        {/* 内容 */}
        <div className="text-center space-y-4">
          <p className="text-sm text-neutral-600 font-light">
            感谢您的支持，您的打赏是我们持续改进的动力
          </p>
          
          {/* 二维码 */}
          <div className="flex justify-center">
            <div className="bg-white p-4 rounded-lg border border-neutral-200/40 shadow-sm">
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
          
          <p className="text-xs text-neutral-500 font-light">
            扫码支持我们的工作
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
        className="fixed bottom-20 right-4 w-12 h-12 rounded-full bg-gradient-to-r from-red-400 to-pink-500 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 flex items-center justify-center group"
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
