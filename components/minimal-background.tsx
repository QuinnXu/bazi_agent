"use client"

import React, { memo } from "react"

const MinimalBackground = memo(function MinimalBackground() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,oklch(0.992_0.004_80)_0%,oklch(0.986_0.006_80)_42%,oklch(0.965_0.011_250)_100%)]" />
      <div className="absolute inset-0 opacity-[0.28] [background-image:linear-gradient(to_right,oklch(0.895_0.012_250/0.55)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.895_0.012_250/0.45)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_76%,transparent)]" />
      <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent_0%,oklch(0.696_0.137_3.34/0.04)_42%,transparent_68%)]" />
    </div>
  );
});

export { MinimalBackground };
