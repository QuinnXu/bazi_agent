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

    const serviceClient = createServiceClient()

    const { data: sessions, error: sessionsError } = await serviceClient
      .from('chat_sessions')
      .select('user_id, created_at, status')
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
      .select('user_id, created_at, total_tokens, input_tokens, output_tokens, status, model, source, mode')
      .gte('created_at', sinceISO)
      .lt('created_at', untilISO)

    if (modelParam) {
      usageQuery = usageQuery.eq('model', modelParam)
    }

    const { data: usageRows, error: usageError } = await usageQuery

    if (usageError) {
      console.warn('[Admin Stats] LLM usage stats unavailable:', usageError.message)
    }

    // Pull the unfiltered model catalog separately so the dropdown is stable
    // regardless of the active `model` filter.
    const { data: modelCatalogRows, error: catalogError } = await serviceClient
      .from('llm_usage_events')
      .select('model')
      .gte('created_at', sinceISO)
      .lt('created_at', untilISO)

    if (catalogError) {
      console.warn('[Admin Stats] Failed to fetch model catalog:', catalogError.message)
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

    for (const row of usageRows || []) {
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

    for (const row of usageRows || []) {
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

    for (const row of usageRows || []) {
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

    // ─── Resolve emails ───
    const { data: { users: authUsers } } = await serviceClient.auth.admin.listUsers({ perPage: 1000 })
    const emailMap = new Map<string, string>()
    for (const u of authUsers || []) {
      emailMap.set(u.id, u.email || u.id.slice(0, 8))
    }

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
      availableModels,
    })
  } catch (error) {
    console.error('[Admin Stats] GET error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
