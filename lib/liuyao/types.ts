import type { DivinationView } from 'liuyao-typescript'

export type CoinFace = 'yang' | 'yin'

export const COIN_RULE = {
  yang: 3,
  yin: 2,
} as const

export type LineTotal = 6 | 7 | 8 | 9
export type LineType = '老阴' | '少阳' | '少阴' | '老阳'
export type LineIndex = 1 | 2 | 3 | 4 | 5 | 6
export type LineName = '初爻' | '二爻' | '三爻' | '四爻' | '五爻' | '上爻'

export interface LineCast {
  lineIndex: LineIndex
  lineName: LineName
  castTime: string
  triggerEventId: string
  coins: CoinFace[]
  coinValues: number[]
  total: LineTotal
  lineType: LineType
  moving: boolean
  locked: true
}

export interface DivinationSession {
  sessionId: string
  question: string
  questionLockedAt: string
  method: 'app_simulated_coins'
  coinRule: {
    yang: 3
    yin: 2
  }
  status: 'casting' | 'completed' | 'plotted'
  lines: LineCast[]
}

export type DivinationMachineState = 'question' | 'casting' | 'reading'

export interface PlotPayload {
  sessionId: string
  question: string
  linesBottomToTop: LineTotal[]
  movingLines: LineIndex[]
  rawLineRecords: LineCast[]
}

export interface PlotTimeSelection {
  choice: 'last_line'
  label: string
  iso: string
  offsetMinutes: number
  display: string
}

export interface LiuYaoCalendarInfo {
  stemBranchFull: string
  yearPillar: string
  monthPillar: string
  dayPillar: string
  hourPillar: string
  dayEmptiness: string
  monthBranch: string
  dayBranch: string
  monthBreak: string
}

export interface LiuYaoPlotResult {
  payload: PlotPayload
  time: PlotTimeSelection
  view: DivinationView
  calendar?: LiuYaoCalendarInfo
}

export interface LiuYaoAnalysisRequest {
  reportDepth: 'balanced'
  question: string
  session: DivinationSession
  plot: LiuYaoPlotResult
}

export type LiuYaoMessageKind =
  | 'liuyao_question'
  | 'liuyao_ritual'
  | 'liuyao_analysis'
  | 'liuyao_followup'

export interface LiuYaoMessageMetadata {
  kind: LiuYaoMessageKind
  status?: 'pending' | 'completed' | 'error'
}

export interface LiuYaoContextPayload {
  question: string
  status: 'completed'
  session: DivinationSession
  plot: LiuYaoPlotResult
}

export interface LiuYaoStoredMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  mode: 'liuyao'
  model: string | null
  tokens_used: number | null
  metadata: LiuYaoMessageMetadata
  created_at: string
}
