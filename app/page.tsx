"use client"

import type React from "react"
import { startTransition, useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react"
import dynamic from "next/dynamic"
import {
  Send,
  PanelLeftClose,
  PanelLeft,
  X,
  Bot,
  MessageCircle,
  CheckCircle2,
  Brain,
  MessageSquareText,
  AtSign,
  Hash,
  Users,
  CalendarRange,
  ImageIcon,
  Compass,
  UserPlus,
  ArrowUp,
  ArrowDown,
  Square,
  ChevronDown,
  Plus,
} from "lucide-react"
import Image from "next/image"
import { MinimalBackground } from "@/components/minimal-background"
import { ChatMessage, type MessageRunKind, type MessageStreamState } from "@/components/chat-message"
import type { AgentInlineInputRequest, AgentInputField, AgentInputValues } from "@/components/agent-input-request"
import { UserMenu } from "@/components/user-menu"
import { useAuth } from "@/contexts/auth-context"
import { createBrowserClient } from "@/lib/supabase/client"
import { SidebarProvider, SidebarInset, useSidebar } from "@/components/ui/sidebar"
import { toast } from "@/hooks/use-toast"
import { AppSidebar, type ChatMode, type FeatureType } from "@/components/app-sidebar"
import { FeatureCards } from "@/components/feature-cards"
import { FeatureLauncherButton } from "@/components/feature-launcher-button"
import { detectFeatureKindFromContent } from "@/components/chat-message"
import { sanitizeReplacementChars } from "@/lib/text-sanitize"
import {
  BUBU_COPY,
  BUBU_EMPTY_RESPONSE,
  createBubuMessageId,
  formatFeatureRequestDisplay,
  getBubuGeneratingLabel,
  getBubuStreamLabel,
  shouldSkipFollowUpSuggestions,
} from "@/lib/bubu-content"
import type {
  FeatureKind,
  FeaturePayload,
} from "@/lib/feature-types"
import { estimateTokensForText } from "@/lib/token-estimator"
import type { AgentComplexityMode, AgentReportPreference } from "@/lib/agent-complexity"
import { CLASSIC_CHAT_APPLE_COST } from "@/lib/apple-costs"

const BaziDialog = dynamic(() => import("@/components/bazi-dialog").then(mod => mod.BaziDialog), { ssr: false })
const DonationDialog = dynamic(() => import("@/components/donation-button").then(mod => mod.DonationDialog), { ssr: false })
const AuthDialog = dynamic(() => import("@/components/auth-dialog").then(mod => mod.AuthDialog), { ssr: false })
const RewardsDialog = dynamic(() => import("@/components/rewards-dialog").then(mod => mod.RewardsDialog), { ssr: false })
const ProfilesManagementDialog = dynamic(() => import("@/components/profiles-management-dialog").then(mod => mod.ProfilesManagementDialog), { ssr: false })
const ChangePasswordDialog = dynamic(() => import("@/components/change-password-dialog").then(mod => mod.ChangePasswordDialog), { ssr: false })
const HepanPage = dynamic(() => import("@/components/features/hepan-page").then(mod => mod.HepanPage), { ssr: false })
const FortunePage = dynamic(() => import("@/components/features/fortune-page").then(mod => mod.FortunePage), { ssr: false })
const AvatarPage = dynamic(() => import("@/components/features/avatar-page").then(mod => mod.AvatarPage), { ssr: false })
const LifePathPage = dynamic(() => import("@/components/features/lifepath-page").then(mod => mod.LifePathPage), { ssr: false })

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  mode?: ChatMode;
  model?: string | null;
  tokensUsed?: number | null;
  streamState?: MessageStreamState;
  agentUi?: AgentInlineInputRequest;
  agentUiStatus?: 'pending' | 'submitted';
  suggestedFollowUps?: string[];
  followUpStatus?: 'idle' | 'loading' | 'ready' | 'error';
}

// Track structured feature context for follow-up Q&A.
// Keeps participants & params so /api/chat can re-inject after a feature analysis.
type AgentFeatureContextKind = FeatureKind | 'agent_analysis'

interface FeatureContext {
  kind: AgentFeatureContextKind
  // light summary of the original request (for the follow-up system prompt)
  summary: string
  // participants info for hepan/fortune/lifepath; empty for avatar
  participants: { name: string; baziText?: string | null; pillars?: string | null }[]
  people?: { name: string; baziText?: string | null; pillars?: string | null }[]
  timeRange?: { label?: string; start: string; end: string } | null
  matter?: string | null
}

interface FollowUpSuggestionRequest {
  assistantContent: string
  runKind: MessageRunKind
  previousUserContent?: string | null
  recentMessages?: Pick<Message, 'role' | 'content'>[]
  reportType?: string | null
  featureContext?: FeatureContext | null
  participants?: { name?: string | null }[]
  pendingKind?: string | null
}

type DurableRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled'
type DurableRunKind = 'classic_chat' | 'agent_chat' | 'feature_analyze'

interface DurableRunEvent {
  seq: number
  event_type: string
  content?: string | null
  payload?: Record<string, any>
  created_at?: string
}

interface DurableRunSnapshot {
  id: string
  session_id: string
  kind: DurableRunKind
  status: DurableRunStatus
  output_text: string
  final_metadata?: Record<string, any>
  assistant_message_id?: string | null
  model?: string | null
  input_tokens?: number | null
  error?: string | null
  created_at?: string
  updated_at?: string
  completed_at?: string | null
  events?: DurableRunEvent[]
}

type ForegroundRunStatus = 'queued' | 'streaming' | 'complete' | 'stopped' | 'error'

interface ForegroundRunState {
  id: string
  operationId: string
  sessionId: string
  runKind: MessageRunKind
  mode: ChatMode
  userMessage: Message
  assistantMessage: Message
  controller: AbortController
  content: string
  status: ForegroundRunStatus
  streamState: MessageStreamState
  startedAt: number
  isAnalyzing: boolean
  stopRequested: boolean
  hadOutput: boolean
  agentUi?: AgentInlineInputRequest
  agentUiStatus?: 'pending' | 'submitted'
}

interface AgentPendingConfirmation {
  kind: 'select_person' | 'create_profile' | 'create_profiles' | 'confirm_time' | 'confirm_focus' | 'select_depth' | 'ready_to_analyze' | FeatureKind
  draftSlots?: any
  field?: AgentInputField
  params?: any
  resumeIntent: string
  options?: Array<{
    label: string
    value: string
    description?: string
    params?: any
    resumeIntent?: string
    reportPreference?: AgentReportPreference | null
    complexity?: AgentComplexityMode | null
  }>
  workflowId?: string
  taskKind?: FeatureKind | 'agent_analysis' | 'direct_chat' | 'bazi_profile' | 'profile_management' | 'follow_up'
  stage?: 'collecting_profile' | 'planning' | 'ready_to_execute' | 'suspended'
  sourceIntent?: string
  missingInputs?: string[]
  executionProfile?: {
    reportPreference?: AgentReportPreference | null
    complexity?: AgentComplexityMode | null
  }
}

interface BaziData {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  isSolar: boolean;
  isFemale: boolean;
  longitude: string;
  latitude: string;
}

interface SelectedProfileContext {
  id?: string | null
  name: string
  pillars?: string | null
  baziText?: string | null
  dayun?: Array<{
    ageStart: number
    ageEnd: number
    ganZhi: string
    yearStart: number
    yearEnd: number
  }> | null
}

interface AgentTimeRange {
  id: string
  label: string
  start: string
  end: string
}

interface BaziProfileOption {
  id: string
  profile_name: string
  bazi_result_text: string | null
  bazi_result: {
    fourPillars?: { year: string; month: string; day: string; hour: string }
    dayun?: Array<{
      ageStart: number
      ageEnd: number
      ganZhi: string
      yearStart: number
      yearEnd: number
    }>
  } | null
}

interface AgentClientStep {
  step: number
  phase: 'planner' | 'tool' | 'final' | 'fallback'
  status: 'running' | 'completed' | 'failed'
  title: string
  detail?: string
  elapsedMs: number
}

interface AgentBaziFormEvent {
  type: 'bazi_profile_form'
  message: string
  initialData?: Partial<BaziData>
}

type AgentUiEvent = AgentBaziFormEvent | AgentInlineInputRequest

type AgentStreamEvent =
  | { type: 'progress'; progress: AgentClientStep }
  | { type: 'trace'; trace: unknown }
  | { type: 'ui'; ui: AgentUiEvent }
  | { type: 'delta'; content: string }
  | {
      type: 'done'
      trace: unknown[]
      pendingConfirmation?: AgentPendingConfirmation | null
      featureContext?: (FeatureContext & { participants?: FeatureContext['participants'] }) | null
    }
  | { type: 'error'; message: string }

const COMPOSER_MIN_HEIGHT = 32
const COMPOSER_MAX_HEIGHT = 128
const STREAM_AUTO_SCROLL_INTERVAL_MS = 80
const RUN_POLL_INITIAL_DELAY_MS = 180
const RUN_POLL_MAX_DELAY_MS = 650
const RUN_POLL_BACKOFF_MS = 80

function createViewOperationId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const AGENT_FEATURE_MENTIONS: Array<{
  kind: FeatureKind
  label: string
  hint: string
  icon: React.ElementType
}> = BUBU_COPY.page.agentFeatureMentions.map(item => ({
  ...item,
  icon: item.kind === 'fortune'
    ? CalendarRange
    : item.kind === 'hepan'
    ? Users
    : item.kind === 'lifepath'
    ? Compass
    : ImageIcon,
}))

const AGENT_COMPLEXITY_OPTIONS: Array<{
  mode: AgentComplexityMode
  label: string
  icon: React.ElementType
  title: string
}> = [
  { mode: 'instant', label: 'Instant', icon: MessageSquareText, title: '快速短答，减少规划步骤' },
  { mode: 'thinking', label: 'Thinking', icon: Brain, title: '卜卜象用心调整思考深度，准备恰到好处的建议 🌟' },
]

const EMPTY_BAZI_FORM_DATA: BaziData = {
  year: '',
  month: '1',
  day: '1',
  hour: '',
  minute: '',
  isSolar: true,
  isFemale: false,
  longitude: '121.5',
  latitude: '31.2',
}

function normalizeAgentBaziFormData(data?: Partial<BaziData>): BaziData {
  return {
    ...EMPTY_BAZI_FORM_DATA,
    ...Object.fromEntries(
      Object.entries(data || {}).filter(([, value]) => value !== undefined && value !== null),
    ),
  } as BaziData
}

function legacyBaziEventToHumanInput(event: AgentBaziFormEvent): AgentInlineInputRequest {
  const data = normalizeAgentBaziFormData(event.initialData)
  const copy = BUBU_COPY.page.legacyBaziForm
  return {
    type: 'human_input_request',
    requestId: `legacy-bazi-${Date.now()}`,
    kind: 'bazi_profile',
    title: copy.title,
    message: event.message,
    submitLabel: copy.submitLabel,
    resumeIntent: copy.resumeIntent,
    fields: [
      { name: 'profileName', label: copy.fields.profileName, inputType: 'text', required: true, value: copy.defaultProfileName },
      { name: 'year', label: copy.fields.year, inputType: 'number', required: true, value: data.year },
      { name: 'month', label: copy.fields.month, inputType: 'number', required: true, value: data.month },
      { name: 'day', label: copy.fields.day, inputType: 'number', required: true, value: data.day },
      { name: 'hour', label: copy.fields.hour, inputType: 'number', required: true, value: data.hour },
      { name: 'minute', label: copy.fields.minute, inputType: 'number', value: data.minute || '0' },
      {
        name: 'isSolar',
        label: copy.fields.calendar,
        inputType: 'select',
        required: true,
        value: data.isSolar ? 'solar' : 'lunar',
        options: [
          { label: copy.calendarOptions.solar, value: 'solar' },
          { label: copy.calendarOptions.lunar, value: 'lunar' },
        ],
      },
      {
        name: 'gender',
        label: copy.fields.gender,
        inputType: 'select',
        required: true,
        value: data.isFemale ? 'female' : 'male',
        options: [
          { label: copy.genderOptions.male, value: 'male' },
          { label: copy.genderOptions.female, value: 'female' },
        ],
      },
      { name: 'longitude', label: copy.fields.longitude, inputType: 'number', required: true, value: data.longitude },
      { name: 'latitude', label: copy.fields.latitude, inputType: 'number', required: true, value: data.latitude },
    ],
  }
}

function profileOptionToContext(row: BaziProfileOption): SelectedProfileContext {
  const fp = row.bazi_result?.fourPillars
  const pillars = fp ? `${fp.year} ${fp.month} ${fp.day} ${fp.hour}` : null
  return {
    id: row.id,
    name: row.profile_name,
    pillars,
    baziText: row.bazi_result_text || null,
    dayun: row.bazi_result?.dayun || null,
  }
}

function profileContextKey(profile: SelectedProfileContext): string {
  return profile.id ? `id:${profile.id}` : `name:${profile.name.trim().toLowerCase()}`
}

function mergeProfileContexts(profiles: SelectedProfileContext[]): SelectedProfileContext[] {
  const seen = new Set<string>()
  const merged: SelectedProfileContext[] = []
  for (const profile of profiles) {
    if (!profile?.name?.trim()) continue
    const key = profileContextKey(profile)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(profile)
  }
  return merged
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDaysForInput(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addMonthsForInput(date: Date, months: number): Date {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

function addYearsEndForInput(date: Date, years: number): string {
  return `${date.getFullYear() + years - 1}-12-31`
}

function resolveInlineTimeRange(values: AgentInputValues): AgentTimeRange | null {
  const preset = agentInputValueToText(values.timeRangePreset)
  if (!preset) return null

  const today = new Date()
  const start = preset === 'custom'
    ? agentInputValueToText(values.customStart)
    : formatDateInput(today)
  const end =
    preset === 'future_30d'
      ? formatDateInput(addDaysForInput(today, 30))
      : preset === 'future_3m'
      ? formatDateInput(addMonthsForInput(today, 3))
      : preset === 'future_1y'
      ? formatDateInput(addDaysForInput(addMonthsForInput(today, 12), -1))
      : preset === 'future_3y'
      ? addYearsEndForInput(today, 3)
      : preset === 'future_5y'
      ? addYearsEndForInput(today, 5)
      : preset === 'rest_of_year'
      ? `${today.getFullYear()}-12-31`
      : agentInputValueToText(values.customEnd)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return null
  }

  const normalizedStart = start <= end ? start : end
  const normalizedEnd = start <= end ? end : start
  const label =
    preset === 'future_30d'
      ? '未来 30 天'
      : preset === 'future_3m'
      ? '未来 3 个月'
      : preset === 'future_1y'
      ? '未来 12 个月'
      : preset === 'future_3y'
      ? '未来 3 年'
      : preset === 'future_5y'
      ? '未来 5 年'
      : preset === 'rest_of_year'
      ? '今年剩余时间'
      : '自定义时间段'

  return {
    id: `inline-${normalizedStart}-${normalizedEnd}-${label}`,
    label,
    start: normalizedStart,
    end: normalizedEnd,
  }
}

function agentInputValueToText(value: AgentInputValues[string]): string {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join('、')
  return String(value ?? '').trim()
}

function agentInputValueToDisplay(field: AgentInputField, value: AgentInputValues[string]): string {
  const optionLabel = (item: string) =>
    field.options?.find(option => String(option.value) === item)?.label || item
  if (Array.isArray(value)) {
    return value.map(item => optionLabel(String(item))).filter(Boolean).join('、')
  }
  const text = agentInputValueToText(value)
  return text ? optionLabel(text) : ''
}

function agentInputSelectedOption(field: AgentInputField, value: AgentInputValues[string]) {
  const text = agentInputValueToText(value)
  if (!text || field.multiple) return null
  return field.options?.find(option => String(option.value) === text) || null
}

function selectedParamsToTimeRange(params: any, fallbackLabel?: string): AgentTimeRange | null {
  const askedTime = params?.draftSlots?.askedTime
  if (askedTime?.start && askedTime?.end) {
    return {
      id: `confirm-${askedTime.start}-${askedTime.end}-${askedTime.label || fallbackLabel || 'time-range'}`,
      label: String(askedTime.label || fallbackLabel || '已选时间范围'),
      start: String(askedTime.start),
      end: String(askedTime.end),
    }
  }
  if (params?.start && params?.end) {
    return {
      id: `confirm-${params.start}-${params.end}-${fallbackLabel || 'time-range'}`,
      label: fallbackLabel || '已选时间范围',
      start: String(params.start),
      end: String(params.end),
    }
  }
  return null
}

function reportPreferenceFromAgentValue(value: AgentInputValues[string]): AgentReportPreference | null {
  const text = agentInputValueToText(value)
  if (!text) return null
  if (text === 'concise') return { mode: 'concise' }
  if (text === 'balanced') return { mode: 'balanced' }
  if (text === 'detailed') return { mode: 'detailed' }
  return { mode: 'custom', customInstruction: text }
}

function agentComplexityFromAgentValue(value: AgentInputValues[string]): AgentComplexityMode | null {
  const text = agentInputValueToText(value)
  if (text === 'instant' || text === 'thinking') return text
  return null
}

function reportPreferenceToDisplay(preference: AgentReportPreference | null): string {
  if (!preference) return ''
  if (preference.mode === 'concise') return '简洁结论型'
  if (preference.mode === 'balanced') return '均衡报告型'
  if (preference.mode === 'detailed') return '深度展开型'
  return preference.customInstruction || '自定义'
}

function cleanAgentStepTitle(step: AgentClientStep): string {
  return step.title
    .replace(/^Step\s*\d+\s*[·:：-]\s*/i, '')
    .replace(/^判断下一步动作$/, '判断下一步')
    .replace(/^准备调用：/, '准备')
}

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof Error && error.name === 'AbortError') return true
  return error instanceof Error && /aborted|abort/i.test(error.message)
}

function isMissingModeColumn(error: any) {
  return String(error?.message || '').toLowerCase().includes('mode')
}

function isMissingMessageMetadataColumn(error: any) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('model') || message.includes('tokens_used')
}

function isDurableRunsSchemaUnavailable(error: any): boolean {
  const message = String(error?.message || '')
  return error?.code === 'PGRST205' ||
    message.includes("Could not find the table 'public.llm_runs'")
}

function getLlmResponseMeta(response: Response) {
  const model = response.headers.get('x-llm-model')
  const inputTokens = Number(response.headers.get('x-llm-input-tokens') || '0')
  return {
    model: model || null,
    inputTokens: Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0,
  }
}

function getFinalFollowUpState(content: string, enabled: boolean): Pick<Message, 'suggestedFollowUps' | 'followUpStatus'> {
  if (!enabled || shouldSkipFollowUpSuggestions(content)) {
    return { suggestedFollowUps: [], followUpStatus: 'ready' }
  }
  return { suggestedFollowUps: [], followUpStatus: 'loading' }
}

function createMessageStreamState(
  runKind: MessageRunKind,
  status: MessageStreamState['status'],
  label?: string,
  phase: MessageStreamState['phase'] = status === 'queued' ? 'understanding' : 'generating',
): MessageStreamState {
  return {
    status,
    runKind,
    phase,
    label: label || getBubuStreamLabel(runKind, status),
  }
}

function getGeneratingLabel(runKind: MessageRunKind) {
  return getBubuGeneratingLabel(runKind)
}

export default function Home() {
  return (
    <SidebarProvider defaultOpen={false}>
      <HomeContent />
    </SidebarProvider>
  )
}

function HomeContent() {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesStartRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const streamingMessageTopRef = useRef<HTMLDivElement>(null)
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null)
  const streamContentRef = useRef('')
  const rafIdRef = useRef<number | null>(null)
  const streamingMessageIdRef = useRef<string | null>(null)
  const activeRunIdRef = useRef<string | null>(null)
  const activeRunKindRef = useRef<MessageRunKind>('classic')
  const resumingRunRef = useRef<string | null>(null)
  const durableRunsAvailableRef = useRef<boolean | null>(null)
  const selectedSessionIdRef = useRef<string | null>(null)
  const sessionViewSeqRef = useRef(0)
  const loadSessionSeqRef = useRef(0)
  const activeOperationIdRef = useRef<string | null>(null)
  const activeForegroundRunIdRef = useRef<string | null>(null)
  const foregroundRunsRef = useRef<Map<string, ForegroundRunState>>(new Map())
  const foregroundRunBySessionRef = useRef<Map<string, string>>(new Map())
  const abortControllerRef = useRef<AbortController | null>(null)
  const stopRequestedRef = useRef(false)
  const streamHadOutputRef = useRef(false)
  const initialPromptAppliedRef = useRef(false)
  const autoScrollRef = useRef(true)
  const autoScrollFrameRef = useRef<number | null>(null)
  const autoScrollTimeoutRef = useRef<number | null>(null)
  const lastAutoScrollAtRef = useRef(0)
  const lastScrollTopRef = useRef(0)
  const { user } = useAuth()
  const supabase = useMemo(() => createBrowserClient(), [])
  const { toggleSidebar, open: sidebarOpen } = useSidebar()

  const [showBaziDialog, setShowBaziDialog] = useState(false)
  const [agentBaziInitialData, setAgentBaziInitialData] = useState<BaziData | undefined>()
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const [showProfilesDialog, setShowProfilesDialog] = useState(false)
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [currentSessionMode, setCurrentSessionMode] = useState<ChatMode>('agent')
  const [activeChatMode, setActiveChatMode] = useState<ChatMode>('agent')
  const [sessionListRefreshKey, setSessionListRefreshKey] = useState(0)
  const [agentComplexity, setAgentComplexity] = useState<AgentComplexityMode>('instant')
  const [messages, setMessages] = useState<Message[]>([])
  const [activeStreamingMessageId, setActiveStreamingMessageId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSessionLoading, setIsSessionLoading] = useState(false)
  const [isStreamingStarted, setIsStreamingStarted] = useState(false)
  const [baziData, setBaziData] = useState<BaziData | null>(null)
  const [baziAnalysisResult, setBaziAnalysisResult] = useState<string | null>(null)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [selectedProfile, setSelectedProfile] = useState<SelectedProfileContext | null>(null)
  const [agentParticipants, setAgentParticipants] = useState<SelectedProfileContext[]>([])
  const [agentTimeRanges, setAgentTimeRanges] = useState<AgentTimeRange[]>([])
  const [agentReportPreference, setAgentReportPreference] = useState<AgentReportPreference | null>(null)
  const [agentTimeDraft, setAgentTimeDraft] = useState<{ label: string; start: string; end: string }>(() => {
    const today = new Date()
    return {
      label: '',
      start: formatDateInput(today),
      end: formatDateInput(addDaysForInput(today, 30)),
    }
  })
  const [isUltraMode, setIsUltraMode] = useState(false)
  const [activeFeature, setActiveFeature] = useState<FeatureType>('chat')
  const [showDonationDialog, setShowDonationDialog] = useState(false)
  const [showRewardsDialog, setShowRewardsDialog] = useState(false)
  const [featureContext, setFeatureContext] = useState<FeatureContext | null>(null)
  const [sessionSummary, setSessionSummary] = useState<string | null>(null)
  const [agentPendingConfirmation, setAgentPendingConfirmation] = useState<AgentPendingConfirmation | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [agentProfiles, setAgentProfiles] = useState<BaziProfileOption[]>([])
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionTrigger, setMentionTrigger] = useState<'@' | '#'>('@')
  const [composerModeOpen, setComposerModeOpen] = useState(false)

  // Apple quota state
  const [appleQuota, setAppleQuota] = useState<{
    remaining: number
    dailyLimit: number
    isPaid: boolean
    membershipExpiresAt?: string | null
    bonusAppleLimit?: number
    bonusExpiresAt?: string | null
  } | null>(null)
  const [showQuotaExhausted, setShowQuotaExhausted] = useState(false)
  
  // Scroll to top button visibility
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [showJumpLatest, setShowJumpLatest] = useState(false)

  const messagesRef = useRef<Message[]>([])
  const featureContextRef = useRef<FeatureContext | null>(null)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    featureContextRef.current = featureContext
  }, [featureContext])

  useEffect(() => {
    if (initialPromptAppliedRef.current) return
    initialPromptAppliedRef.current = true
    const url = new URL(window.location.href)
    const prompt = url.searchParams.get('prompt')?.trim()
    if (prompt) setInput(prompt)
    if (url.searchParams.has('prompt')) {
      url.searchParams.delete('prompt')
      const nextUrl = `${url.pathname}${url.search}${url.hash}`
      window.history.replaceState(window.history.state, '', nextUrl || '/')
    }
  }, [])

  // Fetch apple quota when user changes
  const fetchQuota = useCallback(async () => {
    if (!user) {
      setAppleQuota(null)
      return
    }
    try {
      const res = await fetch('/api/quota')
      if (res.ok) {
        const data = await res.json()
        setAppleQuota({
          remaining: data.remaining,
          dailyLimit: data.dailyLimit,
          isPaid: data.isPaid,
          membershipExpiresAt: data.membershipExpiresAt ?? null,
          bonusAppleLimit: data.bonusAppleLimit ?? 0,
          bonusExpiresAt: data.bonusExpiresAt ?? null,
        })
      }
    } catch (error) {
      console.error('获取配额失败:', error)
    }
  }, [user])

  const loadAgentProfiles = useCallback(async () => {
    if (!user) {
      setAgentProfiles([])
      return [] as BaziProfileOption[]
    }
    try {
      // @ts-ignore - Database types will be generated after schema deployment
      const { data, error } = await supabase
        .from('bazi_profiles')
        .select('id, profile_name, bazi_result_text, bazi_result')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = (data as BaziProfileOption[]) || []
      setAgentProfiles(rows)
      return rows
    } catch (error) {
      console.error('[agent] 加载人物失败:', error)
      setAgentProfiles([])
      return [] as BaziProfileOption[]
    }
  }, [supabase, user])

  useEffect(() => {
    fetchQuota()
  }, [fetchQuota])

  useEffect(() => {
    if (activeChatMode === 'agent' && user) {
      loadAgentProfiles()
    }
  }, [activeChatMode, loadAgentProfiles, user])

  const setStreamingMessageId = useCallback((id: string | null) => {
    streamingMessageIdRef.current = id
    setActiveStreamingMessageId(id)
  }, [])

  const cancelPendingStreamFrame = useCallback(() => {
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
  }, [])

  const getForegroundRunForSession = useCallback((sessionId: string | null) => {
    if (!sessionId) return null
    const runId = foregroundRunBySessionRef.current.get(sessionId)
    if (!runId) return null
    const run = foregroundRunsRef.current.get(runId)
    if (!run || run.status === 'complete') return null
    return run
  }, [])

  const isForegroundRunVisible = useCallback((run: ForegroundRunState) => (
    selectedSessionIdRef.current === run.sessionId &&
    activeForegroundRunIdRef.current === run.id
  ), [])

  const mergeForegroundRunMessages = useCallback((baseMessages: Message[], sessionId: string | null) => {
    const run = getForegroundRunForSession(sessionId)
    if (!run) return baseMessages

    const nextMessages = [...baseMessages]
    const hasLocalUser = nextMessages.some(message =>
      message.id === run.userMessage.id ||
      (
        message.role === 'user' &&
        message.content === run.userMessage.content &&
        Math.abs(message.createdAt.getTime() - run.userMessage.createdAt.getTime()) < 120_000
      ),
    )
    if (!hasLocalUser) {
      nextMessages.push(run.userMessage)
    }

    const assistantContent = run.content || run.assistantMessage.content
    const assistant: Message = {
      ...run.assistantMessage,
      content: assistantContent,
      streamState: run.streamState,
      agentUi: run.agentUi,
      agentUiStatus: run.agentUiStatus,
    }
    const existingAssistantIndex = nextMessages.findIndex(message => message.id === assistant.id)
    if (existingAssistantIndex >= 0) {
      nextMessages[existingAssistantIndex] = assistant
    } else {
      const finalContent = sanitizeReplacementChars(assistantContent).trim()
      const hasSameSavedAssistant = finalContent && nextMessages.some(message =>
        message.role === 'assistant' &&
        sanitizeReplacementChars(message.content).trim() === finalContent,
      )
      if (!hasSameSavedAssistant) {
        nextMessages.push(assistant)
      }
    }

    return nextMessages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }, [getForegroundRunForSession])

  const attachForegroundRunToView = useCallback((sessionId: string | null) => {
    const run = getForegroundRunForSession(sessionId)
    activeForegroundRunIdRef.current = run?.id || null
    activeOperationIdRef.current = run?.operationId || null
    activeRunIdRef.current = null
    resumingRunRef.current = null

    if (!run) {
      abortControllerRef.current = null
      stopRequestedRef.current = false
      streamHadOutputRef.current = false
      streamContentRef.current = ''
      setStreamingMessageId(null)
      setIsLoading(false)
      setIsAnalyzing(false)
      setIsStreamingStarted(false)
      return null
    }

    activeRunKindRef.current = run.runKind
    abortControllerRef.current = run.controller
    stopRequestedRef.current = run.stopRequested
    streamHadOutputRef.current = run.hadOutput
    streamContentRef.current = run.content
    setStreamingMessageId(run.assistantMessage.id)
    const runActive = run.status === 'queued' || run.status === 'streaming'
    setIsLoading(runActive)
    setIsAnalyzing(runActive && run.isAnalyzing)
    setIsStreamingStarted(Boolean(run.content.trim()) || run.status === 'streaming')
    return run
  }, [getForegroundRunForSession, setStreamingMessageId])

  const registerForegroundRun = useCallback((run: ForegroundRunState) => {
    foregroundRunsRef.current.set(run.id, run)
    foregroundRunBySessionRef.current.set(run.sessionId, run.id)
    if (selectedSessionIdRef.current === run.sessionId) {
      attachForegroundRunToView(run.sessionId)
    }
  }, [attachForegroundRunToView])

  const clearForegroundRun = useCallback((run: ForegroundRunState) => {
    foregroundRunsRef.current.delete(run.id)
    if (foregroundRunBySessionRef.current.get(run.sessionId) === run.id) {
      foregroundRunBySessionRef.current.delete(run.sessionId)
    }
    if (activeForegroundRunIdRef.current === run.id) {
      activeForegroundRunIdRef.current = null
      activeOperationIdRef.current = null
      abortControllerRef.current = null
      stopRequestedRef.current = false
      streamHadOutputRef.current = false
      streamContentRef.current = ''
      setStreamingMessageId(null)
      setIsLoading(false)
      setIsAnalyzing(false)
      setIsStreamingStarted(false)
    }
  }, [setStreamingMessageId])

  const applyForegroundRunPatch = useCallback((
    run: ForegroundRunState,
    patch: {
      content?: string
      status?: ForegroundRunStatus
      streamState?: MessageStreamState
      agentUi?: AgentInlineInputRequest
      agentUiStatus?: 'pending' | 'submitted'
      suggestedFollowUps?: string[]
      followUpStatus?: Message['followUpStatus']
    },
  ) => {
    if (patch.content !== undefined) {
      run.content = patch.content
      run.hadOutput = run.hadOutput || Boolean(patch.content)
    }
    if (patch.status) run.status = patch.status
    if (patch.streamState) run.streamState = patch.streamState
    if (patch.agentUi !== undefined) run.agentUi = patch.agentUi
    if (patch.agentUiStatus !== undefined) run.agentUiStatus = patch.agentUiStatus

    if (!isForegroundRunVisible(run)) return
    if (patch.content !== undefined) {
      streamContentRef.current = patch.content
      streamHadOutputRef.current = streamHadOutputRef.current || Boolean(patch.content)
      if (patch.content.trim() || patch.status === 'streaming') {
        setIsStreamingStarted(true)
      }
    }
    if (patch.status === 'complete' || patch.status === 'stopped' || patch.status === 'error') {
      setIsLoading(false)
      setIsAnalyzing(false)
      setIsStreamingStarted(false)
    }

    setMessages(prev => prev.map(message =>
      message.id === run.assistantMessage.id
        ? {
            ...message,
            content: patch.content !== undefined ? patch.content : message.content,
            streamState: patch.streamState || message.streamState,
            agentUi: patch.agentUi !== undefined ? patch.agentUi : message.agentUi,
            agentUiStatus: patch.agentUiStatus !== undefined ? patch.agentUiStatus : message.agentUiStatus,
            ...(patch.suggestedFollowUps !== undefined ? { suggestedFollowUps: patch.suggestedFollowUps } : {}),
            ...(patch.followUpStatus !== undefined ? { followUpStatus: patch.followUpStatus } : {}),
          }
        : message,
    ))
  }, [isForegroundRunVisible])

  const scheduleForegroundContentUpdate = useCallback((run: ForegroundRunState) => {
    if (!isForegroundRunVisible(run) || rafIdRef.current !== null) return
    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null
      if (!isForegroundRunVisible(run)) return
      const latestContent = run.content
      streamContentRef.current = latestContent
      setMessages(prev => prev.map(message =>
        message.id === run.assistantMessage.id
          ? {
              ...message,
              content: latestContent,
              streamState: run.streamState,
              agentUi: run.agentUi,
              agentUiStatus: run.agentUiStatus,
            }
          : message,
      ))
    })
  }, [isForegroundRunVisible])

  const beginSessionView = useCallback((sessionId: string | null) => {
    const nextSeq = sessionViewSeqRef.current + 1
    sessionViewSeqRef.current = nextSeq
    selectedSessionIdRef.current = sessionId
    cancelPendingStreamFrame()
    attachForegroundRunToView(sessionId)
    setIsSessionLoading(false)
    setShowJumpLatest(false)
    return nextSeq
  }, [attachForegroundRunToView, cancelPendingStreamFrame])

  const refreshSessionList = useCallback(() => {
    setSessionListRefreshKey(key => key + 1)
  }, [])

  const updateStreamingMessage = useCallback((
    updater: (message: Message) => Message,
  ) => {
    const id = streamingMessageIdRef.current
    if (!id) return
    setMessages(prev => prev.map(message => message.id === id ? updater(message) : message))
  }, [])

  // Handle scroll to show/hide "scroll to top" button
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleScroll = () => {
      // Show button when scrolled down more than 300px
      setShowScrollTop(container.scrollTop > 300)
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight
      const isNearBottom = distanceFromBottom < 96
      const scrollingUp = container.scrollTop < lastScrollTopRef.current - 4
      lastScrollTopRef.current = container.scrollTop

      if (isNearBottom) {
        autoScrollRef.current = true
        setShowJumpLatest(false)
        return
      }

      if (isLoading || scrollingUp) {
        autoScrollRef.current = false
        if (isLoading) setShowJumpLatest(true)
      }
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [isLoading])

  const cancelScheduledAutoScroll = useCallback(() => {
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current)
      autoScrollFrameRef.current = null
    }
    if (autoScrollTimeoutRef.current !== null) {
      window.clearTimeout(autoScrollTimeoutRef.current)
      autoScrollTimeoutRef.current = null
    }
  }, [])

  const scrollToTop = useCallback(() => {
    cancelScheduledAutoScroll()
    messagesStartRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [cancelScheduledAutoScroll])

  const upsertAgentStep = useCallback((step: AgentClientStep) => {
    updateStreamingMessage(message => ({
      ...message,
      streamState: createMessageStreamState(
        'agent',
        step.status === 'failed' ? 'error' : 'streaming',
        cleanAgentStepTitle(step),
        step.phase === 'tool' ? 'retrieving' : step.phase === 'final' ? 'generating' : 'understanding',
      ),
    }))
  }, [updateStreamingMessage])

  const scrollToBottom = useCallback((instant = false) => {
    const container = messagesContainerRef.current
    if (container && instant) {
      container.scrollTop = container.scrollHeight
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: instant ? "instant" : "smooth" })
    }
    lastAutoScrollAtRef.current = Date.now()
  }, [])

  const scheduleScrollToBottom = useCallback((instant = false) => {
    if (!autoScrollRef.current) return

    if (!instant) {
      cancelScheduledAutoScroll()
      scrollToBottom(false)
      return
    }

    if (autoScrollFrameRef.current !== null || autoScrollTimeoutRef.current !== null) return

    const elapsed = Date.now() - lastAutoScrollAtRef.current
    const delay = Math.max(0, STREAM_AUTO_SCROLL_INTERVAL_MS - elapsed)
    const run = () => {
      autoScrollTimeoutRef.current = null
      if (!autoScrollRef.current) return
      autoScrollFrameRef.current = window.requestAnimationFrame(() => {
        autoScrollFrameRef.current = null
        if (autoScrollRef.current) scrollToBottom(true)
      })
    }

    if (delay > 0) {
      autoScrollTimeoutRef.current = window.setTimeout(run, delay)
    } else {
      run()
    }
  }, [cancelScheduledAutoScroll, scrollToBottom])

  const scrollToStreamingMessageTop = useCallback(() => {
    streamingMessageTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const scrollToLatest = useCallback(() => {
    cancelScheduledAutoScroll()
    autoScrollRef.current = true
    setShowJumpLatest(false)
    scrollToBottom(false)
  }, [cancelScheduledAutoScroll, scrollToBottom])

  useEffect(() => {
    return () => cancelScheduledAutoScroll()
  }, [cancelScheduledAutoScroll])

  useEffect(() => {
    const activeMessage = activeStreamingMessageId
      ? messages.find(message => message.id === activeStreamingMessageId)
      : null

    if (activeStreamingMessageId && activeMessage && !isStreamingStarted) {
      requestAnimationFrame(() => scrollToStreamingMessageTop())
      return
    }

    if (activeMessage && activeMessage.content.length > 900 && autoScrollRef.current) {
      autoScrollRef.current = false
      setShowJumpLatest(true)
      return
    }

    if (autoScrollRef.current) {
      scheduleScrollToBottom(isStreamingStarted)
    }
  }, [
    activeStreamingMessageId,
    isStreamingStarted,
    messages,
    scheduleScrollToBottom,
    scrollToStreamingMessageTop,
  ])

  useEffect(() => {
    console.log('baziAnalysisResult state changed:', baziAnalysisResult ? baziAnalysisResult.substring(0, 50) + '...' : 'null');
  }, [baziAnalysisResult])

  // 确保或创建会话
  const ensureSession = useCallback(async (mode: ChatMode = activeChatMode) => {
    if (!user) return null
    if (currentSessionId && currentSessionId !== 'new') {
      selectedSessionIdRef.current = currentSessionId
      if (currentSessionMode !== mode) {
        setCurrentSessionMode(mode)
        try {
          const { error } = await supabase
            .from('chat_sessions')
            .update({ mode } as any)
            .eq('id', currentSessionId)
          if (error && !isMissingModeColumn(error)) throw error
        } catch (error) {
          console.error('更新会话模式失败:', error)
        }
      }
      return currentSessionId
    }
    try {
      const createViewSeq = sessionViewSeqRef.current
      const createTargetSessionId = selectedSessionIdRef.current
      let { data, error } = await supabase
        .from('chat_sessions')
        .insert({ user_id: user.id, title: '新对话', mode } as any)
        .select()
        .single()
      if (error && isMissingModeColumn(error)) {
        const retry = await supabase
          .from('chat_sessions')
          .insert({ user_id: user.id, title: '新对话' } as any)
          .select()
          .single()
        data = retry.data
        error = retry.error
      }
      if (error) throw error
      if (!data) throw new Error('创建会话失败：未返回会话')
      if (
        sessionViewSeqRef.current !== createViewSeq ||
        selectedSessionIdRef.current !== createTargetSessionId
      ) {
        return data.id
      }
      selectedSessionIdRef.current = data.id
      setCurrentSessionId(data.id)
      setCurrentSessionMode(mode)
      refreshSessionList()
      return data.id
    } catch (error) {
      console.error('创建会话失败:', error)
      return null
    }
  }, [activeChatMode, currentSessionId, currentSessionMode, refreshSessionList, supabase, user])

  // 保存消息到数据库
  const saveMessage = useCallback(async (
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    mode: ChatMode = activeChatMode,
    meta: { model?: string | null; tokensUsed?: number | null } = {},
  ) => {
    if (!user) return
    const tokensUsed =
      meta.tokensUsed === undefined
        ? estimateTokensForText(content)
        : meta.tokensUsed
    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          session_id: sessionId,
          role,
          content,
          mode,
          model: meta.model ?? null,
          tokens_used: tokensUsed,
        } as any)
      if (error) {
        if (!isMissingModeColumn(error) && !isMissingMessageMetadataColumn(error)) {
          throw error
        }
        await supabase
          .from('chat_messages')
          .insert({
            session_id: sessionId,
            role,
            content,
            ...(isMissingModeColumn(error) ? {} : { mode }),
          } as any)
      }
      await supabase.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId)
      refreshSessionList()
    } catch (error) {
      console.error('保存消息失败:', error)
    }
  }, [activeChatMode, refreshSessionList, supabase, user])

  // 加载会话消息
  const loadSession = useCallback(async (sessionId: string, modeHint?: ChatMode) => {
    const targetSessionId = sessionId === 'new' ? null : sessionId
    const requestSeq = loadSessionSeqRef.current + 1
    loadSessionSeqRef.current = requestSeq
    const viewSeq = sessionId !== 'new' && selectedSessionIdRef.current === targetSessionId
      ? sessionViewSeqRef.current
      : beginSessionView(targetSessionId)

    const isLatestSessionLoad = () =>
      loadSessionSeqRef.current === requestSeq &&
      sessionViewSeqRef.current === viewSeq &&
      selectedSessionIdRef.current === targetSessionId

    if (sessionId === 'new') {
      setIsSessionLoading(false)
      setMessages([])
      selectedSessionIdRef.current = null
      setCurrentSessionId(null)
      const nextMode = modeHint || activeChatMode
      setCurrentSessionMode(nextMode)
      setActiveChatMode(nextMode)
      setFeatureContext(null)
      setSessionSummary(null)
      setAgentPendingConfirmation(null)
      setAgentParticipants([])
      setAgentTimeRanges([])
      setAgentReportPreference(null)
      setMentionOpen(false)
      return
    }
    setCurrentSessionId(sessionId)
    if (modeHint) {
      setCurrentSessionMode(modeHint)
      setActiveChatMode(modeHint)
    }
    setMessages([])
    setIsSessionLoading(true)
    try {
      const { data: sessionData, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('id', sessionId)
        .single()
      if (sessionError) throw sessionError
      const sessionMode: ChatMode =
        ((sessionData as any)?.mode === 'agent' ? 'agent' : modeHint || 'classic')

      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
      if (error) throw error
      if (!isLatestSessionLoad()) return
      const loadedMessages: Message[] = (data || [])
        .filter(msg => msg.role === 'user' || msg.role === 'assistant')
        .map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        createdAt: new Date(msg.created_at),
        mode: ((msg as any).mode === 'agent' ? 'agent' : sessionMode),
        model: (msg as any).model ?? null,
        tokensUsed: (msg as any).tokens_used ?? null,
      }))
      const { data: completedRuns, error: runsError } = await supabase
        .from('llm_runs')
        .select('id, kind, status, output_text, assistant_message_id, model, input_tokens, completed_at, updated_at, created_at')
        .eq('session_id', sessionId)
        .eq('status', 'completed')
        .order('created_at', { ascending: true })
      if (runsError && !isDurableRunsSchemaUnavailable(runsError)) throw runsError
      if (!isLatestSessionLoad()) return
      const loadedMessageIds = new Set(loadedMessages.map(message => message.id))
      const loadedAssistantContents = new Set(
        loadedMessages
          .filter(message => message.role === 'assistant')
          .map(message => sanitizeReplacementChars(message.content).trim())
          .filter(Boolean),
      )
      const recoveredRunMessages = ((completedRuns || []) as DurableRunSnapshot[])
        .reduce<Message[]>((recovered, run) => {
          const content = sanitizeReplacementChars(run.output_text || '').trim()
          if (!content) return recovered
          const id = run.assistant_message_id || `run-${run.id}`
          if (loadedMessageIds.has(id) || loadedAssistantContents.has(content)) return recovered
          const mode: ChatMode = run.kind === 'classic_chat' ? 'classic' : 'agent'
          recovered.push({
            id,
            role: 'assistant' as const,
            content,
            createdAt: new Date(run.completed_at || run.updated_at || run.created_at || Date.now()),
            mode,
            model: run.model ?? null,
            tokensUsed: typeof run.input_tokens === 'number'
              ? run.input_tokens + estimateTokensForText(content)
              : estimateTokensForText(content),
            streamState: createMessageStreamState(
              run.kind === 'classic_chat' ? 'classic' : run.kind === 'feature_analyze' ? 'feature' : 'agent',
              'complete',
            ),
          })
          return recovered
        }, [])
      const sessionMessages = mergeForegroundRunMessages(
        [...loadedMessages, ...recoveredRunMessages]
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
        sessionId,
      )
      startTransition(() => {
        setMessages(sessionMessages)
        setCurrentSessionMode(sessionMode)
        setActiveChatMode(sessionMode)
        // Reset feature context when switching sessions; will be re-derived if needed
        setFeatureContext(null)
        setSessionSummary((sessionData as any)?.summary || null)
        setAgentPendingConfirmation(null)
        setAgentParticipants([])
        setAgentTimeRanges([])
        setAgentReportPreference(null)
        setMentionOpen(false)
        setIsSessionLoading(false)
      })
      selectedSessionIdRef.current = sessionId
      setCurrentSessionId(sessionId)
      attachForegroundRunToView(sessionId)
    } catch (error) {
      if (isLatestSessionLoad()) {
        setIsSessionLoading(false)
        console.error('加载会话失败:', error)
      }
    }
  }, [activeChatMode, attachForegroundRunToView, beginSessionView, mergeForegroundRunMessages, supabase])

  const requestFollowUpSuggestions = useCallback(async (
    messageId: string,
    request: FollowUpSuggestionRequest,
  ) => {
    const finalContent = sanitizeReplacementChars(request.assistantContent).trim()
    if (!user || !finalContent) return
    if (request.pendingKind && request.pendingKind !== 'ready_to_analyze') return
    if (shouldSkipFollowUpSuggestions(finalContent)) {
      setMessages(prev => prev.map(message =>
        message.id === messageId
          ? { ...message, suggestedFollowUps: [], followUpStatus: 'ready' }
          : message
      ))
      return
    }

    setMessages(prev => prev.map(message =>
      message.id === messageId
        ? { ...message, suggestedFollowUps: [], followUpStatus: 'loading' }
        : message
    ))

    try {
      const response = await fetch('/api/follow-up-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantContent: finalContent,
          previousUserContent: request.previousUserContent || null,
          recentMessages: (request.recentMessages || [])
            .slice(-8)
            .map(message => ({
              role: message.role,
              content: sanitizeReplacementChars(message.content).slice(0, 1200),
            })),
          mode: request.runKind,
          reportType: request.reportType || null,
          featureContext: request.featureContext || null,
          participants: request.participants || [],
          pendingKind: request.pendingKind || null,
        }),
      })
      if (!response.ok) throw new Error(`follow-up HTTP ${response.status}`)
      const data = await response.json().catch(() => ({}))
      const suggestions = Array.isArray(data?.suggestions)
        ? data.suggestions.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 3)
        : []
      setMessages(prev => prev.map(message =>
        message.id === messageId
          ? { ...message, suggestedFollowUps: suggestions, followUpStatus: 'ready' }
          : message
      ))
    } catch (error) {
      console.warn('追问推荐生成失败，使用本地兜底:', error)
      setMessages(prev => prev.map(message =>
        message.id === messageId
          ? { ...message, suggestedFollowUps: [], followUpStatus: 'error' }
          : message
      ))
    }
  }, [user])

  const resizeComposerTextarea = useCallback(() => {
    const textarea = composerTextareaRef.current
    if (!textarea) return
    textarea.style.height = `${COMPOSER_MIN_HEIGHT}px`
    const nextHeight = Math.min(
      Math.max(textarea.scrollHeight, COMPOSER_MIN_HEIGHT),
      COMPOSER_MAX_HEIGHT,
    )
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden'
  }, [])

  useLayoutEffect(() => {
    resizeComposerTextarea()
  }, [
    activeChatMode,
    agentParticipants.length,
    agentReportPreference,
    agentTimeRanges.length,
    input,
    resizeComposerTextarea,
    selectedProfileId,
    selectedProfile?.name,
  ])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const nextInput = e.target.value
    setInput(nextInput)

    if (activeChatMode === 'agent' && user) {
      const mentionMatch = nextInput.match(/(?:^|\s)([@#])([^\s@#]*)$/)
      if (mentionMatch) {
        setMentionTrigger(mentionMatch[1] === '#' ? '#' : '@')
        setMentionQuery(mentionMatch[2] || '')
        setMentionOpen(true)
        if (agentProfiles.length === 0) loadAgentProfiles()
        return
      }
    }

    setMentionOpen(false)
  }, [activeChatMode, agentProfiles.length, loadAgentProfiles, user])

  const filteredAgentProfiles = useMemo(() => {
    const query = mentionQuery.trim().toLowerCase()
    if (!query) return agentProfiles.slice(0, 6)
    return agentProfiles
      .filter(profile => profile.profile_name.toLowerCase().includes(query))
      .slice(0, 6)
  }, [agentProfiles, mentionQuery])

  const filteredAgentFeatures = useMemo(() => {
    const query = mentionQuery.trim().toLowerCase()
    if (!query) return AGENT_FEATURE_MENTIONS
    return AGENT_FEATURE_MENTIONS.filter(item =>
      item.label.toLowerCase().includes(query) ||
      item.hint.toLowerCase().includes(query),
    )
  }, [mentionQuery])

  const agentQuickTimeRanges = useMemo(() => {
    const today = new Date()
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0)
    return [
      {
        label: '本月',
        start: formatDateInput(today),
        end: formatDateInput(monthEnd),
      },
      {
        label: '下个月',
        start: formatDateInput(nextMonthStart),
        end: formatDateInput(nextMonthEnd),
      },
      {
        label: '未来 30 天',
        start: formatDateInput(today),
        end: formatDateInput(addDaysForInput(today, 30)),
      },
      {
        label: '未来 12 个月',
        start: formatDateInput(today),
        end: formatDateInput(addDaysForInput(addMonthsForInput(today, 12), -1)),
      },
    ]
  }, [])

  const replaceActiveMention = useCallback((label: string, trigger: '@' | '#' = mentionTrigger) => {
    setInput(prev => {
      const mention = `${trigger}${label} `
      if (/(^|\s)[@#][^\s@#]*$/.test(prev)) {
        return prev.replace(/(^|\s)[@#][^\s@#]*$/, match => {
          const prefix = match.startsWith(' ') ? ' ' : ''
          return `${prefix}${mention}`
        })
      }
      return `${prev}${prev.endsWith(' ') || prev.length === 0 ? '' : ' '}${mention}`
    })
  }, [mentionTrigger])

  const addAgentParticipant = useCallback((profile: SelectedProfileContext) => {
    const next = mergeProfileContexts([...agentParticipants, profile])
    setAgentParticipants(next)
    setSelectedProfile(profile)
    setSelectedProfileId(profile.id || null)
    setBaziAnalysisResult(profile.baziText || null)
  }, [agentParticipants])

  const removeAgentParticipant = useCallback((profile: SelectedProfileContext) => {
    const removeKey = profileContextKey(profile)
    const next = agentParticipants.filter(item => profileContextKey(item) !== removeKey)
    const nextPrimary = next[0] || null
    setAgentParticipants(next)
    setSelectedProfile(nextPrimary)
    setSelectedProfileId(nextPrimary?.id || null)
    setBaziAnalysisResult(nextPrimary?.baziText || null)
  }, [agentParticipants])

  const addAgentTimeRange = useCallback((range: Omit<AgentTimeRange, 'id'>) => {
    if (!range.start || !range.end) return
    const start = range.start <= range.end ? range.start : range.end
    const end = range.start <= range.end ? range.end : range.start
    const normalized: AgentTimeRange = {
      ...range,
      start,
      end,
      label: range.label.trim() || '自定义时间段',
      id: `${start}-${end}-${range.label || Date.now()}`,
    }
    setAgentTimeRanges(prev => {
      const exists = prev.some(item =>
        item.start === normalized.start &&
        item.end === normalized.end &&
        item.label === normalized.label,
      )
      return exists ? prev : [...prev, normalized]
    })
  }, [])

  const removeAgentTimeRange = useCallback((id: string) => {
    setAgentTimeRanges(prev => prev.filter(range => range.id !== id))
  }, [])

  const addAgentCustomTimeRange = useCallback(() => {
    addAgentTimeRange(agentTimeDraft)
    setAgentTimeDraft(prev => ({ ...prev, label: '' }))
  }, [addAgentTimeRange, agentTimeDraft])

  const selectAgentProfileMention = useCallback((profile: BaziProfileOption) => {
    const ctx = profileOptionToContext(profile)
    const alreadySelected = agentParticipants.some(item => profileContextKey(item) === profileContextKey(ctx))
    if (!alreadySelected) {
      addAgentParticipant(ctx)
    }
    replaceActiveMention(profile.profile_name, '@')
    setMentionOpen(false)
  }, [addAgentParticipant, agentParticipants, replaceActiveMention])

  const selectAgentFeatureMention = useCallback((_kind: FeatureKind, label: string) => {
    replaceActiveMention(label, '#')
    setMentionOpen(false)
  }, [replaceActiveMention])

  const selectAgentTimeMention = useCallback((range: Omit<AgentTimeRange, 'id'>) => {
    addAgentTimeRange(range)
    replaceActiveMention(range.label, '#')
    setMentionOpen(false)
  }, [addAgentTimeRange, replaceActiveMention])

  const resolveMentionedProfiles = useCallback(async (text: string) => {
    if (activeChatMode !== 'agent' || !user) return [] as SelectedProfileContext[]
    let rows = agentProfiles
    if (rows.length === 0) {
      rows = await loadAgentProfiles()
    }
    return mergeProfileContexts(
      rows
        .filter(row => text.includes(`@${row.profile_name}`) || text.includes(row.profile_name))
        .map(profileOptionToContext),
    )
  }, [activeChatMode, agentProfiles, loadAgentProfiles, user])

  const handleChatModeChange = useCallback((mode: ChatMode) => {
    if (mode === activeChatMode) return
    setActiveChatMode(mode)
    setCurrentSessionMode(mode)
    setMentionOpen(false)
    setComposerModeOpen(false)
    if (currentSessionId && currentSessionId !== 'new' && user) {
      supabase
        .from('chat_sessions')
        .update({ mode } as any)
        .eq('id', currentSessionId)
        .then(({ error }) => {
          if (error && !isMissingModeColumn(error)) {
            console.error('更新会话模式失败:', error)
          }
        })
    }
  }, [activeChatMode, currentSessionId, supabase, user])

  const handleStopGeneration = useCallback(() => {
    if (!isLoading) return
    stopRequestedRef.current = true
    const activeForegroundRunId = activeForegroundRunIdRef.current
    const activeForegroundRun = activeForegroundRunId
      ? foregroundRunsRef.current.get(activeForegroundRunId)
      : null
    if (activeForegroundRun) {
      activeForegroundRun.stopRequested = true
      applyForegroundRunPatch(activeForegroundRun, {
        streamState: activeForegroundRun.streamState
          ? { ...activeForegroundRun.streamState, label: BUBU_COPY.page.stoppingLabel }
          : createMessageStreamState(activeForegroundRun.runKind, 'streaming', BUBU_COPY.page.stoppingLabel),
      })
      activeForegroundRun.controller.abort()
      return
    }
    updateStreamingMessage(message => ({
      ...message,
      streamState: message.streamState
        ? { ...message.streamState, label: BUBU_COPY.page.stoppingLabel }
        : createMessageStreamState('classic', 'streaming', BUBU_COPY.page.stoppingLabel),
    }))
    const activeRunId = activeRunIdRef.current
    if (activeRunId) {
      void fetch(`/api/llm-runs/${activeRunId}/cancel`, { method: 'POST' }).catch(error => {
        console.error('取消后台任务失败:', error)
      })
      return
    }
    abortControllerRef.current?.abort()
  }, [applyForegroundRunPatch, isLoading, updateStreamingMessage])

  const pollDurableRun = useCallback(async (args: {
    runId: string
    assistantMessageId: string
    runKind: MessageRunKind
    mode: ChatMode
    sessionId?: string | null
    viewSeq?: number
    operationId?: string
    previousUserContent: string
    recentMessages: Message[]
    reportType?: string | null
    featureContext?: FeatureContext | null
    participants?: { name?: string | null; baziText?: string | null; pillars?: string | null }[]
    featureSummary?: string | null
    onDone?: (snapshot: DurableRunSnapshot) => Promise<void> | void
  }): Promise<DurableRunSnapshot | null> => {
    activeRunIdRef.current = args.runId
    activeRunKindRef.current = args.runKind
    let afterSeq = 0
    let lastOutput = ''
    let lastAppliedContent = ''
    let lastAppliedStatus: MessageStreamState['status'] | null = null
    let lastAppliedMessageId: string | null = null
    let finalSnapshot: DurableRunSnapshot | null = null
    let pollDelayMs = RUN_POLL_INITIAL_DELAY_MS

    const isRunAttachedToView = () => {
      if (args.operationId && activeOperationIdRef.current !== args.operationId) return false
      if (typeof args.viewSeq === 'number' && sessionViewSeqRef.current !== args.viewSeq) return false
      if (args.sessionId !== undefined && selectedSessionIdRef.current !== args.sessionId) return false
      return true
    }

    const applySnapshot = (snapshot: DurableRunSnapshot): boolean => {
      if (!isRunAttachedToView()) return false
      const snapshotContent = sanitizeReplacementChars(snapshot.output_text || '')
      if (snapshotContent && snapshotContent !== lastOutput) {
        lastOutput = snapshotContent
        streamContentRef.current = snapshotContent
        streamHadOutputRef.current = true
        setIsStreamingStarted(true)
      }
      const content = snapshotContent || lastOutput
      const status = snapshot.status
      const streamStatus =
        status === 'completed'
          ? 'complete'
          : status === 'failed'
          ? 'error'
          : status === 'canceled'
          ? 'stopped'
          : content
          ? 'streaming'
          : 'queued'
      const nextMessageId = status === 'completed' && snapshot.assistant_message_id
        ? snapshot.assistant_message_id
        : args.assistantMessageId
      const nextContent =
        content ||
        (status === 'failed'
          ? (args.runKind === 'feature' ? BUBU_EMPTY_RESPONSE.featureError : BUBU_EMPTY_RESPONSE.genericError)
          : status === 'canceled'
          ? (args.runKind === 'feature' ? BUBU_EMPTY_RESPONSE.stoppedFeature : BUBU_EMPTY_RESPONSE.stopped)
          : '')
      if (
        nextMessageId === lastAppliedMessageId &&
        nextContent === lastAppliedContent &&
        streamStatus === lastAppliedStatus
      ) {
        return false
      }
      lastAppliedMessageId = nextMessageId
      lastAppliedContent = nextContent
      lastAppliedStatus = streamStatus
      setMessages(prev => prev.map(message =>
        message.id === args.assistantMessageId
          ? {
              ...message,
              id: nextMessageId,
              content: nextContent || message.content,
              streamState: createMessageStreamState(
                args.runKind,
                streamStatus,
                status === 'queued' || status === 'running'
                  ? '已进入后台推理，回来也能继续'
                  : undefined,
              ),
              ...(status === 'failed' || status === 'canceled'
                ? { suggestedFollowUps: [], followUpStatus: 'ready' as const }
                : {}),
            }
          : message,
      ))
      return true
    }

    const applyEvent = (event: DurableRunEvent): boolean => {
      if (!isRunAttachedToView()) return false
      afterSeq = Math.max(afterSeq, Number(event.seq || 0))
      if (event.event_type === 'delta' && event.content) {
        const delta = sanitizeReplacementChars(event.content)
        if (!delta) return false
        lastOutput += delta
        streamContentRef.current = lastOutput
        streamHadOutputRef.current = true
        setIsStreamingStarted(true)
        setMessages(prev => prev.map(message =>
          message.id === args.assistantMessageId
            ? {
                ...message,
                content: lastOutput,
                streamState: createMessageStreamState(args.runKind, 'streaming', getGeneratingLabel(args.runKind)),
              }
            : message,
        ))
        return true
      }
      if (event.event_type === 'progress' && event.payload?.progress) {
        upsertAgentStep(event.payload.progress as AgentClientStep)
        return true
      }
      if (event.event_type === 'ui' && event.payload?.ui) {
        const ui = event.payload.ui as Extract<AgentStreamEvent, { type: 'ui' }>['ui']
        const agentUi = ui.type === 'human_input_request'
          ? ui
          : legacyBaziEventToHumanInput(ui)
        setMessages(prev => prev.map(message =>
          message.id === args.assistantMessageId
            ? { ...message, agentUi, agentUiStatus: 'pending' }
            : message,
        ))
        return true
      }
      return false
    }

    while (true) {
      if (!isRunAttachedToView()) return finalSnapshot
      const res = await fetch(`/api/llm-runs/${args.runId}?after_seq=${afterSeq}&events_only=1`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        throw new Error(`Run polling failed: ${res.status}`)
      }
      const snapshot = await res.json() as DurableRunSnapshot
      finalSnapshot = snapshot
      if (!isRunAttachedToView()) return finalSnapshot
      let eventChanged = false
      ;(snapshot.events || []).forEach(event => {
        if (applyEvent(event)) eventChanged = true
      })
      const snapshotChanged = applySnapshot(snapshot)
      const changed = eventChanged || snapshotChanged

      if (['completed', 'failed', 'canceled'].includes(snapshot.status)) {
        if (snapshot.status === 'completed') {
          if (!isRunAttachedToView()) return finalSnapshot
          const finalContent = sanitizeReplacementChars(snapshot.output_text || '').trim()
          const shouldRequestFollowUps = Boolean(user) && !shouldSkipFollowUpSuggestions(finalContent)
          const finalMessageId = snapshot.assistant_message_id || args.assistantMessageId
          setMessages(prev => prev.map(message =>
            message.id === args.assistantMessageId || message.id === finalMessageId
              ? {
                  ...message,
                  id: finalMessageId,
                  content: finalContent,
                  streamState: createMessageStreamState(args.runKind, 'complete'),
                  ...getFinalFollowUpState(finalContent, shouldRequestFollowUps),
                }
              : message,
          ))
          if (shouldRequestFollowUps) {
            void requestFollowUpSuggestions(finalMessageId, {
              assistantContent: finalContent,
              runKind: args.runKind,
              previousUserContent: args.previousUserContent,
              recentMessages: args.recentMessages,
              reportType: args.reportType || null,
              featureContext: args.featureContext || null,
              participants: args.participants || [],
              pendingKind: (snapshot.final_metadata?.pendingConfirmation as AgentPendingConfirmation | null)?.kind || null,
            })
          }
          if (isRunAttachedToView()) {
            await args.onDone?.(snapshot)
          }
        }
        break
      }

      await new Promise(resolve => window.setTimeout(resolve, pollDelayMs))
      pollDelayMs = changed
        ? RUN_POLL_INITIAL_DELAY_MS
        : Math.min(RUN_POLL_MAX_DELAY_MS, pollDelayMs + RUN_POLL_BACKOFF_MS)
    }

    return finalSnapshot
  }, [requestFollowUpSuggestions, upsertAgentStep, user])

  const createDurableRun = useCallback(async (input: {
    kind: DurableRunKind
    sessionId: string
    payload: Record<string, any>
    clientMessageId: string
  }): Promise<{ run_id: string; status: DurableRunStatus } | null> => {
    if (durableRunsAvailableRef.current === false) return null
    const response = await fetch('/api/llm-runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: input.kind,
        session_id: input.sessionId,
        payload: input.payload,
        client_message_id: input.clientMessageId,
      }),
    })
    const data = await response.json().catch(() => ({})) as {
      available?: boolean
      run_id?: string
      status?: DurableRunStatus
      message?: string
    }
    if (!response.ok) {
      throw new Error(data.message || `创建后台任务失败：${response.status}`)
    }
    if (data.available === false) {
      durableRunsAvailableRef.current = false
      return null
    }
    if (!data.run_id || !data.status) throw new Error('创建后台任务失败')
    durableRunsAvailableRef.current = true
    return { run_id: data.run_id, status: data.status }
  }, [])

  useEffect(() => {
    if (
      !user ||
      !currentSessionId ||
      currentSessionId === 'new' ||
      isLoading ||
      activeOperationIdRef.current ||
      durableRunsAvailableRef.current === false
    ) return
    let cancelled = false
    const sessionId = currentSessionId
    const viewSeq = sessionViewSeqRef.current

    const isCurrentSessionView = () =>
      !cancelled &&
      sessionViewSeqRef.current === viewSeq &&
      selectedSessionIdRef.current === sessionId

    let operationId: string | null = null
    let resumedRunId: string | null = null

    const resume = async () => {
      try {
        const response = await fetch(`/api/llm-runs?session_id=${sessionId}`, { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json() as { runs?: DurableRunSnapshot[]; available?: boolean }
        if (data.available === false) {
          durableRunsAvailableRef.current = false
          return
        }
        durableRunsAvailableRef.current = true
        if (!isCurrentSessionView()) return

        const loadedMessages = messagesRef.current
        const runs = data.runs || []
        const activeRun = runs.find(candidate => candidate.status === 'queued' || candidate.status === 'running')
        const completedRun = runs.find(candidate => {
          if (candidate.status !== 'completed') return false
          const content = sanitizeReplacementChars(candidate.output_text || '').trim()
          if (!content) return false
          const finalMessageId = candidate.assistant_message_id || null
          return !loadedMessages.some(message =>
            (finalMessageId && message.id === finalMessageId) ||
            (message.role === 'assistant' && message.content === content)
          )
        })
        const run = activeRun || completedRun
        if (!run || !isCurrentSessionView() || resumingRunRef.current === run.id) return

        resumedRunId = run.id
        resumingRunRef.current = run.id

        const runKind: MessageRunKind =
          run.kind === 'classic_chat'
            ? 'classic'
            : run.kind === 'feature_analyze'
            ? 'feature'
            : 'agent'
        const lastUserMessage = [...loadedMessages].reverse().find(message => message.role === 'user')

        if (run.status === 'completed') {
          const finalContent = sanitizeReplacementChars(run.output_text || '').trim()
          if (!finalContent || !isCurrentSessionView()) return
          const finalMessageId = run.assistant_message_id || `run-${run.id}`
          const shouldRequestFollowUps = Boolean(user) && !shouldSkipFollowUpSuggestions(finalContent)
          const completedMessage: Message = {
            id: finalMessageId,
            role: 'assistant',
            content: finalContent,
            createdAt: run.updated_at ? new Date(run.updated_at) : new Date(),
            mode: run.kind === 'classic_chat' ? 'classic' : 'agent',
            streamState: createMessageStreamState(runKind, 'complete'),
            ...getFinalFollowUpState(finalContent, shouldRequestFollowUps),
          }
          setMessages(prev => {
            if (prev.some(message =>
              message.id === finalMessageId ||
              (message.role === 'assistant' && message.content === finalContent)
            )) return prev
            return [...prev, completedMessage]
          })

          const metadata = run.final_metadata || {}
          const pending = (metadata.pendingConfirmation || null) as AgentPendingConfirmation | null
          const nextFeatureContext = metadata.featureContext as FeatureContext | undefined
          if (pending) setAgentPendingConfirmation(pending)
          if (nextFeatureContext?.summary) {
            setFeatureContext(nextFeatureContext)
            setSessionSummary(nextFeatureContext.summary)
          }
          fetchQuota()
          if (shouldRequestFollowUps) {
            void requestFollowUpSuggestions(finalMessageId, {
              assistantContent: finalContent,
              runKind,
              previousUserContent: lastUserMessage?.content || '',
              recentMessages: [...loadedMessages, completedMessage],
              reportType: nextFeatureContext?.kind || metadata.featureContext?.kind || null,
              featureContext: nextFeatureContext || featureContextRef.current,
              participants: nextFeatureContext?.participants || metadata.featureContext?.participants || [],
              pendingKind: pending?.kind || null,
            })
          }
          return
        }

        operationId = createViewOperationId('resume')
        activeOperationIdRef.current = operationId
        if (!isCurrentSessionView()) return

        const assistantMessageId = run.assistant_message_id || `run-${run.id}`
        const assistantMessage: Message = {
          id: assistantMessageId,
          role: 'assistant',
          content: run.output_text || '',
          createdAt: new Date(),
          mode: run.kind === 'classic_chat' ? 'classic' : 'agent',
          streamState: createMessageStreamState(runKind, run.output_text ? 'streaming' : 'queued', '已恢复后台推理'),
        }
        setMessages(prev => {
          if (prev.some(message => message.id === assistantMessage.id || message.id === run.assistant_message_id)) return prev
          return [...prev, assistantMessage]
        })
        setStreamingMessageId(assistantMessage.id)
        streamContentRef.current = run.output_text || ''
        setIsLoading(true)
        if (runKind === 'feature') setIsAnalyzing(true)

        await pollDurableRun({
          runId: run.id,
          assistantMessageId: assistantMessage.id,
          runKind,
          mode: run.kind === 'classic_chat' ? 'classic' : 'agent',
          sessionId,
          viewSeq,
          operationId,
          previousUserContent: lastUserMessage?.content || '',
          recentMessages: [...loadedMessages, assistantMessage],
          reportType: run.final_metadata?.featureContext?.kind || null,
          featureContext: (run.final_metadata?.featureContext as FeatureContext | undefined) || featureContextRef.current,
          participants: run.final_metadata?.featureContext?.participants || [],
          onDone: async snapshot => {
            const metadata = snapshot.final_metadata || {}
            const pending = (metadata.pendingConfirmation || null) as AgentPendingConfirmation | null
            const nextFeatureContext = metadata.featureContext as FeatureContext | undefined
            if (pending) setAgentPendingConfirmation(pending)
            if (nextFeatureContext?.summary) {
              setFeatureContext(nextFeatureContext)
              setSessionSummary(nextFeatureContext.summary)
            }
            fetchQuota()
          },
        })
      } catch (error) {
        console.error('恢复后台任务失败:', error)
      } finally {
        if (operationId && activeOperationIdRef.current === operationId) {
          setIsLoading(false)
          setIsStreamingStarted(false)
          setIsAnalyzing(false)
          setStreamingMessageId(null)
          activeRunIdRef.current = null
          activeOperationIdRef.current = null
          streamContentRef.current = ''
        }
        if (resumedRunId && resumingRunRef.current === resumedRunId) {
          resumingRunRef.current = null
        }
      }
    }

    void resume()
    return () => {
      cancelled = true
    }
  }, [currentSessionId, fetchQuota, isLoading, pollDurableRun, requestFollowUpSuggestions, setStreamingMessageId, user])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const submitEvent = e as React.FormEvent & {
      __contentOverride?: string
      __selectedProfileOverride?: SelectedProfileContext | null
      __selectedParticipantsOverride?: SelectedProfileContext[]
      __agentReportPreferenceOverride?: AgentReportPreference | null
      __agentComplexityOverride?: AgentComplexityMode | null
      __pendingConfirmationOverride?: AgentPendingConfirmation | null
      __preserveCurrentProfile?: boolean
      __timeRangesOverride?: AgentTimeRange[]
    }
    const submittedText = (submitEvent.__contentOverride ?? input).trim()
    const selectedProfileOverride = submitEvent.__selectedProfileOverride
    const selectedParticipantsOverride = submitEvent.__selectedParticipantsOverride
    const reportPreferenceOverride = submitEvent.__agentReportPreferenceOverride
    const complexityOverride = submitEvent.__agentComplexityOverride
    const pendingConfirmationOverride = submitEvent.__pendingConfirmationOverride
    const preserveCurrentProfile = submitEvent.__preserveCurrentProfile === true
    const requestTimeRanges = submitEvent.__timeRangesOverride ?? agentTimeRanges
    const requestPendingConfirmation = pendingConfirmationOverride !== undefined
      ? pendingConfirmationOverride
      : agentPendingConfirmation
    if (!submittedText || isLoading) return;
    if (!user) {
      setShowAuthDialog(true)
      return
    }
    setComposerModeOpen(false)
    const requestConsumesApple =
      activeChatMode === 'classic'
        ? isUltraMode
        : false

    // 投喂模式前端预检查：苹果不够直接拦截，不发请求不添加消息
    if (requestConsumesApple && CLASSIC_CHAT_APPLE_COST > 0 && appleQuota && appleQuota.remaining < CLASSIC_CHAT_APPLE_COST) {
      setShowQuotaExhausted(true)
      setTimeout(() => setShowQuotaExhausted(false), 8000)
      return
    }

    const operationId = createViewOperationId('chat')
    const viewSeq = sessionViewSeqRef.current
    activeOperationIdRef.current = operationId
    let sessionId: string | null = currentSessionId && currentSessionId !== 'new' ? currentSessionId : null
    const isOperationActive = (expectedSessionId?: string | null) => {
      if (activeOperationIdRef.current !== operationId) return false
      if (sessionViewSeqRef.current !== viewSeq) return false
      if (expectedSessionId !== undefined && selectedSessionIdRef.current !== expectedSessionId) return false
      return true
    }

    let requestSelectedProfile = selectedProfileOverride !== undefined
      ? selectedProfileOverride
      : selectedProfile
    let requestParticipants = selectedParticipantsOverride !== undefined
      ? selectedParticipantsOverride
      : agentParticipants
    if (activeChatMode === 'agent') {
      const mentionedProfiles = await resolveMentionedProfiles(submittedText)
      if (!isOperationActive()) return
      requestParticipants = mergeProfileContexts([
        ...requestParticipants,
        ...mentionedProfiles,
        ...(requestSelectedProfile ? [requestSelectedProfile] : []),
      ])
      requestSelectedProfile = requestSelectedProfile || requestParticipants[0] || null
      if (!preserveCurrentProfile && requestParticipants.length > 0) {
        setAgentParticipants(requestParticipants)
      }
      if (!preserveCurrentProfile && requestSelectedProfile && requestSelectedProfile.id !== selectedProfile?.id) {
        setSelectedProfile(requestSelectedProfile)
        setSelectedProfileId(requestSelectedProfile.id || null)
        setBaziAnalysisResult(requestSelectedProfile.baziText || null)
      }
    }

    const userMessage: Message = {
      id: createBubuMessageId('user'),
      role: 'user',
      content: submittedText,
      createdAt: new Date(),
      mode: activeChatMode,
    };
    const runKind: MessageRunKind = activeChatMode === 'agent' ? 'agent' : 'classic'
    const assistantMessage: Message = {
      id: createBubuMessageId('assistant'),
      role: 'assistant',
      content: '',
      createdAt: new Date(),
      mode: activeChatMode,
      streamState: createMessageStreamState(runKind, 'queued'),
    }

    setStreamingMessageId(assistantMessage.id)
    streamContentRef.current = ''
    setMessages(prev => [...prev, userMessage, assistantMessage]);
    if (!submitEvent.__contentOverride) setInput('');
    setIsLoading(true);
    setIsStreamingStarted(false);
    autoScrollRef.current = true
    setShowJumpLatest(false)
    stopRequestedRef.current = false
    streamHadOutputRef.current = false

    const isNewSession = !currentSessionId
    if (user) {
      sessionId = await ensureSession(activeChatMode)
      if (sessionId) {
        await saveMessage(sessionId, 'user', userMessage.content, activeChatMode)
        // 新建会话时，用第一条消息作为标题
        if (isNewSession) {
          const titleText = userMessage.content.slice(0, 30) + (userMessage.content.length > 30 ? '...' : '')
          await supabase.from('chat_sessions').update({ title: titleText }).eq('id', sessionId)
          refreshSessionList()
        }
      }
    }

    const requestController = new AbortController()
    abortControllerRef.current = requestController
    let foregroundRun: ForegroundRunState | null = null

    try {
      if (!sessionId) throw new Error('创建会话失败')
      foregroundRun = {
        id: operationId,
        operationId,
        sessionId,
        runKind,
        mode: activeChatMode,
        userMessage,
        assistantMessage,
        controller: requestController,
        content: '',
        status: 'queued',
        streamState: createMessageStreamState(runKind, 'queued'),
        startedAt: Date.now(),
        isAnalyzing: false,
        stopRequested: false,
        hadOutput: false,
      }
      registerForegroundRun(foregroundRun)

      const requestData: any = {
        messages: [...messages, userMessage].map(m => ({
          role: m.role,
          content: sanitizeReplacementChars(m.content),
        }))
      };
      if (baziAnalysisResult) requestData.baziAnalysisResult = baziAnalysisResult;
      requestData.useUltraMode = requestConsumesApple;
      if (activeChatMode === 'agent') {
        requestData.complexity = complexityOverride || agentComplexity
        if (sessionSummary) {
          requestData.sessionSummary = sessionSummary
        }
        if (requestPendingConfirmation) {
          requestData.pendingConfirmation = requestPendingConfirmation
        }
        const requestReportPreference =
          reportPreferenceOverride !== undefined
            ? reportPreferenceOverride
            : agentReportPreference
        if (requestReportPreference) {
          requestData.reportPreference = requestReportPreference
        }
      }
      if (activeChatMode === 'agent' && requestSelectedProfile) {
        requestData.selectedProfile = requestSelectedProfile
      }
      if (activeChatMode === 'agent') {
        if (requestParticipants.length > 0) {
          requestData.participants = requestParticipants
        }
        if (requestTimeRanges.length > 0) {
          requestData.timeRanges = requestTimeRanges
        }
      }
      // Inject feature follow-up context so the AI keeps participants & summary
      if (featureContext) {
        requestData.participants = mergeProfileContexts([
          ...(requestData.participants || []),
          ...featureContext.participants,
        ])
        requestData.featureContext = {
          kind: featureContext.kind,
          summary: featureContext.summary,
          people: featureContext.people,
          timeRange: featureContext.timeRange,
          matter: featureContext.matter,
        }
      }

      const response = await fetch(activeChatMode === 'agent' ? '/api/agent-chat' : '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
        signal: requestController.signal,
      });

      if (!response.ok) {
        // Handle quota exceeded
        if (response.status === 403) {
          const errorData = await response.json()
          if (errorData.error === 'quota_exceeded') {
            setShowQuotaExhausted(true)
            setAppleQuota(prev =>
              prev
                ? {
                    ...prev,
                    remaining: Math.max(0, Number(errorData.remaining ?? 0)),
                    dailyLimit: Number(errorData.dailyLimit ?? prev.dailyLimit),
                  }
                : null,
            )
            // Auto-dismiss after 8 seconds
            setTimeout(() => setShowQuotaExhausted(false), 8000)
            // Remove the user message we just added since the request failed
            if (!foregroundRun || isForegroundRunVisible(foregroundRun)) {
              setMessages(prev => prev.filter(m => m.id !== userMessage.id && m.id !== assistantMessage.id))
              setIsLoading(false)
              setIsStreamingStarted(false)
              setStreamingMessageId(null)
            }
            return
          }
        }
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const llmMeta = getLlmResponseMeta(response)

      // 投喂模式：立即本地扣减苹果，再异步刷新真实值
      if (requestConsumesApple) {
        setAppleQuota(prev => prev ? { ...prev, remaining: Math.max(0, prev.remaining - CLASSIC_CHAT_APPLE_COST), } : null)
        fetchQuota()
      }

      if (activeChatMode === 'agent') {
        const reader = response.body?.getReader()
        if (!reader) throw new Error('Agent response body is empty')

        const decoder = new TextDecoder()
        let buffer = ''
        let fullContent = ''
        let streamingStarted = false
        const agentDoneState: {
          pendingConfirmation: AgentPendingConfirmation | null
          featureContext: FeatureContext | null
        } = {
          pendingConfirmation: null,
          featureContext: null,
        }

        const scheduleAssistantUpdate = () => {
          if (foregroundRun) scheduleForegroundContentUpdate(foregroundRun)
        }

        const handleAgentEvent = (event: AgentStreamEvent) => {
          if (event.type === 'progress') {
            const streamState = createMessageStreamState(
              'agent',
              event.progress.status === 'failed' ? 'error' : 'streaming',
              cleanAgentStepTitle(event.progress),
              event.progress.phase === 'tool'
                ? 'retrieving'
                : event.progress.phase === 'final'
                ? 'generating'
                : 'understanding',
            )
            if (foregroundRun) {
              applyForegroundRunPatch(foregroundRun, {
                status: event.progress.status === 'failed' ? 'error' : 'streaming',
                streamState,
              })
            } else {
              upsertAgentStep(event.progress)
            }
            return
          }
          if (event.type === 'ui') {
            const agentUi = event.ui.type === 'human_input_request'
              ? event.ui
              : legacyBaziEventToHumanInput(event.ui)
            if (foregroundRun) {
              applyForegroundRunPatch(foregroundRun, {
                agentUi,
                agentUiStatus: 'pending',
              })
            }
            return
          }
          if (event.type === 'delta') {
            const content = sanitizeReplacementChars(event.content)
            if (!content) return
            fullContent += content
            if (foregroundRun) {
              foregroundRun.content = fullContent
              foregroundRun.hadOutput = true
              foregroundRun.status = 'streaming'
              foregroundRun.streamState = createMessageStreamState('agent', 'streaming', getGeneratingLabel('agent'))
            }
            if (foregroundRun && isForegroundRunVisible(foregroundRun)) {
              streamContentRef.current = fullContent
              streamHadOutputRef.current = true
            }
            if (!streamingStarted && content.trim()) {
              streamingStarted = true
              if (!foregroundRun || isForegroundRunVisible(foregroundRun)) {
                setIsStreamingStarted(true)
              }
            }
            scheduleAssistantUpdate()
            return
          }
          if (event.type === 'done') {
            agentDoneState.pendingConfirmation = event.pendingConfirmation || null
            agentDoneState.featureContext = event.featureContext
              ? {
                  kind: event.featureContext.kind,
                  summary: event.featureContext.summary,
                  participants: event.featureContext.participants || [],
                  people: event.featureContext.people,
                  timeRange: event.featureContext.timeRange,
                  matter: event.featureContext.matter,
                }
              : null
            return
          }
          if (event.type === 'error') {
            throw new Error(event.message || 'Agent stream error')
          }
        }

        const consumeLine = (line: string) => {
          const trimmed = line.trim()
          if (!trimmed) return
          const event = JSON.parse(trimmed) as AgentStreamEvent
          handleAgentEvent(event)
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += sanitizeReplacementChars(decoder.decode(value, { stream: true }))
          let newlineIndex = buffer.indexOf('\n')
          while (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex)
            buffer = buffer.slice(newlineIndex + 1)
            consumeLine(line)
            newlineIndex = buffer.indexOf('\n')
          }
        }

        buffer += sanitizeReplacementChars(decoder.decode())
        if (buffer.trim()) consumeLine(buffer)

        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current)
          rafIdRef.current = null
        }
        if (foregroundRun && isForegroundRunVisible(foregroundRun)) {
          setStreamingMessageId(null)
        }

        const currentAssistant = assistantMessage
        const finalContent = fullContent.trim() ? fullContent : BUBU_EMPTY_RESPONSE.agent
        const shouldRequestAgentFollowUps = Boolean(user) &&
          !agentDoneState.pendingConfirmation &&
          !shouldSkipFollowUpSuggestions(finalContent)
        if (foregroundRun) {
          applyForegroundRunPatch(foregroundRun, {
            content: finalContent,
            status: 'complete',
            streamState: createMessageStreamState('agent', 'complete'),
            ...getFinalFollowUpState(finalContent, shouldRequestAgentFollowUps),
          })
        }
        if (user && sessionId && finalContent) {
          await saveMessage(sessionId, 'assistant', finalContent, activeChatMode, {
            model: llmMeta.model,
            tokensUsed: llmMeta.inputTokens + estimateTokensForText(finalContent),
          })
        }
        const runIsVisible = foregroundRun ? isForegroundRunVisible(foregroundRun) : isOperationActive(sessionId)
        if (runIsVisible) {
          setAgentPendingConfirmation(agentDoneState.pendingConfirmation)
        }
        if (agentDoneState.featureContext) {
          if (runIsVisible) {
            setFeatureContext(agentDoneState.featureContext)
            setSessionSummary(agentDoneState.featureContext.summary)
          }
          if (user && sessionId) {
              await supabase
                .from('chat_sessions')
                .update({ summary: agentDoneState.featureContext.summary } as any)
                .eq('id', sessionId)
              refreshSessionList()
          }
        } else if (runIsVisible && !agentDoneState.pendingConfirmation) {
          setAgentPendingConfirmation(null)
        }
        if (shouldRequestAgentFollowUps && runIsVisible) {
          const nextFeatureContext = agentDoneState.featureContext || featureContext
          void requestFollowUpSuggestions(currentAssistant.id, {
            assistantContent: finalContent,
            runKind: 'agent',
            previousUserContent: submittedText,
            recentMessages: [...messages, userMessage, { ...currentAssistant, content: finalContent }],
            reportType: nextFeatureContext?.kind || null,
            featureContext: nextFeatureContext,
            participants: requestParticipants,
          })
        }

        fetchQuota()
        return
      }

      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let fullContent = ''
        let streamingStarted = false

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = sanitizeReplacementChars(decoder.decode(value, { stream: true }));
          if (!chunk) continue
          fullContent += chunk
          if (foregroundRun) {
            foregroundRun.content = fullContent
            foregroundRun.hadOutput = true
            foregroundRun.status = 'streaming'
            foregroundRun.streamState = createMessageStreamState('classic', 'streaming', getGeneratingLabel('classic'))
          }
          if (foregroundRun && isForegroundRunVisible(foregroundRun)) {
            streamContentRef.current = fullContent
            streamHadOutputRef.current = true
          }
          if (!streamingStarted && chunk.trim()) {
            streamingStarted = true
            if (!foregroundRun || isForegroundRunVisible(foregroundRun)) {
              setIsStreamingStarted(true);
            }
          }
          if (foregroundRun) scheduleForegroundContentUpdate(foregroundRun)
        }

        const tail = sanitizeReplacementChars(decoder.decode())
        if (tail) {
          fullContent += tail
          if (foregroundRun) {
            foregroundRun.content = fullContent
            foregroundRun.hadOutput = true
            foregroundRun.streamState = createMessageStreamState('classic', 'streaming', getGeneratingLabel('classic'))
          }
          if (foregroundRun && isForegroundRunVisible(foregroundRun)) {
            streamContentRef.current = fullContent
          }
        }

        if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null }
        if (foregroundRun && isForegroundRunVisible(foregroundRun)) {
          setStreamingMessageId(null);
        }
        const finalContent = fullContent.trim()
          ? fullContent
          : BUBU_EMPTY_RESPONSE.classic
        const shouldRequestClassicFollowUps = Boolean(user) && !shouldSkipFollowUpSuggestions(finalContent)
        if (foregroundRun) {
          applyForegroundRunPatch(foregroundRun, {
            content: finalContent,
            status: 'complete',
            streamState: createMessageStreamState('classic', 'complete'),
            ...getFinalFollowUpState(finalContent, shouldRequestClassicFollowUps),
          })
        }
        if (user && sessionId && finalContent) {
          await saveMessage(sessionId, 'assistant', finalContent, activeChatMode, {
            model: llmMeta.model,
            tokensUsed: llmMeta.inputTokens + estimateTokensForText(finalContent),
          })
        }
        if (shouldRequestClassicFollowUps && (!foregroundRun || isForegroundRunVisible(foregroundRun))) {
          void requestFollowUpSuggestions(assistantMessage.id, {
            assistantContent: finalContent,
            runKind: 'classic',
            previousUserContent: submittedText,
            recentMessages: [...messages, userMessage, { ...assistantMessage, content: finalContent }],
            reportType: featureContext?.kind || null,
            featureContext,
            participants: requestData.participants || requestParticipants,
          })
        }
      }
    } catch (error) {
      if (foregroundRun?.stopRequested || stopRequestedRef.current || isAbortLikeError(error)) {
        const partialContent = sanitizeReplacementChars(foregroundRun?.content ?? streamContentRef.current)
        const stoppedContent = partialContent || BUBU_EMPTY_RESPONSE.stopped
        if (foregroundRun) {
          applyForegroundRunPatch(foregroundRun, {
            content: stoppedContent,
            status: 'stopped',
            streamState: createMessageStreamState(runKind, 'stopped'),
            suggestedFollowUps: [],
            followUpStatus: 'ready',
          })
        } else if (!streamHadOutputRef.current) {
          const stoppedMessage: Message = {
            id: createBubuMessageId('assistant'),
            role: 'assistant',
            content: stoppedContent,
            createdAt: new Date(),
            mode: activeChatMode,
            streamState: createMessageStreamState(runKind, 'stopped'),
            suggestedFollowUps: [],
            followUpStatus: 'ready',
          }
          setMessages(prev => [...prev, stoppedMessage])
        }
        if (user && sessionId && stoppedContent) {
          await saveMessage(sessionId, 'assistant', stoppedContent, activeChatMode)
        }
        return
      }
      console.error('Chat error:', error);
      if (foregroundRun) {
        applyForegroundRunPatch(foregroundRun, {
          content: BUBU_EMPTY_RESPONSE.genericError,
          status: 'error',
          streamState: createMessageStreamState(runKind, 'error'),
          suggestedFollowUps: [],
          followUpStatus: 'ready',
        })
      } else {
        const errorMessage: Message = {
          id: createBubuMessageId('assistant'),
          role: 'assistant',
          content: BUBU_EMPTY_RESPONSE.genericError,
          createdAt: new Date(),
          mode: activeChatMode,
          streamState: createMessageStreamState(runKind, 'error'),
          suggestedFollowUps: [],
          followUpStatus: 'ready',
        };
        setMessages(prev => [...prev, errorMessage]);
      }
      if (user && sessionId) {
        await saveMessage(sessionId, 'assistant', BUBU_EMPTY_RESPONSE.genericError, activeChatMode)
      }
    } finally {
      if (foregroundRun) {
        if (activeForegroundRunIdRef.current === foregroundRun.id && rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current)
          rafIdRef.current = null
        }
        clearForegroundRun(foregroundRun)
      } else if (activeOperationIdRef.current === operationId) {
        setIsLoading(false);
        setIsStreamingStarted(false);
        setStreamingMessageId(null);
        streamContentRef.current = '';
        activeRunIdRef.current = null
        activeOperationIdRef.current = null
        abortControllerRef.current = null
        stopRequestedRef.current = false
        streamHadOutputRef.current = false
        if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null }
      }
    }
  }, [input, isLoading, messages, baziAnalysisResult, isUltraMode, user, ensureSession, saveMessage, supabase, fetchQuota, appleQuota, featureContext, sessionSummary, agentPendingConfirmation, activeChatMode, agentComplexity, selectedProfile, currentSessionId, upsertAgentStep, resolveMentionedProfiles, agentParticipants, agentTimeRanges, agentReportPreference, setStreamingMessageId, requestFollowUpSuggestions, refreshSessionList, registerForegroundRun, scheduleForegroundContentUpdate, applyForegroundRunPatch, isForegroundRunVisible, clearForegroundRun])

  const handleComposerKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.altKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.nativeEvent.isComposing &&
      window.innerWidth >= 768
    ) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }, [handleSubmit])

  // ==================== Feature analysis ====================
  const submitFeatureAnalyze = useCallback(async (payload: FeaturePayload) => {
    if (!user) {
      setShowAuthDialog(true)
      return
    }
    if (isLoading || isAnalyzing) return

    const operationId = createViewOperationId('feature')
    const viewSeq = sessionViewSeqRef.current
    activeOperationIdRef.current = operationId
    let sessionId: string | null = currentSessionId && currentSessionId !== 'new' ? currentSessionId : null
    const isOperationActive = (expectedSessionId?: string | null) => {
      if (activeOperationIdRef.current !== operationId) return false
      if (sessionViewSeqRef.current !== viewSeq) return false
      if (expectedSessionId !== undefined && selectedSessionIdRef.current !== expectedSessionId) return false
      return true
    }

    const {
      userDisplay,
      summary,
      participants,
    } = formatFeatureRequestDisplay(payload.kind, payload.params)

    // Switch back to chat view
    setActiveFeature('chat')

    const userMessage: Message = {
      id: createBubuMessageId('user'),
      role: 'user',
      content: userDisplay,
      createdAt: new Date(),
      mode: activeChatMode,
    }
    const assistantMessage: Message = {
      id: createBubuMessageId('assistant'),
      role: 'assistant',
      content: '',
      createdAt: new Date(),
      mode: activeChatMode,
      streamState: createMessageStreamState('feature', 'queued'),
    }

    setStreamingMessageId(assistantMessage.id)
    streamContentRef.current = ''
    setMessages(prev => [...prev, userMessage, assistantMessage])
    setIsAnalyzing(true)
    setIsLoading(true)
    setIsStreamingStarted(false)
    autoScrollRef.current = true
    setShowJumpLatest(false)
    stopRequestedRef.current = false
    streamHadOutputRef.current = false

    const isNewSession = !currentSessionId
    if (user) {
      sessionId = await ensureSession(activeChatMode)
      if (sessionId) {
        await saveMessage(sessionId, 'user', userMessage.content, activeChatMode)
        if (isNewSession) {
          const titleText = summary.slice(0, 30) + (summary.length > 30 ? '...' : '')
          await supabase.from('chat_sessions').update({ title: titleText }).eq('id', sessionId)
          refreshSessionList()
        }
      }
    }

    const requestController = new AbortController()
    abortControllerRef.current = requestController
    let foregroundRun: ForegroundRunState | null = null

    try {
      if (!sessionId) throw new Error('创建会话失败')
      foregroundRun = {
        id: operationId,
        operationId,
        sessionId,
        runKind: 'feature',
        mode: activeChatMode,
        userMessage,
        assistantMessage,
        controller: requestController,
        content: '',
        status: 'queued',
        streamState: createMessageStreamState('feature', 'queued'),
        startedAt: Date.now(),
        isAnalyzing: true,
        stopRequested: false,
        hadOutput: false,
      }
      registerForegroundRun(foregroundRun)

      const res = await fetch('/api/feature-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: payload.kind,
          params: payload.params,
          chatMode: activeChatMode,
          complexity: activeChatMode === 'agent' ? agentComplexity : undefined,
        }),
        signal: requestController.signal,
      })

      if (!res.ok) {
        if (res.status === 403) {
          const err = await res.json().catch(() => ({}))
          if (err?.error === 'quota_exceeded') {
            setShowQuotaExhausted(true)
            setAppleQuota(prev => prev ? { ...prev, remaining: err.remaining ?? 0 } : null)
            setTimeout(() => setShowQuotaExhausted(false), 8000)
            // Roll back the user bubble
            if (!foregroundRun || isForegroundRunVisible(foregroundRun)) {
              setMessages(prev => prev.filter(m => m.id !== userMessage.id && m.id !== assistantMessage.id))
              setStreamingMessageId(null)
            }
            return
          }
        }
        throw new Error(`HTTP ${res.status}`)
      }

      const llmMeta = getLlmResponseMeta(res)

      fetchQuota()

      const reader = res.body?.getReader()
      if (reader) {
        const decoder = new TextDecoder()
        let fullContent = ''
        let streamingStarted = false
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = sanitizeReplacementChars(decoder.decode(value, { stream: true }))
          if (!chunk) continue
          fullContent += chunk
          if (foregroundRun) {
            foregroundRun.content = fullContent
            foregroundRun.hadOutput = true
            foregroundRun.status = 'streaming'
            foregroundRun.streamState = createMessageStreamState('feature', 'streaming', getGeneratingLabel('feature'))
          }
          if (foregroundRun && isForegroundRunVisible(foregroundRun)) {
            streamContentRef.current = fullContent
            streamHadOutputRef.current = true
          }
          if (!streamingStarted && chunk.trim()) {
            streamingStarted = true
            if (!foregroundRun || isForegroundRunVisible(foregroundRun)) {
              setIsStreamingStarted(true)
            }
          }
          if (foregroundRun) scheduleForegroundContentUpdate(foregroundRun)
        }
        const tail = sanitizeReplacementChars(decoder.decode())
        if (tail) {
          fullContent += tail
          if (foregroundRun) {
            foregroundRun.content = fullContent
            foregroundRun.hadOutput = true
            foregroundRun.streamState = createMessageStreamState('feature', 'streaming', getGeneratingLabel('feature'))
          }
          if (foregroundRun && isForegroundRunVisible(foregroundRun)) {
            streamContentRef.current = fullContent
          }
        }
        if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null }
        if (foregroundRun && isForegroundRunVisible(foregroundRun)) {
          setStreamingMessageId(null)
        }
        const finalContent = fullContent.trim()
          ? fullContent
          : BUBU_EMPTY_RESPONSE.feature
        const shouldRequestFeatureFollowUps = Boolean(user) && !shouldSkipFollowUpSuggestions(finalContent)
        if (foregroundRun) {
          applyForegroundRunPatch(foregroundRun, {
            content: finalContent,
            status: 'complete',
            streamState: createMessageStreamState('feature', 'complete'),
            ...getFinalFollowUpState(finalContent, shouldRequestFeatureFollowUps),
          })
        }
        if (user && sessionId && finalContent) {
          await saveMessage(sessionId, 'assistant', finalContent, activeChatMode, {
            model: llmMeta.model,
            tokensUsed: llmMeta.inputTokens + estimateTokensForText(finalContent),
          })
        }
        // After successful analysis: refresh quota again (server may have refunded if empty stream)
        fetchQuota()
        // Save feature context for follow-up
        const nextFeatureContext: FeatureContext = { kind: payload.kind, summary, participants }
        const runIsVisible = foregroundRun ? isForegroundRunVisible(foregroundRun) : isOperationActive(sessionId)
        if (runIsVisible) {
          setFeatureContext(nextFeatureContext)
          setSessionSummary(summary)
        }
        if (sessionId) {
          await supabase
            .from('chat_sessions')
            .update({ summary } as any)
            .eq('id', sessionId)
          refreshSessionList()
        }
        if (shouldRequestFeatureFollowUps && runIsVisible) {
          void requestFollowUpSuggestions(assistantMessage.id, {
            assistantContent: finalContent,
            runKind: 'feature',
            previousUserContent: userDisplay,
            recentMessages: [...messages, userMessage, { ...assistantMessage, content: finalContent }],
            reportType: payload.kind,
            featureContext: nextFeatureContext,
            participants,
          })
        }
      }
    } catch (error) {
      if (foregroundRun?.stopRequested || stopRequestedRef.current || isAbortLikeError(error)) {
        const partialContent = sanitizeReplacementChars(foregroundRun?.content ?? streamContentRef.current)
        const stoppedContent = partialContent || BUBU_EMPTY_RESPONSE.stoppedFeature
        if (foregroundRun) {
          applyForegroundRunPatch(foregroundRun, {
            content: stoppedContent,
            status: 'stopped',
            streamState: createMessageStreamState('feature', 'stopped'),
            suggestedFollowUps: [],
            followUpStatus: 'ready',
          })
        } else if (!streamHadOutputRef.current) {
          const stoppedMessage: Message = {
            id: createBubuMessageId('assistant'),
            role: 'assistant',
            content: stoppedContent,
            createdAt: new Date(),
            mode: activeChatMode,
            streamState: createMessageStreamState('feature', 'stopped'),
            suggestedFollowUps: [],
            followUpStatus: 'ready',
          }
          setMessages(prev => [...prev, stoppedMessage])
        }
        if (user && sessionId && stoppedContent) {
          await saveMessage(sessionId, 'assistant', stoppedContent, activeChatMode)
        }
        fetchQuota()
        return
      }
      console.error('Feature analyze error:', error)
      if (foregroundRun) {
        applyForegroundRunPatch(foregroundRun, {
          content: BUBU_EMPTY_RESPONSE.featureError,
          status: 'error',
          streamState: createMessageStreamState('feature', 'error'),
          suggestedFollowUps: [],
          followUpStatus: 'ready',
        })
      } else {
        const errorMessage: Message = {
          id: createBubuMessageId('assistant'),
          role: 'assistant',
          content: BUBU_EMPTY_RESPONSE.featureError,
          createdAt: new Date(),
          mode: activeChatMode,
          streamState: createMessageStreamState('feature', 'error'),
          suggestedFollowUps: [],
          followUpStatus: 'ready',
        }
        setMessages(prev => [...prev, errorMessage])
      }
      if (user && sessionId) {
        await saveMessage(sessionId, 'assistant', BUBU_EMPTY_RESPONSE.featureError, activeChatMode)
      }
      // Server-side refund already happened; refresh quota to reflect
      fetchQuota()
    } finally {
      if (foregroundRun) {
        if (activeForegroundRunIdRef.current === foregroundRun.id && rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current)
          rafIdRef.current = null
        }
        clearForegroundRun(foregroundRun)
      } else if (activeOperationIdRef.current === operationId) {
        setIsLoading(false)
        setIsStreamingStarted(false)
        setIsAnalyzing(false)
        setStreamingMessageId(null)
        streamContentRef.current = ''
        activeRunIdRef.current = null
        activeOperationIdRef.current = null
        abortControllerRef.current = null
        stopRequestedRef.current = false
        streamHadOutputRef.current = false
        if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null }
      }
    }
  }, [user, isLoading, isAnalyzing, currentSessionId, ensureSession, saveMessage, supabase, fetchQuota, activeChatMode, agentComplexity, setStreamingMessageId, requestFollowUpSuggestions, messages, refreshSessionList, registerForegroundRun, scheduleForegroundContentUpdate, applyForegroundRunPatch, isForegroundRunVisible, clearForegroundRun])

  // Helper used by chat-message follow-up buttons & launcher button.
  const fillAndSubmit = useCallback((text: string) => {
    if (!user) {
      setShowAuthDialog(true)
      return
    }
    setTimeout(() => {
      const ev = {
        preventDefault: () => {},
        __contentOverride: text,
      } as React.FormEvent & { __contentOverride: string }
      handleSubmit(ev)
    }, 30)
  }, [user, handleSubmit])

  const openFeaturePage = useCallback((kind: FeatureKind) => {
    setActiveFeature(kind as FeatureType)
  }, [])

  const createAndSaveBaziProfile = useCallback(async (
    data: BaziData,
    profileName: string,
    profileId?: string | null,
    options: { updateCurrent?: boolean; addToAgentContext?: boolean } = {},
  ): Promise<SelectedProfileContext> => {
    const updateCurrent = options.updateCurrent ?? true
    const addToAgentContext = options.addToAgentContext ?? updateCurrent
    const response = await fetch('/api/bazi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year: parseInt(data.year),
        month: parseInt(data.month),
        day: parseInt(data.day),
        hour: parseInt(data.hour),
        isSolar: data.isSolar,
        isFemale: data.isFemale,
        longitude: parseFloat(data.longitude),
        latitude: parseFloat(data.latitude),
      }),
    })
    const result = await response.json()
    if (!response.ok) {
      throw new Error(result.error || '八字信息验证失败')
    }

    let savedProfileContext: SelectedProfileContext = {
      name: profileName || '当前命主',
      baziText: result.baziResult,
    }

    if (user) {
      const saveProfileResponse = await fetch('/api/bazi-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(profileId ? { id: profileId } : {}),
          profile_name: profileName || '当前命主',
          birth_year: parseInt(data.year),
          birth_month: parseInt(data.month),
          birth_day: parseInt(data.day),
          birth_hour: parseInt(data.hour),
          birth_minute: parseInt(data.minute || '0'),
          is_solar_calendar: data.isSolar,
          gender: data.isFemale ? 'female' : 'male',
          birth_longitude: parseFloat(data.longitude),
          birth_latitude: parseFloat(data.latitude),
          bazi_result_text: result.baziResult,
          bazi_result_json: result.baziData,
        }),
      })
      const saved = await saveProfileResponse.json().catch(() => ({}))
      if (!saveProfileResponse.ok) {
        throw new Error(saved?.details || saved?.error || '保存八字人物失败')
      }
      if (saveProfileResponse.ok && saved.profile) {
        const option: BaziProfileOption = {
          id: saved.profile.id,
          profile_name: saved.profile.profile_name,
          bazi_result_text: saved.profile.bazi_result_text,
          bazi_result: saved.profile.bazi_result,
        }
        savedProfileContext = profileOptionToContext(option)
        setAgentProfiles(prev => [option, ...prev.filter(item => item.id !== option.id)])
      }
    }

    if (updateCurrent) {
      setSelectedProfile(savedProfileContext)
      setSelectedProfileId(savedProfileContext.id || null)
      setBaziAnalysisResult(savedProfileContext.baziText || null)
      setBaziData(data)
    }
    if (activeChatMode === 'agent' && addToAgentContext) {
      setAgentParticipants(prev => mergeProfileContexts([...prev, savedProfileContext]))
    }
    return savedProfileContext
  }, [activeChatMode, user])

  const handleBaziSubmit = async (data: BaziData) => {
    try {
      await createAndSaveBaziProfile(data, '新人物', null, {
        updateCurrent: false,
        addToAgentContext: false,
      })
      setAgentBaziInitialData(undefined);
      setShowBaziDialog(false);
      const infoMessage: Message = {
        id: createBubuMessageId('assistant'),
        role: 'assistant',
        content: '小象已经把这个人物收进资料里啦。需要分析时，在人物管理或 Agent 上下文里选 TA，我就能结合命盘继续看。',
        createdAt: new Date(),
        mode: activeChatMode,
      };
      setMessages(prev => [...prev, infoMessage]);
    } catch (error) {
      console.error('Error validating Bazi data:', error);
      toast({
        title: '卜卜象没排稳这份盘',
        description: error instanceof Error
          ? error.message
          : '出生信息里可能有一处没对上，帮我再核一下就好。',
        variant: 'destructive',
      });
    }
  }

  const handleAgentUiSubmit = useCallback(async (
    request: AgentInlineInputRequest,
    values: AgentInputValues,
  ) => {
    if (!user) {
      setShowAuthDialog(true)
      return
    }

    const valueText = (name: string, fallback = '') => {
      const value = values[name]
      const text = agentInputValueToText(value)
      return text || fallback
    }
    setMessages(prev =>
      prev.map(message =>
        message.agentUi?.requestId === request.requestId
          ? { ...message, agentUiStatus: 'submitted' }
          : message
      )
    )

    try {
      if (request.kind === 'bazi_profiles') {
        const requestedProfiles = request.profiles || []
        const submittedCount = Number(values['profiles.__count'])
        const profileCount = Number.isFinite(submittedCount) && submittedCount > 0
          ? Math.floor(submittedCount)
          : requestedProfiles.length
        const profiles = Array.from(
          { length: profileCount },
          (_, index) => requestedProfiles[index] || {},
        )
        if (profiles.length === 0) {
          throw new Error('这张批量人物卡没有可保存的人物。')
        }
        const savedProfiles: SelectedProfileContext[] = []
        for (let index = 0; index < profiles.length; index += 1) {
          const profile = profiles[index]
          const batchValueText = (name: string, fallback = '') => {
            const value = values[`profiles.${index}.${name}`]
            const text = agentInputValueToText(value)
            return text || fallback
          }
          const data: BaziData = {
            year: batchValueText('year'),
            month: batchValueText('month', '1'),
            day: batchValueText('day', '1'),
            hour: batchValueText('hour'),
            minute: batchValueText('minute', '0'),
            isSolar: values[`profiles.${index}.isSolar`] === 'solar' || values[`profiles.${index}.isSolar`] === true,
            isFemale: values[`profiles.${index}.gender`] === 'female' || values[`profiles.${index}.isFemale`] === true,
            longitude: batchValueText('longitude', '121.5'),
            latitude: batchValueText('latitude', '31.2'),
          }
          const profileName = batchValueText('profileName', profile.profileName || `人物${index + 1}`) || `人物${index + 1}`
          const savedProfile = await createAndSaveBaziProfile(data, profileName, null, {
            updateCurrent: false,
            addToAgentContext: false,
          })
          savedProfiles.push(savedProfile)
        }

        const nextSelectedProfile = selectedProfile || savedProfiles[0] || null
        const nextParticipants = mergeProfileContexts([
          ...agentParticipants,
          ...(selectedProfile ? [selectedProfile] : []),
          ...savedProfiles,
        ])
        setAgentParticipants(nextParticipants)
        if (!selectedProfile && savedProfiles[0]) {
          setSelectedProfile(savedProfiles[0])
          setSelectedProfileId(savedProfiles[0].id || null)
          setBaziAnalysisResult(savedProfiles[0].baziText || null)
        }

        const originalNames: string[] = profiles
          .map((profile, index) => {
            const originalName = agentInputValueToText(values[`profiles.${index}.__originalName`])
            return originalName || profile.profileName || ''
          })
          .filter(Boolean)
        const corrections = originalNames
          .map((originalName, index) => {
            const savedName = savedProfiles[index]?.name
            return originalName && savedName && originalName !== savedName
              ? `${originalName} -> ${savedName}`
              : ''
          })
          .filter(Boolean)
        const savedNames = savedProfiles.map(profile => profile.name).filter(Boolean).join('、')
        const nameCorrection = corrections.length > 0
          ? `\n人物名修正：${corrections.join('；')}`
          : ''
        const resumeText = `${request.resumeIntent || '请继续刚才的问题'}\n已创建八字人物：${savedNames}。${nameCorrection}`
        const event = {
          preventDefault: () => {},
          __contentOverride: resumeText,
          __selectedProfileOverride: nextSelectedProfile,
          __selectedParticipantsOverride: nextParticipants,
          __preserveCurrentProfile: true,
        } as React.FormEvent & {
          __contentOverride: string
          __selectedProfileOverride: SelectedProfileContext | null
          __selectedParticipantsOverride: SelectedProfileContext[]
          __preserveCurrentProfile: boolean
        }
        handleSubmit(event)
        return
      }

      if (request.kind === 'bazi_profile' || request.kind === 'profile_required') {
        const data: BaziData = {
          year: valueText('year'),
          month: valueText('month', '1'),
          day: valueText('day', '1'),
          hour: valueText('hour'),
          minute: valueText('minute', '0'),
          isSolar: values.isSolar === 'solar' || values.isSolar === true,
          isFemale: values.gender === 'female' || values.isFemale === true,
          longitude: valueText('longitude', '121.5'),
          latitude: valueText('latitude', '31.2'),
        }
        const profileName = valueText('profileName', '新人物') || '新人物'
        const savedProfile = await createAndSaveBaziProfile(data, profileName, null, {
          updateCurrent: false,
          addToAgentContext: false,
        })
        const nextSelectedProfile = selectedProfile || savedProfile
        const nextParticipants = mergeProfileContexts([
          ...agentParticipants,
          ...(selectedProfile ? [selectedProfile] : []),
          savedProfile,
        ])
        setAgentParticipants(nextParticipants)
        if (!selectedProfile) {
          setSelectedProfile(savedProfile)
          setSelectedProfileId(savedProfile.id || null)
          setBaziAnalysisResult(savedProfile.baziText || null)
        }
        const originalProfileName = agentPendingConfirmation?.draftSlots?.unresolvedNames?.[0]
        const nameCorrection = originalProfileName && originalProfileName !== savedProfile.name
          ? `\n人物名修正：${originalProfileName} -> ${savedProfile.name}`
          : ''
        const resumeText = `${request.resumeIntent || '请继续刚才的问题'}\n已创建八字人物：${savedProfile.name}。${nameCorrection}`
        const event = {
          preventDefault: () => {},
          __contentOverride: resumeText,
          __selectedProfileOverride: nextSelectedProfile,
          __selectedParticipantsOverride: nextParticipants,
          __preserveCurrentProfile: true,
        } as React.FormEvent & {
          __contentOverride: string
          __selectedProfileOverride: SelectedProfileContext
          __selectedParticipantsOverride: SelectedProfileContext[]
          __preserveCurrentProfile: boolean
        }
        handleSubmit(event)
        return
      }

      const hasReportStyleField = request.fields.some(field => field.name === 'reportStyle')
      const nextReportPreference = hasReportStyleField
        ? reportPreferenceFromAgentValue(values.reportStyle)
        : null
      if (nextReportPreference) {
        setAgentReportPreference(nextReportPreference)
      }
      const hasComplexityField = request.fields.some(field => field.name === 'agentComplexity')
      const nextAgentComplexity = hasComplexityField
        ? agentComplexityFromAgentValue(values.agentComplexity)
        : null
      if (nextAgentComplexity) {
        setAgentComplexity(nextAgentComplexity)
      }
      const structuredChoice = request.fields
        .filter(field => field.inputType === 'choice' && !field.multiple)
        .map(field => ({
          field,
          option: agentInputSelectedOption(field, values[field.name]),
        }))
        .find(item => item.option?.params && typeof item.option.params === 'object')
      const confirmationAction = agentInputValueToText(values.confirmationAction)
      if (confirmationAction) {
        const actionField = request.fields.find(field => field.name === 'confirmationAction')
        const selectedOption = actionField?.options?.find(option => String(option.value) === confirmationAction)
        const requestReportPreference = nextReportPreference || selectedOption?.reportPreference || null
        const requestAgentComplexity = nextAgentComplexity || agentComplexityFromAgentValue(selectedOption?.complexity ?? null) || null
        if (requestAgentComplexity) {
          setAgentComplexity(requestAgentComplexity)
        }
        if (!selectedOption && actionField?.allowCustom) {
          const nextPendingConfirmation = agentPendingConfirmation
            ? {
                ...agentPendingConfirmation,
                executionProfile: {
                  ...(agentPendingConfirmation.executionProfile || {}),
                  ...(requestReportPreference ? { reportPreference: requestReportPreference } : {}),
                  ...(requestAgentComplexity ? { complexity: requestAgentComplexity } : {}),
                },
              }
            : agentPendingConfirmation
          const event = {
            preventDefault: () => {},
            __contentOverride: `${request.resumeIntent || '请继续刚才的问题'}\n我想调整分析路径：${confirmationAction}`,
            __pendingConfirmationOverride: nextPendingConfirmation,
            ...(requestReportPreference ? { __agentReportPreferenceOverride: requestReportPreference } : {}),
            ...(requestAgentComplexity ? { __agentComplexityOverride: requestAgentComplexity } : {}),
          } as React.FormEvent & {
            __contentOverride: string
            __pendingConfirmationOverride?: AgentPendingConfirmation | null
            __agentReportPreferenceOverride?: AgentReportPreference | null
            __agentComplexityOverride?: AgentComplexityMode | null
          }
          handleSubmit(event)
          return
        }
        const selectedParams = selectedOption?.params && typeof selectedOption.params === 'object'
          ? selectedOption.params
          : null
        const selectedRange = selectedParamsToTimeRange(selectedParams, selectedOption?.label || '已选时间范围')
        const nextPendingConfirmation = selectedParams && agentPendingConfirmation
          ? {
              ...agentPendingConfirmation,
              ...(selectedParams.draftSlots ? { draftSlots: selectedParams.draftSlots } : {}),
              params: selectedParams,
              resumeIntent: selectedOption?.resumeIntent || request.resumeIntent || agentPendingConfirmation.resumeIntent,
              executionProfile: {
                ...(agentPendingConfirmation.executionProfile || {}),
                ...(requestReportPreference ? { reportPreference: requestReportPreference } : {}),
                ...(requestAgentComplexity ? { complexity: requestAgentComplexity } : {}),
              },
            }
          : agentPendingConfirmation
        const actionLabel = actionField
          ? agentInputValueToDisplay(actionField, values.confirmationAction)
          : ''
        const event = {
          preventDefault: () => {},
          __contentOverride: `${request.resumeIntent || '请继续刚才的问题'}\n确认：可以${actionLabel ? `\n选择：${actionLabel}` : ''}`,
          __pendingConfirmationOverride: nextPendingConfirmation,
          ...(requestReportPreference ? { __agentReportPreferenceOverride: requestReportPreference } : {}),
          ...(requestAgentComplexity ? { __agentComplexityOverride: requestAgentComplexity } : {}),
          ...(selectedRange ? { __timeRangesOverride: [selectedRange] } : {}),
        } as React.FormEvent & {
          __contentOverride: string
          __pendingConfirmationOverride?: AgentPendingConfirmation | null
          __agentReportPreferenceOverride?: AgentReportPreference | null
          __agentComplexityOverride?: AgentComplexityMode | null
          __timeRangesOverride?: AgentTimeRange[]
        }
        handleSubmit(event)
        return
      }
      const hasTimeRangeField = request.fields.some(field =>
        field.name === 'timeRangePreset' ||
        field.name === 'customStart' ||
        field.name === 'customEnd',
      )
      const inlineTimeRange = hasTimeRangeField ? resolveInlineTimeRange(values) : null
      if (hasTimeRangeField && !inlineTimeRange) {
        throw new Error('请补全自定义开始日期和结束日期后再继续。')
      }

      const selectedOption = structuredChoice?.option || null
      const selectedParams = selectedOption?.params && typeof selectedOption.params === 'object'
        ? selectedOption.params
        : null
      const selectedRange = selectedParamsToTimeRange(selectedParams, selectedOption?.label || '已选时间范围')
      const requestReportPreference = nextReportPreference || selectedOption?.reportPreference || null
      const requestAgentComplexity = nextAgentComplexity || agentComplexityFromAgentValue(selectedOption?.complexity ?? null) || null
      if (requestAgentComplexity) {
        setAgentComplexity(requestAgentComplexity)
      }
      const nextPendingConfirmation = selectedParams && agentPendingConfirmation
        ? {
            ...agentPendingConfirmation,
            ...(selectedParams.draftSlots ? { draftSlots: selectedParams.draftSlots } : {}),
            params: selectedParams,
            resumeIntent: selectedOption?.resumeIntent || request.resumeIntent || agentPendingConfirmation.resumeIntent,
            executionProfile: {
              ...(agentPendingConfirmation.executionProfile || {}),
              ...(requestReportPreference ? { reportPreference: requestReportPreference } : {}),
              ...(requestAgentComplexity ? { complexity: requestAgentComplexity } : {}),
            },
          }
        : agentPendingConfirmation

      const filled = request.fields
        .map(field => `${field.label}：${agentInputValueToDisplay(field, values[field.name])}`)
        .filter(line => !line.endsWith('：'))
        .join('\n')
      const event = {
        preventDefault: () => {},
        __contentOverride: `${request.resumeIntent || '请继续刚才的问题'}\n${filled}`,
        ...(selectedParams ? { __pendingConfirmationOverride: nextPendingConfirmation } : {}),
        ...(requestReportPreference ? { __agentReportPreferenceOverride: requestReportPreference } : {}),
        ...(requestAgentComplexity ? { __agentComplexityOverride: requestAgentComplexity } : {}),
        ...(selectedRange || inlineTimeRange ? { __timeRangesOverride: [selectedRange || inlineTimeRange].filter(Boolean) as AgentTimeRange[] } : {}),
      } as React.FormEvent & {
        __contentOverride: string
        __pendingConfirmationOverride?: AgentPendingConfirmation | null
        __agentReportPreferenceOverride?: AgentReportPreference | null
        __agentComplexityOverride?: AgentComplexityMode | null
        __timeRangesOverride?: AgentTimeRange[]
      }
      handleSubmit(event)
    } catch (error) {
      setMessages(prev =>
        prev.map(message =>
          message.agentUi?.requestId === request.requestId
            ? { ...message, agentUiStatus: 'pending' }
            : message
        )
      )
      console.error('Agent inline input failed:', error)
      toast({
        title: '卜卜象没接住这次提交',
        description: error instanceof Error
          ? error.message
          : '先检查一下刚填的内容，等我把这一步重新接起来。',
        variant: 'destructive',
      })
    }
  }, [agentParticipants, agentPendingConfirmation, createAndSaveBaziProfile, handleSubmit, selectedProfile, user])

  const selectComposerClassicMode = useCallback((ultra: boolean) => {
    if (activeChatMode !== 'classic') {
      handleChatModeChange('classic')
    }
    setIsUltraMode(ultra)
    setComposerModeOpen(false)
  }, [activeChatMode, handleChatModeChange])

  const selectComposerAgentMode = useCallback((mode: AgentComplexityMode) => {
    if (activeChatMode !== 'agent') {
      handleChatModeChange('agent')
    }
    setAgentComplexity(mode)
    setComposerModeOpen(false)
  }, [activeChatMode, handleChatModeChange])

  const composerModeLabel =
    activeChatMode === 'agent'
      ? AGENT_COMPLEXITY_OPTIONS.find(option => option.mode === agentComplexity)?.label || 'Instant'
      : isUltraMode
      ? '经典+'
      : '经典'

  const composerModeTitle =
    activeChatMode === 'agent'
      ? agentComplexity === 'instant'
        ? 'Agent Instant，快速编排'
        : `Agent ${composerModeLabel}，提高规划和报告上限`
      : isUltraMode
      ? `经典投喂模式，每次消耗 ${CLASSIC_CHAT_APPLE_COST} 个苹果`
      : '经典聊天，不消耗苹果'

  const visibleAgentParticipants =
    agentParticipants.length > 0
      ? agentParticipants
      : selectedProfile
      ? [selectedProfile]
      : []

  const renderComposerModeMenu = () => (
    <>
      {composerModeOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setComposerModeOpen(false)}
        />
      )}
      <div className="relative z-50">
        <button
          type="button"
          onClick={() => setComposerModeOpen(open => !open)}
          disabled={isLoading}
          aria-expanded={composerModeOpen}
          className="flex h-8 max-w-[6.5rem] flex-shrink-0 items-center justify-center gap-1 rounded-full bg-muted/70 px-2.5 text-xs font-light text-foreground transition-all hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-none"
          title={composerModeTitle}
        >
          <span className="truncate">{composerModeLabel}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform ${
              composerModeOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {composerModeOpen && (
          <div className="glass-minimal absolute bottom-full right-0 z-50 mb-3 w-60 overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-2xl">
            <div className="px-3 pb-2 pt-1 text-xs text-muted-foreground">
              {activeChatMode === 'agent' ? 'Agent 深度' : '经典选项'}
            </div>
            {activeChatMode === 'classic' ? (
              <>
                <button
                  type="button"
                  onClick={() => selectComposerClassicMode(false)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted/60"
                >
                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">经典</span>
                  <span className="text-xs text-muted-foreground">不投喂</span>
                  {!isUltraMode && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                </button>
                <button
                  type="button"
                  onClick={() => selectComposerClassicMode(true)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted/60"
                >
                  <MessageCircle className="h-4 w-4 text-primary" />
                  <span className="flex-1">经典投喂</span>
                  <span className="text-xs text-muted-foreground">苹果 ×{CLASSIC_CHAT_APPLE_COST}</span>
                  {isUltraMode && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                </button>
              </>
            ) : (
              <>
                {AGENT_COMPLEXITY_OPTIONS.map(option => {
                  const Icon = option.icon
                  const selected = agentComplexity === option.mode
                  return (
                    <button
                      key={option.mode}
                      type="button"
                      onClick={() => selectComposerAgentMode(option.mode)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted/60"
                    >
                      <Icon className={`h-4 w-4 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="flex-1">{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {option.mode === 'instant' ? '快速' : '深度'}
                      </span>
                      {selected && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  )
                })}
              </>
            )}

            {appleQuota && (
              <div className="mt-2 rounded-xl border border-border/70 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
                苹果 {appleQuota.remaining}/{appleQuota.dailyLimit}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )

  const renderModeSwitch = () => (
    <div className="inline-grid h-8 grid-cols-2 rounded-full border border-border/70 bg-muted/45 p-0.5 shadow-sm">
      <button
        type="button"
        onClick={() => handleChatModeChange('agent')}
        className={`h-7 px-3 rounded-full text-xs font-light flex items-center justify-center gap-1.5 transition-all ${
          activeChatMode === 'agent'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        title="Agent 对话"
      >
        <Bot className="w-3.5 h-3.5" />
        Agent
      </button>
      <button
        type="button"
        onClick={() => handleChatModeChange('classic')}
        className={`h-7 px-3 rounded-full text-xs font-light flex items-center justify-center gap-1.5 transition-all ${
          activeChatMode === 'classic'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        title="经典聊天"
      >
        <MessageCircle className="w-3.5 h-3.5" />
        经典
      </button>
    </div>
  )

  // ---- 渲染主聊天区域 ----
  const renderChatArea = () => (
    <>
      <div ref={messagesContainerRef} className="relative flex-1 overflow-y-auto px-3 pb-6 pt-16 [scrollbar-gutter:stable] md:px-6 md:pb-8">
        <div className="max-w-3xl mx-auto">
          <div ref={messagesStartRef} />
          {isSessionLoading ? (
            <div className="space-y-4 py-4 md:space-y-6">
              <div className="mr-auto w-full max-w-3xl rounded-2xl border border-border/65 bg-card/70 p-4 shadow-sm md:rounded-xl">
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-muted/70" />
                  <div className="h-3 w-20 rounded-full bg-muted/70" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-11/12 rounded-full bg-muted/60" />
                  <div className="h-3 w-8/12 rounded-full bg-muted/50" />
                </div>
              </div>
              <div className="ml-auto h-10 w-64 max-w-[82%] rounded-2xl bg-primary/18 md:rounded-lg" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex min-h-[calc(100dvh-14rem)] items-center justify-center py-6 md:py-8">
              <div className="w-full space-y-5 text-center md:space-y-7">
                <div className="space-y-3 md:space-y-4">
                  <div className="flex justify-center">
                    <div className="relative h-16 w-16 sm:h-24 sm:w-24">
                      <Image
                        src="/logo.jpg"
                        alt="卜卜象"
                        fill
                        className="object-contain rounded-full shadow-sm"
                        priority
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-3xl font-light leading-tight text-foreground sm:text-4xl md:text-5xl">
                      卜卜象陪你卜卜象
                    </h1>
                    <p className="mx-auto max-w-xl px-4 text-sm font-light leading-relaxed text-muted-foreground md:text-base">
                      {activeChatMode === 'agent'
                        ? 'Agent 会判断问题、补问关键信息，并在需要时调用结构化分析。'
                        : '可以直接提问八字命理，也可以从下方选择一个结构化功能开始 🐘'}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {renderModeSwitch()}
                  </div>
                </div>

                <FeatureCards
                  onPick={(kind) => {
                    if (!user) {
                      setActiveFeature(kind as FeatureType)
                      return
                    }
                    setActiveFeature(kind as FeatureType)
                  }}
                />

                {!user && (
                  <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border border-border bg-card/70 px-4 py-3 text-center backdrop-blur-sm">
                    <p className="text-xs sm:text-sm text-muted-foreground font-light">
                      登录后可保存人物档案、同步聊天记录，并使用每日苹果额度。
                    </p>
                    <button
                      onClick={() => setShowAuthDialog(true)}
                      className="h-9 rounded-lg bg-primary px-5 text-sm font-light text-primary-foreground hover:opacity-90 transition-all"
                    >
                      登录 / 注册
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-3 md:space-y-6 md:py-4">
              {messages.map((message, idx) => {
                let reportType: FeatureKind | undefined
                let previousUserContent: string | undefined
                if (message.role === 'assistant') {
                  for (let i = idx - 1; i >= 0; i--) {
                    if (messages[i].role === 'user') {
                      previousUserContent = messages[i].content
                      const k = detectFeatureKindFromContent(messages[i].content)
                      if (k) reportType = k
                      break
                    }
                  }
                }
                const isLastAssistant =
                  message.role === 'assistant' && idx === messages.length - 1
                return (
                  <div
                    key={message.id}
                    ref={message.id === activeStreamingMessageId ? streamingMessageTopRef : undefined}
                    className="scroll-mt-20"
                  >
                    <ChatMessage
                      message={message}
                      isStreaming={message.id === activeStreamingMessageId}
                      reportType={reportType}
                      previousUserContent={previousUserContent}
                      onFollowUp={isLastAssistant ? fillAndSubmit : undefined}
                      onAgentUiSubmit={handleAgentUiSubmit}
                    />
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {showJumpLatest && messages.length > 0 && (
          <button
            onClick={scrollToLatest}
            className="fixed bottom-[calc(8.25rem+env(safe-area-inset-bottom))] right-4 z-30 inline-flex h-10 items-center gap-2 rounded-full border border-primary/25 bg-card/95 px-3 text-xs font-medium text-foreground shadow-lg backdrop-blur-sm transition-all hover:bg-card md:bottom-28"
            title="跳到最新"
          >
            <ArrowDown className="h-4 w-4 text-primary" />
            最新
          </button>
        )}

        {showScrollTop && messages.length > 0 && (
          <button
            onClick={scrollToTop}
            className={`fixed bottom-[calc(8.25rem+env(safe-area-inset-bottom))] z-20 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/90 text-muted-foreground shadow-lg backdrop-blur-sm transition-all hover:bg-card hover:text-foreground md:bottom-28 ${
              showJumpLatest ? 'right-24 md:right-28' : 'right-4'
            }`}
            title="回到顶部"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="shrink-0 border-t border-border/45 bg-background/90 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl md:px-4">
        <div className="max-w-3xl mx-auto">
          {showQuotaExhausted && (
            <div className="mb-2 rounded-lg border border-primary/25 bg-card/82 px-4 py-3 animate-fade-in relative">
              <button
                onClick={() => setShowQuotaExhausted(false)}
                className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
              <p className="pr-7 text-sm text-foreground font-light">
                今天的苹果额度已用完。明天会自动刷新，也可以加购更多额度。
              </p>
              <button
                onClick={() => { setShowDonationDialog(true); setShowQuotaExhausted(false) }}
                className="mt-2 h-8 rounded-lg bg-primary px-3 text-xs font-light text-primary-foreground hover:opacity-90 transition-all"
              >
                购买苹果
              </button>
            </div>
          )}

          <form id="chat-form" onSubmit={handleSubmit} className="relative">
            {activeChatMode === 'agent' && user && mentionOpen && (
              <div className="glass-minimal absolute bottom-full left-0 right-0 z-50 mx-auto mb-2 max-h-[min(26rem,calc(100dvh-12rem))] max-w-xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
                <div className="px-3 py-2 border-b border-border/50 flex items-center gap-2 text-xs text-muted-foreground">
                  <Plus className="w-3.5 h-3.5" />
                  添加 Agent 上下文
                </div>
                <div className="max-h-96 overflow-y-auto py-1">
                  <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/70">
                    人物
                  </div>
                  {filteredAgentProfiles.length > 0 ? (
                    filteredAgentProfiles.map(profile => {
                      const ctx = profileOptionToContext(profile)
                      const selected = agentParticipants.some(
                        item => profileContextKey(item) === profileContextKey(ctx),
                      )
                      return (
                        <button
                          key={profile.id}
                          type="button"
                          onClick={() => selectAgentProfileMention(profile)}
                          className={`w-full px-3 py-2.5 flex items-center gap-3 text-left transition-colors ${
                            selected ? 'bg-primary/8 text-foreground' : 'hover:bg-muted/50 text-foreground'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                            selected ? 'bg-primary/15 text-primary' : 'bg-primary/10 text-primary'
                          }`}>
                            <AtSign className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-foreground truncate">{profile.profile_name}</p>
                            {ctx.pillars && (
                              <p className="text-[10px] text-muted-foreground/75 truncate tracking-wider">
                                {ctx.pillars}
                              </p>
                            )}
                          </div>
                          {selected && <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-primary" />}
                        </button>
                      )
                    })
                  ) : (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      暂无匹配人物
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMentionOpen(false)
                      setShowProfilesDialog(true)
                    }}
                    className="w-full px-3 py-2 flex items-center gap-2 text-xs text-primary hover:bg-muted/40 transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    添加到人物管理
                  </button>

                  <div className="px-3 pt-3 pb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/70 border-t border-border/50">
                    时间段
                  </div>
                  <div className="grid grid-cols-2 gap-2 px-3 py-2">
                    {agentQuickTimeRanges.map(range => (
                      <button
                        key={`${range.label}-${range.start}-${range.end}`}
                        type="button"
                        onClick={() => selectAgentTimeMention(range)}
                        className="rounded-lg border border-border/70 bg-muted/25 px-3 py-2 text-left transition-colors hover:bg-muted/55"
                      >
                        <p className="text-xs text-foreground">{range.label}</p>
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          点击后带入这段时间
                        </p>
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                    <input
                      type="date"
                      value={agentTimeDraft.start}
                      onChange={event => setAgentTimeDraft(prev => ({ ...prev, start: event.target.value }))}
                      className="h-9 rounded-lg border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-primary/60"
                    />
                    <input
                      type="date"
                      value={agentTimeDraft.end}
                      onChange={event => setAgentTimeDraft(prev => ({ ...prev, end: event.target.value }))}
                      className="h-9 rounded-lg border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-primary/60"
                    />
                    <input
                      type="text"
                      value={agentTimeDraft.label}
                      onChange={event => setAgentTimeDraft(prev => ({ ...prev, label: event.target.value }))}
                      placeholder="标签，可选"
                      className="col-span-2 h-9 rounded-lg border border-border bg-card px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
                    />
                    <button
                      type="button"
                      disabled={!agentTimeDraft.start || !agentTimeDraft.end}
                      onClick={() => {
                        addAgentCustomTimeRange()
                        replaceActiveMention(agentTimeDraft.label || '自定义时间段', '#')
                        setMentionOpen(false)
                      }}
                      className="col-span-2 h-9 rounded-lg bg-primary text-xs text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      添加自定义时间段
                    </button>
                  </div>

                  <div className="px-3 pt-3 pb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/70 border-t border-border/50">
                    功能
                  </div>
                  {filteredAgentFeatures.map(item => {
                    const Icon = item.icon
                    return (
                      <button
                        key={item.kind}
                        type="button"
                        onClick={() => selectAgentFeatureMention(item.kind, item.label)}
                        className="w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-muted/50 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground truncate">{item.label}</p>
                          <p className="text-[10px] text-muted-foreground/75 truncate">{item.hint}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-border/80 bg-card/90 px-2 py-1.5 shadow-[0_16px_48px_oklch(0.245_0.012_255/0.10)] backdrop-blur-xl md:rounded-xl">
              {user && activeChatMode === 'agent' && (visibleAgentParticipants.length > 0 || agentTimeRanges.length > 0 || agentReportPreference) && (
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5 px-1">
                  {visibleAgentParticipants.map(profile => (
                    <div
                      key={profileContextKey(profile)}
                      className="inline-flex max-w-full items-center gap-2 rounded-lg border border-primary/20 bg-primary/8 px-2.5 py-1 text-xs text-foreground"
                    >
                      <AtSign className="w-3 h-3 flex-shrink-0 text-primary" />
                      <span className="text-muted-foreground">人物</span>
                      <span className="max-w-[9rem] truncate">{profile.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (agentParticipants.length > 0) {
                            removeAgentParticipant(profile)
                          } else {
                            setSelectedProfile(null)
                            setSelectedProfileId(null)
                            setBaziAnalysisResult(null)
                          }
                        }}
                        className="flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="移除人物"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {agentTimeRanges.map(range => (
                    <div
                      key={range.id}
                      className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-muted/45 px-2.5 py-1 text-xs text-foreground"
                    >
                      <Hash className="w-3 h-3 flex-shrink-0 text-primary" />
                      <span className="max-w-[8rem] truncate">{range.label}</span>
                      <button
                        type="button"
                        onClick={() => removeAgentTimeRange(range.id)}
                        className="flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="移除时间段"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {agentReportPreference && (
                    <div className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-muted/45 px-2.5 py-1 text-xs text-foreground">
                      <MessageSquareText className="w-3 h-3 flex-shrink-0 text-primary" />
                      <span className="text-muted-foreground">报告</span>
                      <span className="max-w-[8rem] truncate">
                        {reportPreferenceToDisplay(agentReportPreference)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setAgentReportPreference(null)}
                        className="flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                        title={BUBU_COPY.page.removeReportStyleTitle}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}
              {user && activeChatMode === 'classic' && selectedProfile && (
                <div className="mb-1.5 flex items-center gap-2 px-1">
                  <div className="inline-flex max-w-full items-center gap-2 rounded-lg border border-primary/20 bg-primary/8 px-2.5 py-1 text-xs text-foreground">
                    <AtSign className="w-3 h-3 text-primary" />
                    <span className="text-muted-foreground">当前命主</span>
                    <span className="max-w-[12rem] truncate">{selectedProfile.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProfile(null)
                        setSelectedProfileId(null)
                        setBaziAnalysisResult(null)
                      }}
                      className="flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="移除当前人物"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-end gap-2">
                {activeChatMode === 'agent' ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!user) {
                        setShowAuthDialog(true)
                        return
                      }
                      setMentionQuery('')
                      setMentionTrigger('@')
                      setMentionOpen(open => !open)
                      if (agentProfiles.length === 0) loadAgentProfiles()
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground hover:bg-card hover:text-foreground transition-all"
                    disabled={isLoading || isAnalyzing}
                    title="添加 Agent 上下文"
                  >
                    <Plus className={`w-4 h-4 transition-transform ${mentionOpen ? 'rotate-45' : ''}`} />
                  </button>
                ) : (
                  <FeatureLauncherButton
                    variant="sm"
                    disabled={isLoading || isAnalyzing}
                    onPick={(kind) => {
                      if (!user) {
                        setShowAuthDialog(true)
                        return
                      }
                      openFeaturePage(kind)
                    }}
                    selectedProfileId={selectedProfileId}
                    onSelectProfile={(profileId, baziResult, profile) => {
                      setSelectedProfileId(profileId)
                      setBaziAnalysisResult(baziResult)
                      setSelectedProfile(profile ? { id: profileId, ...profile } : null)
                      if (!baziResult) setBaziData(null)
                    }}
                    onOpenProfilesDialog={() => setShowProfilesDialog(true)}
                  />
                )}
                <textarea
                  ref={composerTextareaRef}
                  rows={1}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={user ? (activeChatMode === 'agent' ? '想聊什么？随便问吧' : '想聊什么？随便问吧') : '登录后可以开始和卜卜象聊天 🐘'}
                  className="composer-textarea h-8 min-h-8 max-h-32 min-w-0 flex-1 resize-none overflow-hidden bg-transparent px-1 py-1.5 text-sm font-light leading-5 text-foreground placeholder-muted-foreground focus:outline-none"
                  disabled={isLoading || !user}
                />
                {renderComposerModeMenu()}
                {isLoading ? (
                  <button
                    type="button"
                    onClick={handleStopGeneration}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-destructive/35 bg-destructive/10 text-destructive hover:bg-destructive/15 transition-all"
                    title="停止输出"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim() || !user}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    title="发送"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  )

  // ---- 渲染功能区域 ----
  const goBackToChat = () => setActiveFeature('chat')
  const requireAuth = () => setShowAuthDialog(true)

  const renderFeatureContent = () => {
    switch (activeFeature) {
      case 'chat':
        return renderChatArea()
      case 'hepan':
        return (
          <HepanPage
            onBack={goBackToChat}
            onSubmit={(params) => submitFeatureAnalyze({ kind: 'hepan', params })}
            onOpenProfilesManager={() => setShowProfilesDialog(true)}
            onRequireAuth={requireAuth}
            loading={isAnalyzing}
          />
        )
      case 'fortune':
        return (
          <FortunePage
            onBack={goBackToChat}
            onSubmit={(params) => submitFeatureAnalyze({ kind: 'fortune', params })}
            onOpenProfilesManager={() => setShowProfilesDialog(true)}
            onRequireAuth={requireAuth}
            loading={isAnalyzing}
          />
        )
      case 'avatar':
        return (
          <AvatarPage
            onBack={goBackToChat}
            onSubmit={(params) => submitFeatureAnalyze({ kind: 'avatar', params })}
            onOpenProfilesManager={() => setShowProfilesDialog(true)}
            onRequireAuth={requireAuth}
            loading={isAnalyzing}
          />
        )
      case 'lifepath':
        return (
          <LifePathPage
            onBack={goBackToChat}
            onSubmit={(params) => submitFeatureAnalyze({ kind: 'lifepath', params })}
            onOpenProfilesManager={() => setShowProfilesDialog(true)}
            onRequireAuth={requireAuth}
            loading={isAnalyzing}
          />
        )
      default:
        return renderChatArea()
    }
  }

  return (
    <>
      <AppSidebar
        activeFeature={activeFeature}
        activeChatMode={activeChatMode}
        onFeatureChange={setActiveFeature}
        onChatModeChange={handleChatModeChange}
        currentSessionId={currentSessionId}
        onSelectSession={loadSession}
        onOpenAuth={() => setShowAuthDialog(true)}
        onOpenProfiles={() => setShowProfilesDialog(true)}
        onOpenChangePassword={() => setShowChangePasswordDialog(true)}
        appleQuota={appleQuota}
        onOpenDonation={() => setShowDonationDialog(true)}
        refreshKey={sessionListRefreshKey}
      />

      <SidebarInset className="relative min-w-0 overflow-hidden bg-background">
        <MinimalBackground />

        <div className="relative z-10 h-dvh min-w-0 flex flex-col">
          {/* Top bar: Sidebar trigger + UserMenu */}
          <div className="pointer-events-none absolute inset-x-16 top-3 z-20 flex h-10 items-center justify-center md:hidden">
            <div className="inline-flex min-w-0 items-center gap-2 rounded-full border border-border/55 bg-card/80 px-3 py-1.5 shadow-sm backdrop-blur-xl">
              <span className="relative h-5 w-5 overflow-hidden rounded-full">
                <Image src="/avatar.png" alt="卜卜象" fill className="object-contain" />
              </span>
              <span className="truncate text-sm font-medium text-foreground">卜卜象</span>
            </div>
          </div>
          <div className="absolute top-3 left-3 z-20">
            <button
              onClick={toggleSidebar}
              className="w-10 h-10 rounded-xl bg-card/80 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-all duration-300"
              title={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
            >
              {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            </button>
          </div>
          <div className="absolute top-3 right-3 z-20 w-max">
            <UserMenu
              onOpenAuth={() => setShowAuthDialog(true)}
              onOpenProfiles={() => setShowProfilesDialog(true)}
              onOpenChangePassword={() => setShowChangePasswordDialog(true)}
              onOpenRewards={() => setShowRewardsDialog(true)}
              appleQuota={appleQuota}
            />
          </div>

          {/* Main content area */}
          {renderFeatureContent()}
        </div>

        {/* Dialogs */}
        {showBaziDialog && (
          <BaziDialog
            isOpen={showBaziDialog}
            onClose={() => {
              setShowBaziDialog(false)
              setAgentBaziInitialData(undefined)
            }}
            onSubmit={handleBaziSubmit}
            initialData={agentBaziInitialData}
          />
        )}
        {showAuthDialog && (
          <AuthDialog
            isOpen={showAuthDialog}
            onClose={() => setShowAuthDialog(false)}
          />
        )}
        {showRewardsDialog && (
          <RewardsDialog
            isOpen={showRewardsDialog}
            onClose={() => setShowRewardsDialog(false)}
            onRedeemed={fetchQuota}
          />
        )}
        {showProfilesDialog && (
          <ProfilesManagementDialog
            isOpen={showProfilesDialog}
            onClose={() => setShowProfilesDialog(false)}
            onProfileSaved={(profile) => {
              const option: BaziProfileOption = {
                id: profile.id,
                profile_name: profile.profile_name,
                bazi_result_text: profile.bazi_result_text,
                bazi_result: profile.bazi_result,
              }
              setAgentProfiles(prev => {
                const next = prev.filter(item => item.id !== option.id)
                return [option, ...next]
              })
              if (activeChatMode === 'agent') {
                const ctx = profileOptionToContext(option)
                setSelectedProfileId(option.id)
                setSelectedProfile(ctx)
                setBaziAnalysisResult(ctx.baziText || null)
                setAgentParticipants(prev => mergeProfileContexts([...prev, ctx]))
              }
              loadAgentProfiles()
            }}
          />
        )}
        {showChangePasswordDialog && (
          <ChangePasswordDialog
            isOpen={showChangePasswordDialog}
            onClose={() => setShowChangePasswordDialog(false)}
          />
        )}
        {showDonationDialog && (
          <DonationDialog
            isOpen={showDonationDialog}
            onClose={() => setShowDonationDialog(false)}
            appleQuota={appleQuota}
          />
        )}
      </SidebarInset>
    </>
  )
}
