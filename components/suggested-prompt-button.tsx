"use client"

import React, { memo } from "react"

interface SuggestedPromptButtonProps {
  prompt: string;
  onClick: (prompt: string) => void;
}

const SuggestedPromptButton = memo(function SuggestedPromptButton({
  prompt,
  onClick
}: SuggestedPromptButtonProps) {
  const handleClick = () => {
    // Use requestAnimationFrame to defer the heavy operation
    requestAnimationFrame(() => {
      onClick(prompt);
    });
  };

  return (
    <button
      onClick={handleClick}
      className="px-4 py-2 rounded-full bg-white/60 backdrop-blur-sm border border-neutral-200/50 text-neutral-700 text-sm font-light hover:bg-white/80 hover:border-neutral-300/60 transition-all duration-300"
    >
      {prompt}
    </button>
  );
});

export { SuggestedPromptButton };