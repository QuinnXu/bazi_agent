export interface BaziHourOption {
  value: string
  label: string
}

export interface BaziHourGroup {
  label: string
  rangeLabel: string
  hours: BaziHourOption[]
}

function formatHourOption(hour: number): BaziHourOption {
  const paddedHour = hour.toString().padStart(2, '0')
  const twelveHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  const period =
    hour < 6 ? '凌晨'
      : hour < 12 ? '上午'
        : hour < 18 ? '下午'
          : '晚上'

  return {
    value: String(hour),
    label: `${paddedHour}时（${period}${twelveHour}点）`,
  }
}

function hourRange(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, index) => formatHourOption(start + index))
}

export const BAZI_HOUR_GROUPS: BaziHourGroup[] = [
  { label: '凌晨', rangeLabel: '00-05时', hours: hourRange(0, 5) },
  { label: '上午', rangeLabel: '06-11时', hours: hourRange(6, 11) },
  { label: '下午', rangeLabel: '12-17时', hours: hourRange(12, 17) },
  { label: '晚上', rangeLabel: '18-23时', hours: hourRange(18, 23) },
]

export function normalizeBaziHourValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const hour = Number(value)
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return String(value)
  return String(hour)
}
