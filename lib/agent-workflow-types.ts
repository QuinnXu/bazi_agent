import type { AgentComplexityMode, AgentReportPreference } from '@/lib/agent-complexity'

export type AgentMessageRole = 'user' | 'assistant' | 'system'

export interface AgentMessage {
  role: AgentMessageRole
  content: string
}

export interface AgentParticipant {
  id?: string | null
  name: string
  baziText?: string | null
  pillars?: string | null
  dayun?: AgentDayunPoint[] | null
}

export interface AgentDayunPoint {
  ageStart: number
  ageEnd: number
  ganZhi: string
  yearStart: number
  yearEnd: number
}

export interface AgentTimeRangeContext {
  label: string
  start: string
  end: string
}

export type AgentOutputDepth = 'chat' | 'concise' | 'balanced' | 'detailed'

export type AgentMatterCategory =
  | 'fortune'
  | 'relationship'
  | 'lifepath'
  | 'event'
  | 'avatar'
  | 'general'

export type AgentSlotConfidence = 'none' | 'low' | 'medium' | 'high'

export interface AgentAskedTime {
  start: string
  end: string
  label: string
  granularity: 'day' | 'month'
  confidence: AgentSlotConfidence
  source: 'explicit' | 'selected' | 'relative_default' | 'context'
}

export interface AgentMatter {
  raw: string
  category: AgentMatterCategory
  focus: string[]
  analysisMode: 'chat' | 'analysis'
  confidence: AgentSlotConfidence
}

export interface AgentResolvedPerson extends AgentParticipant {
  source: 'current' | 'selected' | 'mentioned' | 'pasted'
  confidence: AgentSlotConfidence
}

export interface AgentAnalysisSlots {
  people: AgentResolvedPerson[]
  mentionedNames?: string[]
  unresolvedNames?: string[]
  askedTime: AgentAskedTime | null
  matter: AgentMatter | null
  supplements: string[]
  outputDepth: AgentOutputDepth | null
  confidence: {
    people: AgentSlotConfidence
    time: AgentSlotConfidence
    matter: AgentSlotConfidence
    depth: AgentSlotConfidence
  }
  missingSlot?: 'people' | 'time' | 'matter' | 'depth' | null
}

export interface AgentCalendarContext {
  nowText: string
  today: string
  timezone: 'Asia/Shanghai'
  askedTime: AgentAskedTime | null
  tableText: string
}

export interface AgentAnalysisRequest {
  slots: AgentAnalysisSlots
  calendar: AgentCalendarContext
  depth: Exclude<AgentOutputDepth, 'chat'>
  userQuestion: string
  conversationSummary?: string | null
  promptStyleHint?: string | null
}

export type AgentCorrectionConfidence = 'low' | 'medium' | 'high'

interface AgentCorrectionBase {
  intent: 'correction'
  confidence: AgentCorrectionConfidence
  source?: 'rule' | 'llm'
  reason?: string | null
}

export type AgentWorkflowCorrection =
  | (AgentCorrectionBase & {
      scope: 'person'
      intendedName: string
      rejectedName?: string
      createNew?: boolean
    })
  | (AgentCorrectionBase & {
      scope: 'time'
      timeText: string
    })
  | (AgentCorrectionBase & {
      scope: 'focus'
      focus: string[]
    })
  | (AgentCorrectionBase & {
      scope: 'depth'
      depth: Exclude<AgentOutputDepth, 'chat'>
    })
  | (AgentCorrectionBase & {
      scope: 'profile_data'
      fieldName: string
      value: string
    })

export type PendingAgentStepKind =
  | 'select_person'
  | 'create_profile'
  | 'create_profiles'
  | 'confirm_time'
  | 'confirm_focus'
  | 'select_depth'
  | 'ready_to_analyze'

export type AgentHumanInputKind =
  | 'bazi_profile'
  | 'bazi_profiles'
  | 'profile_required'
  | 'feature_params'

export type AgentHumanInputFieldType =
  | 'text'
  | 'number'
  | 'select'
  | 'choice'
  | 'boolean'
  | 'date'
  | 'time'

export interface AgentConfirmationOption {
  label: string
  value: string
  description?: string
  params?: any
  resumeIntent?: string
  reportPreference?: AgentReportPreference | null
  complexity?: AgentComplexityMode | null
  nextStage?: PendingAgentStepKind
}

export interface AgentHumanInputField {
  name: string
  label: string
  inputType: AgentHumanInputFieldType
  required?: boolean
  value?: string | boolean | number | null
  placeholder?: string
  options?: Array<{
    label: string
    value: string | boolean | number
    description?: string
    params?: any
    resumeIntent?: string
    reportPreference?: AgentReportPreference | null
    complexity?: AgentComplexityMode | null
  }>
  multiple?: boolean
  allowCustom?: boolean
  customPlaceholder?: string
}

export interface PendingAgentStep {
  kind: PendingAgentStepKind
  draftSlots: AgentAnalysisSlots
  field?: AgentHumanInputField
  resumeIntent: string
  workflowId?: string
  sourceIntent?: string
  missingInputs?: string[]
  executionProfile?: {
    reportPreference?: AgentReportPreference | null
    complexity?: AgentComplexityMode | null
  }
  params?: any
  options?: AgentConfirmationOption[]
  stage?: 'collecting_profile' | 'planning' | 'ready_to_execute' | 'suspended'
  taskKind?: 'direct_chat' | 'bazi_profile' | 'profile_management' | 'follow_up' | 'agent_analysis'
}

export interface AgentBaziFormData {
  profileName?: string
  year: string
  month: string
  day: string
  hour: string
  minute: string
  isSolar: boolean
  isFemale: boolean
  longitude: string
  latitude: string
}

export interface AgentHumanInputRequestUiEvent {
  type: 'human_input_request'
  requestId: string
  kind: AgentHumanInputKind
  title: string
  message: string
  fields: AgentHumanInputField[]
  profiles?: AgentBaziFormData[]
  submitLabel?: string
  resumeIntent?: string
}
