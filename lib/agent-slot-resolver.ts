import type {
  AgentAnalysisSlots,
  AgentParticipant,
  AgentResolvedPerson,
} from '@/lib/agent-workflow-types'

const SELF_NAMES = new Set(['我', '本人', '自己', '当前命主', '用户', '命主'])

export function hasBaziInfo(profile?: AgentParticipant | null): boolean {
  return !!(profile?.baziText?.trim() || profile?.pillars?.trim())
}

export function resolveCurrentProfile(input: {
  selectedProfile?: AgentParticipant | null
  baziAnalysisResult?: string | null
}): AgentParticipant | null {
  const selected = input.selectedProfile || null
  const baziText = selected?.baziText || input.baziAnalysisResult || null
  const pillars = selected?.pillars || null
  if (!baziText && !pillars) return null
  return {
    ...selected,
    name: selected?.name || '当前命主',
    pillars,
    baziText,
    dayun: selected?.dayun || null,
  }
}

function profileKey(profile: AgentParticipant): string {
  return profile.id ? `id:${profile.id}` : `name:${profile.name.trim().toLowerCase()}`
}

export function contextProfiles(input: {
  selectedProfile?: AgentParticipant | null
  baziAnalysisResult?: string | null
  participants?: AgentParticipant[]
}): AgentParticipant[] {
  const current = resolveCurrentProfile(input)
  const raw = [
    ...(current ? [current] : []),
    ...(input.participants || []),
  ]
  const seen = new Set<string>()
  const result: AgentParticipant[] = []
  for (const profile of raw) {
    if (!profile?.name?.trim()) continue
    const key = profileKey(profile)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(profile)
  }
  return result
}

function asResolved(
  profile: AgentParticipant,
  source: AgentResolvedPerson['source'],
): AgentResolvedPerson {
  return {
    ...profile,
    source,
    confidence: hasBaziInfo(profile) ? 'high' : 'low',
  }
}

function profileNameMatches(profile: AgentParticipant, rawName: string): boolean {
  const name = profile.name?.trim()
  const target = rawName.trim()
  if (!name || !target) return false
  return name.toLowerCase() === target.toLowerCase()
}

function addUnique(target: AgentResolvedPerson[], profile: AgentResolvedPerson) {
  const key = profileKey(profile)
  if (target.some(item => profileKey(item) === key)) return
  target.push(profile)
}

function findSelfProfile(profiles: AgentParticipant[], fallback?: AgentParticipant | null): AgentParticipant | null {
  const explicitSelf = profiles.find(profile => SELF_NAMES.has(profile.name?.trim()))
  if (explicitSelf) return explicitSelf
  return fallback && hasBaziInfo(fallback) ? fallback : null
}

function referencesSelf(text: string): boolean {
  return /(^|[，,。！？!?\s])(我|本人|自己|当前命主|我的|本人)/.test(text)
}

export function resolveSlots(input: {
  slots: AgentAnalysisSlots
  selectedProfile?: AgentParticipant | null
  baziAnalysisResult?: string | null
  participants?: AgentParticipant[]
  latestText: string
}): AgentAnalysisSlots {
  const slots: AgentAnalysisSlots = {
    ...input.slots,
    people: [],
    unresolvedNames: [],
    confidence: { ...input.slots.confidence },
  }
  const profiles = contextProfiles({
    selectedProfile: input.selectedProfile,
    baziAnalysisResult: input.baziAnalysisResult,
    participants: [
      ...(input.participants || []),
      ...(input.slots.people || []),
    ],
  }).filter(hasBaziInfo)
  const current = resolveCurrentProfile(input)
  const mentionedNames = input.slots.mentionedNames || []
  const category = slots.matter?.category || 'general'

  const selfProfile = referencesSelf(input.latestText)
    ? findSelfProfile(profiles, current)
    : null
  if (selfProfile) {
    addUnique(slots.people, asResolved(selfProfile, selfProfile.id === current?.id ? 'current' : 'selected'))
  }

  for (const name of mentionedNames) {
    if (SELF_NAMES.has(name)) continue
    const matched = profiles.find(profile => profileNameMatches(profile, name))
    if (matched) {
      addUnique(slots.people, asResolved(matched, matched.id === current?.id ? 'current' : 'mentioned'))
    } else {
      slots.unresolvedNames?.push(name)
    }
  }

  if (category === 'relationship') {
    if (slots.people.length === 0 && current && hasBaziInfo(current)) {
      addUnique(slots.people, asResolved(current, 'current'))
    }
    if (slots.people.length < 2 && !slots.unresolvedNames?.length) {
      for (const profile of profiles) {
        addUnique(slots.people, asResolved(profile, profile.id === current?.id ? 'current' : 'selected'))
        if (slots.people.length >= 2) break
      }
    }
  } else if (category !== 'avatar') {
    if (slots.people.length === 0) {
      const profile = current && hasBaziInfo(current) ? current : profiles[0]
      if (profile) addUnique(slots.people, asResolved(profile, profile.id === current?.id ? 'current' : 'selected'))
    }
  }

  slots.confidence.people = slots.people.length > 0
    ? slots.unresolvedNames?.length
      ? 'medium'
      : 'high'
    : 'none'

  return slots
}
