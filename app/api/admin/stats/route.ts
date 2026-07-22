import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/client'
import { isAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// ─── Helpers ───

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseDate(value: string | null): string | null {
  if (!value || !DATE_RE.test(value)) return null
  const d = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return null
  return value
}

function toUtcDayKey(iso: string): string {
  return iso.split('T')[0]
}

function enumerateDateKeys(startISODate: string, endISODate: string): string[] {
  const keys: string[] = []
  const start = new Date(`${startISODate}T00:00:00.000Z`)
  const end = new Date(`${endISODate}T00:00:00.000Z`)
  for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    keys.push(toUtcDayKey(d.toISOString()))
  }
  return keys
}

function isTimestampInRange(
  value: string | null | undefined,
  sinceMs: number,
  untilMs: number,
): value is string {
  if (!value) return false
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) && timestamp >= sinceMs && timestamp < untilMs
}

interface DailyBucket {
  total: number
  free: number
  paid: number
  total_tokens: number
  input_tokens: number
  output_tokens: number
  llm_calls: number
}

interface UserBucket {
  total: number
  free: number
  paid: number
  total_tokens: number
  input_tokens: number
  output_tokens: number
  llm_calls: number
}

interface ModelBucket {
  model: string
  calls: number
  total_tokens: number
  input_tokens: number
  output_tokens: number
  completed: number
  failed: number
}

interface FeatureBucket {
  kind: string
  label: string
  selections: number
  entry_users: Set<string>
  actual_uses: number
  actual_users: Set<string>
  page_uses: number
  agent_uses: number
  completed: number
  failed: number
  empty: number
  aborted: number
  total_tokens: number
  input_tokens: number
  output_tokens: number
}

interface EntryOriginBucket {
  origin: string
  label: string
  selections: number
  users: Set<string>
}

interface SessionModeBucket {
  mode: string
  label: string
  sessions: number
  users: Set<string>
}

const FEATURE_ENTRY_TASK_PREFIX = 'feature_entry_select:'

const FEATURE_LABELS: Record<string, string> = {
  hepan: '合盘 · 应事',
  fortune: '近期运势',
  avatar: '头像分析',
  lifepath: '人生脉络',
  liuyao: '卜卦',
}

const ENTRY_ORIGIN_LABELS: Record<string, string> = {
  sidebar: '侧边栏入口',
  composer_launcher: '输入框功能菜单',
  empty_home: '空白首页快捷入口',
  mode_switch: '模式切换入口',
  unknown: '未知入口',
}

const SESSION_MODE_LABELS: Record<string, string> = {
  agent: '本命屋',
  liuyao: '卜卦',
  classic: '经典聊天',
}

function isFeatureEntryTask(task: string | null | undefined): boolean {
  return String(task || '').startsWith(FEATURE_ENTRY_TASK_PREFIX)
}

function parseFeatureEntryOrigin(task: string | null | undefined): string {
  if (!isFeatureEntryTask(task)) return 'unknown'
  return String(task).slice(FEATURE_ENTRY_TASK_PREFIX.length) || 'unknown'
}

function normaliseFeatureKind(value: string | null | undefined): string | null {
  const kind = String(value || '').trim()
  if (!kind) return null
  return FEATURE_LABELS[kind] ? kind : null
}

function ensureFeatureBucket(map: Map<string, FeatureBucket>, kind: string): FeatureBucket {
  let entry = map.get(kind)
  if (!entry) {
    entry = {
      kind,
      label: FEATURE_LABELS[kind] || kind,
      selections: 0,
      entry_users: new Set<string>(),
      actual_uses: 0,
      actual_users: new Set<string>(),
      page_uses: 0,
      agent_uses: 0,
      completed: 0,
      failed: 0,
      empty: 0,
      aborted: 0,
      total_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
    }
    map.set(kind, entry)
  }
  return entry
}

/**
 * GET /api/admin/stats
 *   ?days=30                                (fallback when no explicit range)
 *   ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD  (inclusive UTC day range)
 *   ?model=<exact model id>                 (optional, filters token rows only)
 *
 * Returns per-day, per-user and per-model breakdowns of conversations / token usage.
 * Admin only.
 */
export async function GET(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    if (!isAdmin(user.email)) {
      return NextResponse.json({ error: '无权限访问' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const startDateParam = parseDate(searchParams.get('start_date'))
    const endDateParam = parseDate(searchParams.get('end_date'))
    const modelParam = (searchParams.get('model') || '').trim()
    const daysParam = Math.min(Math.max(parseInt(searchParams.get('days') || '30') || 30, 1), 365)

    // Resolve [startDate, endDate] in UTC. Inclusive boundaries.
    let startDate: string
    let endDate: string

    if (startDateParam && endDateParam) {
      startDate = startDateParam <= endDateParam ? startDateParam : endDateParam
      endDate = startDateParam <= endDateParam ? endDateParam : startDateParam
    } else if (startDateParam) {
      startDate = startDateParam
      endDate = startDateParam
    } else if (endDateParam) {
      startDate = endDateParam
      endDate = endDateParam
    } else {
      const todayKey = toUtcDayKey(new Date().toISOString())
      const start = new Date(`${todayKey}T00:00:00.000Z`)
      start.setUTCDate(start.getUTCDate() - (daysParam - 1))
      startDate = toUtcDayKey(start.toISOString())
      endDate = todayKey
    }

    const sinceISO = `${startDate}T00:00:00.000Z`
    // Query by `< endExclusiveISO` to keep all events on `endDate`.
    const endBoundary = new Date(`${endDate}T00:00:00.000Z`)
    endBoundary.setUTCDate(endBoundary.getUTCDate() + 1)
    const untilISO = endBoundary.toISOString()
    const sinceMs = new Date(sinceISO).getTime()
    const untilMs = endBoundary.getTime()

    const serviceClient = createServiceClient()

    const { data: sessions, error: sessionsError } = await serviceClient
      .from('chat_sessions')
      .select('user_id, created_at, status, mode')
      .gte('created_at', sinceISO)
      .lt('created_at', untilISO)
      .neq('status', 'deleted')

    if (sessionsError) {
      console.error('[Admin Stats] Failed to fetch sessions:', sessionsError.message)
      return NextResponse.json({ error: '获取会话数据失败' }, { status: 500 })
    }

    const { data: quotas, error: quotasError } = await serviceClient
      .from('user_quotas')
      .select('user_id, is_paid')

    if (quotasError) {
      console.error('[Admin Stats] Failed to fetch quotas:', quotasError.message)
      return NextResponse.json({ error: '获取配额数据失败' }, { status: 500 })
    }

    let usageQuery = serviceClient
      .from('llm_usage_events')
      .select('user_id, created_at, total_tokens, input_tokens, output_tokens, status, model, source, mode, feature_kind, task')
      .gte('created_at', sinceISO)
      .lt('created_at', untilISO)

    if (modelParam) {
      usageQuery = usageQuery.eq('model', modelParam)
    }

    const { data: usageRows, error: usageError } = await usageQuery

    if (usageError) {
      console.warn('[Admin Stats] LLM usage stats unavailable:', usageError.message)
    }

    const llmRows = (usageRows || []).filter(row => !isFeatureEntryTask(row.task))

    const { data: entryRows, error: entryError } = await serviceClient
      .from('llm_usage_events')
      .select('user_id, created_at, status, source, mode, feature_kind, task')
      .gte('created_at', sinceISO)
      .lt('created_at', untilISO)
      .like('task', `${FEATURE_ENTRY_TASK_PREFIX}%`)

    if (entryError) {
      console.warn('[Admin Stats] Feature entry stats unavailable:', entryError.message)
    }

    // Pull the unfiltered model catalog separately so the dropdown is stable
    // regardless of the active `model` filter.
    const { data: modelCatalogRows, error: catalogError } = await serviceClient
      .from('llm_usage_events')
      .select('model, task')
      .gte('created_at', sinceISO)
      .lt('created_at', untilISO)

    if (catalogError) {
      console.warn('[Admin Stats] Failed to fetch model catalog:', catalogError.message)
    }

    const referralEventColumns = [
      'clicked_at',
      'trial_started_at',
      'trial_completed_at',
      'registered_at',
      'activated_at',
    ] as const
    const referralEventRangeFilter = referralEventColumns
      .map(column => `and(${column}.gte.${sinceISO},${column}.lt.${untilISO})`)
      .join(',')

    const { data: referralAttributions, error: referralAttributionError } = await serviceClient
      .from('referral_attributions')
      .select('referrer_user_id, referral_code, clicked_at, trial_started_at, trial_completed_at, registered_at, activated_at')
      .or(referralEventRangeFilter)

    if (referralAttributionError) {
      console.warn('[Admin Stats] Referral attribution stats unavailable:', referralAttributionError.message)
    }

    const { data: referralRewards, error: referralRewardError } = await serviceClient
      .from('referrals')
      .select('referrer_user_id, referral_code, status, reward_policy_version, created_at, rewarded_at')
      .eq('reward_policy_version', 'apple_v2')
      .or([
        `and(created_at.gte.${sinceISO},created_at.lt.${untilISO})`,
        `and(rewarded_at.gte.${sinceISO},rewarded_at.lt.${untilISO})`,
      ].join(','))

    if (referralRewardError) {
      console.warn('[Admin Stats] Referral reward stats unavailable:', referralRewardError.message)
    }

    const paidSet = new Set<string>()
    for (const q of quotas || []) {
      if (q.is_paid) paidSet.add(q.user_id)
    }

    // ─── Daily buckets ───
    const dailyMap = new Map<string, DailyBucket>()
    for (const key of enumerateDateKeys(startDate, endDate)) {
      dailyMap.set(key, {
        total: 0, free: 0, paid: 0,
        total_tokens: 0, input_tokens: 0, output_tokens: 0,
        llm_calls: 0,
      })
    }

    for (const s of sessions || []) {
      const dateKey = toUtcDayKey(s.created_at)
      const entry = dailyMap.get(dateKey)
      if (!entry) continue
      entry.total++
      if (paidSet.has(s.user_id)) entry.paid++
      else entry.free++
    }

    for (const row of llmRows) {
      if (row.status === 'failed') continue
      const dateKey = toUtcDayKey(row.created_at)
      const entry = dailyMap.get(dateKey)
      if (!entry) continue
      entry.total_tokens += Number(row.total_tokens || 0)
      entry.input_tokens += Number(row.input_tokens || 0)
      entry.output_tokens += Number(row.output_tokens || 0)
      entry.llm_calls += 1
    }

    const dailyStats = Array.from(dailyMap.entries())
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // ─── Per-user buckets ───
    const userMap = new Map<string, UserBucket>()
    const ensureUser = (userId: string): UserBucket => {
      let entry = userMap.get(userId)
      if (!entry) {
        entry = {
          total: 0, free: 0, paid: 0,
          total_tokens: 0, input_tokens: 0, output_tokens: 0,
          llm_calls: 0,
        }
        userMap.set(userId, entry)
      }
      return entry
    }

    for (const s of sessions || []) {
      const entry = ensureUser(s.user_id)
      entry.total++
      if (paidSet.has(s.user_id)) entry.paid++
      else entry.free++
    }

    for (const row of llmRows) {
      if (row.status === 'failed') continue
      const entry = ensureUser(row.user_id)
      entry.total_tokens += Number(row.total_tokens || 0)
      entry.input_tokens += Number(row.input_tokens || 0)
      entry.output_tokens += Number(row.output_tokens || 0)
      entry.llm_calls += 1
    }

    // ─── Per-model buckets ───
    const modelMap = new Map<string, ModelBucket>()
    const ensureModel = (model: string): ModelBucket => {
      let entry = modelMap.get(model)
      if (!entry) {
        entry = {
          model,
          calls: 0,
          total_tokens: 0, input_tokens: 0, output_tokens: 0,
          completed: 0, failed: 0,
        }
        modelMap.set(model, entry)
      }
      return entry
    }

    for (const row of llmRows) {
      const modelName = row.model || 'unknown'
      const entry = ensureModel(modelName)
      entry.calls += 1
      if (row.status === 'failed') {
        entry.failed += 1
        continue
      }
      entry.completed += 1
      entry.total_tokens += Number(row.total_tokens || 0)
      entry.input_tokens += Number(row.input_tokens || 0)
      entry.output_tokens += Number(row.output_tokens || 0)
    }

    const modelStats = Array.from(modelMap.values())
      .sort((a, b) => b.total_tokens - a.total_tokens || b.calls - a.calls)

    // ─── Feature entry / usage buckets ───
    const featureMap = new Map<string, FeatureBucket>()
    const originMap = new Map<string, EntryOriginBucket>()
    const modeMap = new Map<string, SessionModeBucket>()
    const dailyFeatureMap = new Map<string, Record<string, number | string>>()

    for (const key of enumerateDateKeys(startDate, endDate)) {
      dailyFeatureMap.set(key, {
        date: key,
        label: key.slice(5),
        hepan: 0,
        fortune: 0,
        avatar: 0,
        lifepath: 0,
        liuyao: 0,
      })
    }

    const ensureOrigin = (origin: string): EntryOriginBucket => {
      let entry = originMap.get(origin)
      if (!entry) {
        entry = {
          origin,
          label: ENTRY_ORIGIN_LABELS[origin] || origin,
          selections: 0,
          users: new Set<string>(),
        }
        originMap.set(origin, entry)
      }
      return entry
    }

    const ensureMode = (mode: string): SessionModeBucket => {
      let entry = modeMap.get(mode)
      if (!entry) {
        entry = {
          mode,
          label: SESSION_MODE_LABELS[mode] || mode,
          sessions: 0,
          users: new Set<string>(),
        }
        modeMap.set(mode, entry)
      }
      return entry
    }

    for (const s of sessions || []) {
      const mode = String((s as any).mode || 'classic')
      const entry = ensureMode(mode)
      entry.sessions += 1
      entry.users.add(s.user_id)
    }

    for (const row of entryRows || []) {
      const kind = normaliseFeatureKind(row.feature_kind)
      if (!kind) continue
      const feature = ensureFeatureBucket(featureMap, kind)
      feature.selections += 1
      feature.entry_users.add(row.user_id)

      const dateKey = toUtcDayKey(row.created_at)
      const daily = dailyFeatureMap.get(dateKey)
      if (daily && kind in daily) {
        daily[kind] = Number(daily[kind] || 0) + 1
      }

      const origin = parseFeatureEntryOrigin(row.task)
      const originEntry = ensureOrigin(origin)
      originEntry.selections += 1
      originEntry.users.add(row.user_id)
    }

    for (const row of llmRows) {
      const kind = normaliseFeatureKind(row.feature_kind)
      if (!kind) continue
      const feature = ensureFeatureBucket(featureMap, kind)
      feature.actual_uses += 1
      feature.actual_users.add(row.user_id)
      if (row.source === 'agent_tool') feature.agent_uses += 1
      else feature.page_uses += 1
      if (row.status === 'failed') feature.failed += 1
      else if (row.status === 'empty') feature.empty += 1
      else if (row.status === 'aborted') feature.aborted += 1
      else feature.completed += 1
      if (row.status !== 'failed') {
        feature.total_tokens += Number(row.total_tokens || 0)
        feature.input_tokens += Number(row.input_tokens || 0)
        feature.output_tokens += Number(row.output_tokens || 0)
      }
    }

    const featureStats = Array.from(featureMap.values())
      .map(entry => ({
        kind: entry.kind,
        label: entry.label,
        selections: entry.selections,
        entry_users: entry.entry_users.size,
        actual_uses: entry.actual_uses,
        actual_users: entry.actual_users.size,
        page_uses: entry.page_uses,
        agent_uses: entry.agent_uses,
        completed: entry.completed,
        failed: entry.failed,
        empty: entry.empty,
        aborted: entry.aborted,
        total_tokens: entry.total_tokens,
        input_tokens: entry.input_tokens,
        output_tokens: entry.output_tokens,
      }))
      .sort((a, b) => b.selections - a.selections || b.actual_uses - a.actual_uses || b.total_tokens - a.total_tokens)

    const entryOriginStats = Array.from(originMap.values())
      .map(entry => ({
        origin: entry.origin,
        label: entry.label,
        selections: entry.selections,
        users: entry.users.size,
      }))
      .sort((a, b) => b.selections - a.selections)

    const sessionModeStats = Array.from(modeMap.values())
      .map(entry => ({
        mode: entry.mode,
        label: entry.label,
        sessions: entry.sessions,
        users: entry.users.size,
      }))
      .sort((a, b) => b.sessions - a.sessions)

    const featureDailyStats = Array.from(dailyFeatureMap.values())
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))

    // ─── Resolve emails ───
    const { data: { users: authUsers } } = await serviceClient.auth.admin.listUsers({ perPage: 1000 })
    const emailMap = new Map<string, string>()
    for (const u of authUsers || []) {
      emailMap.set(u.id, u.email || u.id.slice(0, 8))
    }

    type ReferralFunnelBucket = {
      referrer_user_id: string
      referral_code: string
      clicks: number
      trial_started: number
      trial_completed: number
      registered: number
      activated: number
      pending: number
      rewarded: number
    }

    const referralFunnelMap = new Map<string, ReferralFunnelBucket>()
    const ensureReferralFunnel = (referrerUserId: string, referralCode: string) => {
      const key = `${referrerUserId}:${referralCode}`
      let bucket = referralFunnelMap.get(key)
      if (!bucket) {
        bucket = {
          referrer_user_id: referrerUserId,
          referral_code: referralCode,
          clicks: 0,
          trial_started: 0,
          trial_completed: 0,
          registered: 0,
          activated: 0,
          pending: 0,
          rewarded: 0,
        }
        referralFunnelMap.set(key, bucket)
      }
      return bucket
    }

    const referralDailyMap = new Map<string, { date: string; clicks: number; registered: number; activated: number }>()
    for (const key of enumerateDateKeys(startDate, endDate)) {
      referralDailyMap.set(key, { date: key, clicks: 0, registered: 0, activated: 0 })
    }

    const recordReferralDailyEvent = (
      timestamp: string | null,
      field: 'clicks' | 'registered' | 'activated',
    ): boolean => {
      if (!isTimestampInRange(timestamp, sinceMs, untilMs)) return false
      const day = referralDailyMap.get(toUtcDayKey(new Date(timestamp).toISOString()))
      if (day) day[field] += 1
      return true
    }

    for (const row of referralAttributions || []) {
      const bucket = ensureReferralFunnel(row.referrer_user_id, row.referral_code)
      if (recordReferralDailyEvent(row.clicked_at, 'clicks')) bucket.clicks += 1
      if (isTimestampInRange(row.trial_started_at, sinceMs, untilMs)) bucket.trial_started += 1
      if (isTimestampInRange(row.trial_completed_at, sinceMs, untilMs)) bucket.trial_completed += 1
      if (recordReferralDailyEvent(row.registered_at, 'registered')) bucket.registered += 1
      if (recordReferralDailyEvent(row.activated_at, 'activated')) bucket.activated += 1
    }

    for (const row of referralRewards || []) {
      const bucket = ensureReferralFunnel(row.referrer_user_id, row.referral_code)
      if (row.status === 'pending' && isTimestampInRange(row.created_at, sinceMs, untilMs)) {
        bucket.pending += 1
      }
      if (row.status === 'rewarded' && isTimestampInRange(row.rewarded_at, sinceMs, untilMs)) {
        bucket.rewarded += 1
      }
    }

    const referralByReferrer = Array.from(referralFunnelMap.values())
      .map(bucket => ({
        ...bucket,
        referrer_email: emailMap.get(bucket.referrer_user_id) || bucket.referrer_user_id.slice(0, 8),
      }))
      .sort((a, b) => b.registered - a.registered || b.clicks - a.clicks)

    const referralSummary = referralByReferrer.reduce((summary, row) => ({
      clicks: summary.clicks + row.clicks,
      trial_started: summary.trial_started + row.trial_started,
      trial_completed: summary.trial_completed + row.trial_completed,
      registered: summary.registered + row.registered,
      activated: summary.activated + row.activated,
      pending: summary.pending + row.pending,
      rewarded: summary.rewarded + row.rewarded,
    }), { clicks: 0, trial_started: 0, trial_completed: 0, registered: 0, activated: 0, pending: 0, rewarded: 0 })

    const userStats = Array.from(userMap.entries())
      .map(([userId, counts]) => ({
        user_id: userId,
        email: emailMap.get(userId) || userId.slice(0, 8),
        is_paid: paidSet.has(userId),
        ...counts,
      }))
      .sort((a, b) => b.total - a.total || b.total_tokens - a.total_tokens)

    // ─── Available models (for the filter dropdown) ───
    const availableModelSet = new Set<string>()
    for (const r of modelCatalogRows || []) {
      if (isFeatureEntryTask(r.task)) continue
      if (r.model) availableModelSet.add(r.model)
    }
    if (modelParam) availableModelSet.add(modelParam)
    const availableModels = Array.from(availableModelSet).sort()

    return NextResponse.json({
      range: { start_date: startDate, end_date: endDate },
      filter: { model: modelParam || null },
      stats: dailyStats,
      userStats,
      modelStats,
      featureStats,
      entryOriginStats,
      sessionModeStats,
      featureDailyStats,
      referralFunnel: {
        summary: referralSummary,
        daily: Array.from(referralDailyMap.values()),
        byReferrer: referralByReferrer,
      },
      availableModels,
    })
  } catch (error) {
    console.error('[Admin Stats] GET error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
