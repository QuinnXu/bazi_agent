"use client"

import React, { memo } from "react"

const MinimalBackground = memo(function MinimalBackground() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      {/* 粉晶渐变背景 */}
      <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.986_0.037_24.56)] via-[oklch(0.995_0.025_25)] to-[oklch(0.980_0.035_22.65)]" />
      
      {/* 柔和光晕效果 */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,oklch(0.696_0.137_3.34/0.08)_0%,transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,oklch(0.844_0.115_40.07/0.06)_0%,transparent_50%)]" />
      
      {/* 星点/粒子效果 - 使用 CSS 实现，保持性能 */}
      <div className="absolute inset-0 opacity-40">
        <div className="absolute top-[20%] left-[15%] w-1 h-1 rounded-full bg-[oklch(0.844_0.115_40.07/0.6)] blur-[0.5px]" />
        <div className="absolute top-[35%] left-[45%] w-0.5 h-0.5 rounded-full bg-[oklch(0.696_0.137_3.34/0.5)] blur-[0.5px]" />
        <div className="absolute top-[50%] left-[75%] w-1 h-1 rounded-full bg-[oklch(0.844_0.115_40.07/0.5)] blur-[0.5px]" />
        <div className="absolute top-[65%] left-[25%] w-0.5 h-0.5 rounded-full bg-[oklch(0.696_0.137_3.34/0.4)] blur-[0.5px]" />
        <div className="absolute top-[80%] left-[60%] w-1 h-1 rounded-full bg-[oklch(0.844_0.115_40.07/0.4)] blur-[0.5px]" />
        <div className="absolute top-[15%] left-[85%] w-0.5 h-0.5 rounded-full bg-[oklch(0.696_0.137_3.34/0.5)] blur-[0.5px]" />
        <div className="absolute top-[40%] left-[10%] w-1 h-1 rounded-full bg-[oklch(0.844_0.115_40.07/0.5)] blur-[0.5px]" />
        <div className="absolute top-[70%] left-[90%] w-0.5 h-0.5 rounded-full bg-[oklch(0.696_0.137_3.34/0.4)] blur-[0.5px]" />
      </div>
    </div>
  );
});

export { MinimalBackground };
