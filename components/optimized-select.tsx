"use client"

import React, { memo, useMemo } from "react"
import { ChevronDown } from "lucide-react"

interface Option {
  value: string;
  label: string;
}

interface OptimizedSelectProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: Option[] | string[];
  placeholder: string;
  disabled?: boolean;
  className?: string;
}

const OptimizedSelect = memo(function OptimizedSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  className = ""
}: OptimizedSelectProps) {
  const renderOptions = useMemo(() => {
    return options.map((option, index) => {
      const optionValue = typeof option === 'string' ? option : option.value;
      const optionLabel = typeof option === 'string' ? option : option.label;
      
      return (
        <option key={`${optionValue}-${index}`} value={optionValue}>
          {optionLabel}
        </option>
      );
    });
  }, [options]);

  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`w-full px-3 py-2 rounded-lg bg-white/60 border border-neutral-200/40 text-neutral-800 focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300 appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        <option value="">{placeholder}</option>
        {renderOptions}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
    </div>
  );
});

export { OptimizedSelect };