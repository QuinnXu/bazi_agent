import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/client'
import { isAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * GET /api/admin/stats?days=30
 * Returns daily conversation counts grouped by free vs paid users.
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
    const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30') || 30, 1), 90)

    const sinceDate = new Date()
    sinceDate.setDate(sinceDate.getDate() - days)
    const sinceISO = sinceDate.toISOString()

    const serviceClient = createServiceClient()

    const { data: sessions, error: sessionsError } = await serviceClient
      .from('chat_sessions')
      .select('user_id, created_at, status')
      .gte('created_at', sinceISO)
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

    const paidSet = new Set<string>()
    for (const q of quotas || []) {
      if (q.is_paid) paidSet.add(q.user_id)
    }

    const dailyMap = new Map<string, { total: number; free: number; paid: number }>()

    // Pre-fill all dates so the chart has no gaps
    for (let i = 0; i < days; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().split('T')[0]
      dailyMap.set(key, { total: 0, free: 0, paid: 0 })
    }

    for (const s of sessions || []) {
      const dateKey = s.created_at.split('T')[0]
      const entry = dailyMap.get(dateKey)
      if (!entry) continue

      entry.total++
      if (paidSet.has(s.user_id)) {
        entry.paid++
      } else {
        entry.free++
      }
    }

    const result = Array.from(dailyMap.entries())
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // Per-user breakdown
    const userMap = new Map<string, { total: number; free: number; paid: number }>()
    for (const s of sessions || []) {
      let entry = userMap.get(s.user_id)
      if (!entry) {
        entry = { total: 0, free: 0, paid: 0 }
        userMap.set(s.user_id, entry)
      }
      entry.total++
      if (paidSet.has(s.user_id)) {
        entry.paid++
      } else {
        entry.free++
      }
    }

    // Resolve emails from auth
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
      .sort((a, b) => b.total - a.total)

    return NextResponse.json({ stats: result, userStats })
  } catch (error) {
    console.error('[Admin Stats] GET error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
