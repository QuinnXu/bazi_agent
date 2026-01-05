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
      className="px-4 py-2 rounded-full bg-secondary/60 backdrop-blur-sm border border-border text-secondary-foreground text-sm font-light hover:bg-secondary/80 hover:border-primary/40 transition-all duration-300"
    >
      {prompt}
    </button>
  );
});

export { SuggestedPromptButton };