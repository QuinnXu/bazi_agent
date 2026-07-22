import { createHash, randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/client'
import { touchReferralAttribution } from '@/lib/referral-attribution'

export const GUEST_TRIAL_COOKIE = 'bubu_guest_trial'
export const GUEST_TRIAL_FINAL_ANSWER_LIMIT = 1
const GUEST_TRIAL_TTL_DAYS = 30
const GUEST_KEY_PATTERN = /^[a-f0-9]{64}$/i

export interface GuestTrialState {
  keyHash: string
  finalAnswersUsed: number
  remainingFinalAnswers: number
  expiresAt: string
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function guestHashSecret(): string {
  return process.env.GUEST_TRIAL_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'bubu-guest-trial'
}

function hashGuestKey(key: string): string {
  return createHash('sha256')
    .update(`${guestHashSecret()}:${key}`)
    .digest('hex')
}

function normalizeGuestRow(row: any): GuestTrialState {
  const finalAnswersUsed = Math.max(0, Number(row?.final_answers_used || 0))
  return {
    keyHash: String(row.guest_key_hash),
    finalAnswersUsed,
    remainingFinalAnswers: Math.max(0, GUEST_TRIAL_FINAL_ANSWER_LIMIT - finalAnswersUsed),
    expiresAt: String(row.expires_at),
  }
}

export async function getOrCreateGuestTrial(): Promise<GuestTrialState> {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(GUEST_TRIAL_COOKIE)?.value
  const guestKey = cookieValue && GUEST_KEY_PATTERN.test(cookieValue)
    ? cookieValue
    : randomBytes(32).toString('hex')
  const keyHash = hashGuestKey(guestKey)
  const now = new Date()
  const expiresAt = addDays(now, GUEST_TRIAL_TTL_DAYS).toISOString()

  if (guestKey !== cookieValue) {
    cookieStore.set(GUEST_TRIAL_COOKIE, guestKey, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: GUEST_TRIAL_TTL_DAYS * 24 * 60 * 60,
    })
  }

  const supabase = createServiceClient()
  const { data: existing, error: lookupError } = await supabase
    .from('guest_trial_usage')
    .select('guest_key_hash, final_answers_used, expires_at')
    .eq('guest_key_hash', keyHash)
    .maybeSingle()

  if (lookupError) {
    throw new Error(`Guest trial unavailable: ${lookupError.message}`)
  }

  if (!existing) {
    const { data: inserted, error: insertError } = await supabase
      .from('guest_trial_usage')
      .insert({
        guest_key_hash: keyHash,
        final_answers_used: 0,
        last_seen_at: now.toISOString(),
        expires_at: expiresAt,
      } as any)
      .select('guest_key_hash, final_answers_used, expires_at')
      .single()
    if (insertError || !inserted) {
      throw new Error(`Guest trial create failed: ${insertError?.message || 'missing row'}`)
    }
    await touchReferralAttribution('trial_started_at')
    return normalizeGuestRow(inserted)
  }

  const state = normalizeGuestRow(existing)
  if (new Date(state.expiresAt).getTime() < now.getTime()) {
    const { data: reset, error: resetError } = await supabase
      .from('guest_trial_usage')
      .update({
        final_answers_used: 0,
        last_seen_at: now.toISOString(),
        expires_at: expiresAt,
        updated_at: now.toISOString(),
      } as any)
      .eq('guest_key_hash', keyHash)
      .select('guest_key_hash, final_answers_used, expires_at')
      .single()
    if (resetError || !reset) {
      throw new Error(`Guest trial reset failed: ${resetError?.message || 'missing row'}`)
    }
    await touchReferralAttribution('trial_started_at')
    return normalizeGuestRow(reset)
  }

  const { data, error } = await supabase
    .from('guest_trial_usage')
    .update({
      last_seen_at: now.toISOString(),
      expires_at: expiresAt,
      updated_at: now.toISOString(),
    } as any)
    .eq('guest_key_hash', keyHash)
    .select('guest_key_hash, final_answers_used, expires_at')
    .single()

  if (error || !data) {
    throw new Error(`Guest trial touch failed: ${error?.message || 'missing row'}`)
  }

  await touchReferralAttribution('trial_started_at')
  return normalizeGuestRow(data)
}

export async function recordGuestFinalAnswer(keyHash: string): Promise<GuestTrialState | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('guest_trial_usage')
    .select('guest_key_hash, final_answers_used, expires_at')
    .eq('guest_key_hash', keyHash)
    .single()

  if (error || !data) {
    console.warn('[guest-trial] final answer lookup failed:', error?.message)
    return null
  }

  const current = normalizeGuestRow(data)
  if (current.finalAnswersUsed >= GUEST_TRIAL_FINAL_ANSWER_LIMIT) return current

  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await supabase
    .from('guest_trial_usage')
    .update({
      final_answers_used: current.finalAnswersUsed + 1,
      last_seen_at: now,
      updated_at: now,
    } as any)
    .eq('guest_key_hash', keyHash)
    .select('guest_key_hash, final_answers_used, expires_at')
    .single()

  if (updateError || !updated) {
    console.warn('[guest-trial] final answer update failed:', updateError?.message)
    return null
  }

  await touchReferralAttribution('trial_completed_at')
  return normalizeGuestRow(updated)
}
