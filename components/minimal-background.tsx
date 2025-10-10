"use client"

import React, { memo } from "react"

const MinimalBackground = memo(function MinimalBackground() {
  return (
    <div className="absolute inset-0 -z-10">
      {/* 静态背景，避免动画和复杂计算 */}
      <div className="absolute inset-0 bg-gradient-to-br from-neutral-100 via-white to-neutral-100 opacity-50" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(120,120,120,0.1)_0%,transparent_50%)]" />
    </div>
  );
});

export { MinimalBackground };
