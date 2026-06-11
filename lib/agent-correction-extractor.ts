import { callLLMTextWithUsage } from '@/lib/llm'
import { recordLlmUsage } from '@/lib/token-usage'
import { buildAgentCorrectionExtractorPrompt } from '@/lib/bubu-content'
import type {
  AgentParticipant,
  AgentWorkflowCorrection,
  PendingAgentStep,
} from '@/lib/agent-workflow-types'

const DEFAULT_EXTRACTOR_TIMEOUT_MS = 1800

function readTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.AGENT_CORRECTION_EXTRACTOR_TIMEOUT_MS || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EXTRACTOR_TIMEOUT_MS
}

function createTimeoutSignal(parent?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const abortFromParent = () => controller.abort(parent?.reason)
  if (parent?.aborted) controller.abort(parent.reason)
  parent?.addEventListener('abort', abortFromParent, { once: true })
  const timer = setTimeout(() => controller.abort(new Error('agent correction extractor timeout')), readTimeoutMs())
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      parent?.removeEventListener('abort', abortFromParent)
    },
  }
}

function compactJson(value: unknown, max = 1600): string {
  const text = JSON.stringify(value || null)
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function extractJsonObject(text: string): any | null {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
}

function normalizeConfidence(value: unknown): AgentWorkflowCorrection['confidence'] {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return 'low'
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeCorrection(raw: any): AgentWorkflowCorrection | null {
  if (!raw || raw.intent !== 'correction') return null
  const confidence = normalizeConfidence(raw.confidence)
  if (confidence === 'low') return null
  const reason = normalizeString(raw.reason) || null

  if (raw.scope === 'person') {
    const intendedName = normalizeString(raw.intendedName || raw.replacement || raw.target)
    if (!intendedName) return null
    return {
      intent: 'correction',
      scope: 'person',
      intendedName,
      rejectedName: normalizeString(raw.rejectedName || raw.rejected) || undefined,
      createNew: Boolean(raw.createNew),
      confidence,
      source: 'llm',
      reason,
    }
  }

  if (raw.scope === 'time') {
    const timeText = normalizeString(raw.timeText || raw.replacement || raw.target)
    if (!timeText) return null
    return { intent: 'correction', scope: 'time', timeText, confidence, source: 'llm', reason }
  }

  if (raw.scope === 'focus') {
    const focus = Array.isArray(raw.focus)
      ? raw.focus.map(normalizeString).filter(Boolean)
      : normalizeString(raw.replacement).split(/[、,，;；]/).map(item => item.trim()).filter(Boolean)
    if (!focus.length) return null
    return { intent: 'correction', scope: 'focus', focus, confidence, source: 'llm', reason }
  }

  if (raw.scope === 'depth') {
    const depth = normalizeString(raw.depth || raw.replacement)
    if (depth !== 'concise' && depth !== 'balanced' && depth !== 'detailed') return null
    return { intent: 'correction', scope: 'depth', depth, confidence, source: 'llm', reason }
  }

  if (raw.scope === 'profile_data') {
    const fieldName = normalizeString(raw.fieldName || raw.target)
    const value = normalizeString(raw.value || raw.replacement)
    if (!fieldName || !value) return null
    return { intent: 'correction', scope: 'profile_data', fieldName, value, confidence, source: 'llm', reason }
  }

  return null
}

function participantSnapshot(participants?: AgentParticipant[]): Array<{ id?: string | null; name: string }> {
  return (participants || [])
    .filter(profile => profile?.name?.trim())
    .map(profile => ({ id: profile.id, name: profile.name }))
}

export async function extractAgentCorrectionWithLLM(input: {
  userId?: string
  latestText: string
  pendingConfirmation: PendingAgentStep
  selectedProfile?: AgentParticipant | null
  participants?: AgentParticipant[]
  signal?: AbortSignal
}): Promise<AgentWorkflowCorrection | null> {
  if (!process.env.DEEPSEEK_API_KEY) return null

  const pending = input.pendingConfirmation
  const messages = [
    {
      role: 'system',
      content: buildAgentCorrectionExtractorPrompt(),
    },
    {
      role: 'user',
      content: `【最新用户消息】
${input.latestText}

【当前 pending】
${compactJson({
        kind: pending.kind,
        field: pending.field ? { name: pending.field.name, label: pending.field.label } : null,
        sourceIntent: pending.sourceIntent,
        draftSlots: {
          people: pending.draftSlots.people.map(person => person.name),
          mentionedNames: pending.draftSlots.mentionedNames || [],
          unresolvedNames: pending.draftSlots.unresolvedNames || [],
          askedTime: pending.draftSlots.askedTime,
          matter: pending.draftSlots.matter,
          outputDepth: pending.draftSlots.outputDepth,
        },
      })}

【可用人物】
${compactJson({
        selectedProfile: input.selectedProfile?.name || null,
        participants: participantSnapshot(input.participants),
      })}`,
    },
  ]

  const timeout = createTimeoutSignal(input.signal)
  try {
    const result = await callLLMTextWithUsage(messages, 'agent_extractor', {
      signal: timeout.signal,
      maxTokens: 700,
      temperature: 0,
      thinking: 'disabled',
      reasoningEffort: 'none',
    })
    if (input.userId) {
      void recordLlmUsage({
        userId: input.userId,
        source: 'agent_planner',
        mode: 'agent',
        model: result.config.model,
        task: 'agent_extractor',
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      })
    }
    return normalizeCorrection(extractJsonObject(result.text))
  } catch (error) {
    console.warn('[agent-correction-extractor] fallback to deterministic path', error)
    return null
  } finally {
    timeout.cleanup()
  }
}
