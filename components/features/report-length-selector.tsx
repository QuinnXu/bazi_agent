import type { FeatureReportLength } from '@/lib/feature-types'

interface ReportLengthSelectorProps {
  value: FeatureReportLength
  onChange: (value: FeatureReportLength) => void
  disabled?: boolean
}

const REPORT_LENGTH_OPTIONS: Array<{
  value: FeatureReportLength
  label: string
  length: string
  description: string
}> = [
  {
    value: 'concise',
    label: '简洁结论',
    length: '约 500–900 字',
    description: '先给结论，保留关键依据与行动提醒',
  },
  {
    value: 'balanced',
    label: '均衡分析',
    length: '约 1800–3600 字',
    description: '完整覆盖主要阶段、风险与建议',
  },
  {
    value: 'detailed',
    label: '深度报告',
    length: '长篇充分展开',
    description: '细看关键节点、命理依据与专项策略',
  },
]

export function ReportLengthSelector({
  value,
  onChange,
  disabled = false,
}: ReportLengthSelectorProps) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">报告长度</p>
        <span className="text-[11px] text-muted-foreground/65">默认均衡，可按需调整</span>
      </div>
      <div
        role="radiogroup"
        aria-label="报告长度"
        className="grid gap-2 sm:grid-cols-3"
      >
        {REPORT_LENGTH_OPTIONS.map(option => {
          const selected = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={`min-w-0 rounded-lg border px-3 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? 'border-primary/50 bg-primary/10 shadow-sm'
                  : 'border-border/60 bg-card/60 hover:border-primary/30 hover:bg-card/80'
              }`}
            >
              <span className={`block text-sm font-medium ${selected ? 'text-primary' : 'text-foreground'}`}>
                {option.label}
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground/75">
                {option.length}
              </span>
              <span className="mt-2 block text-xs font-light leading-5 text-muted-foreground">
                {option.description}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
