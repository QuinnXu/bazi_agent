"use client"

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { isAdmin } from '@/lib/admin'
import { AuthDialog } from '@/components/auth-dialog'
import { RefreshCw, Save, Check, AlertCircle, BarChart3, Users, Calendar, Cpu, Ticket, Copy, MousePointerClick, Layers, Gift } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Line,
} from 'recharts'

interface UserQuotaRow {
  user_id: string
  email: string
  display_name: string | null
  is_paid: boolean
  membership_tier: 'free' | 'plus' | 'ultra'
  daily_apple_limit: number
  membership_expires_at: string | null
  bonus_apple_limit: number
  bonus_expires_at: string | null
  apples_used_today: number
  last_reset_date: string | null
  has_quota_record: boolean
  referral_code: string
  invite_link: string
  referred_by: string | null
  referred_by_email: string | null
  referral_bound_at: string | null
  referral_count: number
  redemption_count: number
  wallet_balance: number
}

interface RowEdits {
  is_paid?: boolean
  membership_tier?: 'free' | 'plus' | 'ultra'
  daily_apple_limit?: number
  membership_expires_at?: string | null
  bonus_apple_limit?: number
  bonus_expires_at?: string | null
  referral_code?: string
}

interface DailyStat {
  date: string
  total: number
  free: number
  paid: number
  total_tokens: number
  input_tokens: number
  output_tokens: number
  llm_calls: number
}

interface UserStat {
  user_id: string
  email: string
  is_paid: boolean
  total: number
  free: number
  paid: number
  total_tokens: number
  input_tokens: number
  output_tokens: number
  llm_calls: number
}

interface ModelStat {
  model: string
  calls: number
  total_tokens: number
  input_tokens: number
  output_tokens: number
  completed: number
  failed: number
}

interface FeatureStat {
  kind: 'hepan' | 'fortune' | 'avatar' | 'lifepath' | 'liuyao' | string
  label: string
  selections: number
  entry_users: number
  actual_uses: number
  actual_users: number
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

interface EntryOriginStat {
  origin: string
  label: string
  selections: number
  users: number
}

interface SessionModeStat {
  mode: string
  label: string
  sessions: number
  users: number
}

interface FeatureDailyStat {
  date: string
  label: string
  hepan: number
  fortune: number
  avatar: number
  lifepath: number
  liuyao: number
}

interface StatsRange {
  start_date: string
  end_date: string
}

interface ReferralFunnelData {
  summary: {
    clicks: number
    trial_started: number
    trial_completed: number
    registered: number
    activated: number
    pending: number
    rewarded: number
  }
  daily: Array<{ date: string; clicks: number; registered: number; activated: number }>
  byReferrer: Array<{
    referrer_user_id: string
    referrer_email: string
    referral_code: string
    clicks: number
    trial_started: number
    trial_completed: number
    registered: number
    activated: number
    pending: number
    rewarded: number
  }>
}

const EMPTY_REFERRAL_FUNNEL: ReferralFunnelData = {
  summary: { clicks: 0, trial_started: 0, trial_completed: 0, registered: 0, activated: 0, pending: 0, rewarded: 0 },
  daily: [],
  byReferrer: [],
}

interface RedemptionCodeRow {
  code: string
  description: string | null
  kind: 'membership_days' | 'bonus_quota' | 'combo' | 'apple_wallet'
  membership_days: number
  membership_tier: 'plus' | 'ultra'
  bonus_apple_limit: number
  bonus_days: number
  apple_amount: number
  apple_expiry_days: number
  max_redemptions: number | null
  redeemed_count: number
  starts_at: string
  expires_at: string | null
  is_active: boolean
  created_at: string
}

interface RedemptionCodeEdits {
  description?: string | null
  max_redemptions?: string
  starts_at?: string
  expires_at?: string
}

type TabKey = 'quotas' | 'stats' | 'codes'

// ─── Date helpers (UTC, matches the API layer) ───

function todayKey(): string {
  return new Date().toISOString().split('T')[0]
}

function shiftDateKey(key: string, deltaDays: number): string {
  const d = new Date(`${key}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().split('T')[0]
}

function rangeDayCount(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00.000Z`).getTime()
  const e = new Date(`${end}T00:00:00.000Z`).getTime()
  return Math.max(1, Math.round((e - s) / 86_400_000) + 1)
}

function dateInputValue(value: string | null | undefined): string {
  if (!value) return ''
  return value.slice(0, 10)
}

// Friendly label for a model id (e.g. "google/gemini-3.1-flash-lite-preview")
function modelDisplayName(model: string): string {
  if (!model) return '未知模型'
  const parts = model.split('/')
  return parts[parts.length - 1]
}

function modelCategoryLabel(model: string): string {
  const m = model.toLowerCase()
  if (m.includes('deepseek') && m.includes('flash')) return 'DeepSeek · Flash'
  if (m.includes('deepseek') && m.includes('pro')) return 'DeepSeek · Pro'
  if (m.includes('deepseek')) return 'DeepSeek'
  if (m.includes('gemini')) return 'Google · Gemini'
  if (m.includes('gpt') || m.includes('openai')) return 'OpenAI'
  if (m.includes('claude')) return 'Anthropic'
  return '其它'
}

const MODEL_PALETTE = [
  '#10b981', // emerald
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#a855f7', // purple
  '#ef4444', // red
  '#14b8a6', // teal
  '#ec4899', // pink
  '#6366f1', // indigo
] as const

const FEATURE_CHART_ITEMS = [
  { key: 'hepan', label: '合盘', color: '#ec4899' },
  { key: 'fortune', label: '运势', color: '#f59e0b' },
  { key: 'avatar', label: '头像', color: '#8b5cf6' },
  { key: 'lifepath', label: '人生脉络', color: '#14b8a6' },
  { key: 'liuyao', label: '卜卦', color: '#3b82f6' },
] as const

// ─── Traffic Stats Component ───

function TrafficStats() {
  const initialEnd = todayKey()
  const initialStart = shiftDateKey(initialEnd, -29)

  const [startDate, setStartDate] = useState(initialStart)
  const [endDate, setEndDate] = useState(initialEnd)
  const [modelFilter, setModelFilter] = useState<string>('') // '' = 全部模型

  const [stats, setStats] = useState<DailyStat[]>([])
  const [userStats, setUserStats] = useState<UserStat[]>([])
  const [modelStats, setModelStats] = useState<ModelStat[]>([])
  const [featureStats, setFeatureStats] = useState<FeatureStat[]>([])
  const [entryOriginStats, setEntryOriginStats] = useState<EntryOriginStat[]>([])
  const [sessionModeStats, setSessionModeStats] = useState<SessionModeStat[]>([])
  const [featureDailyStats, setFeatureDailyStats] = useState<FeatureDailyStat[]>([])
  const [referralFunnel, setReferralFunnel] = useState<ReferralFunnelData>(EMPTY_REFERRAL_FUNNEL)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [appliedRange, setAppliedRange] = useState<StatsRange | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async (
    start: string, end: string, model: string,
  ) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ start_date: start, end_date: end })
      if (model) params.set('model', model)
      const res = await fetch(`/api/admin/stats?${params.toString()}`)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || '获取统计数据失败')
        return
      }
      const data = await res.json()
      setStats(data.stats || [])
      setUserStats(data.userStats || [])
      setModelStats(data.modelStats || [])
      setFeatureStats(data.featureStats || [])
      setEntryOriginStats(data.entryOriginStats || [])
      setSessionModeStats(data.sessionModeStats || [])
      setFeatureDailyStats(data.featureDailyStats || [])
      setReferralFunnel(data.referralFunnel || EMPTY_REFERRAL_FUNNEL)
      setAvailableModels(data.availableModels || [])
      setAppliedRange(data.range || null)
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats(startDate, endDate, modelFilter)
  }, [startDate, endDate, modelFilter, fetchStats])

  // Quick-pick range buttons (relative to "today" in UTC).
  const applyQuickRange = (mode: 'today' | 'd7' | 'd14' | 'd30') => {
    const end = todayKey()
    if (mode === 'today') {
      setStartDate(end)
      setEndDate(end)
      return
    }
    const offset = mode === 'd7' ? 6 : mode === 'd14' ? 13 : 29
    setStartDate(shiftDateKey(end, -offset))
    setEndDate(end)
  }

  const dayCount = useMemo(
    () => rangeDayCount(startDate, endDate),
    [startDate, endDate],
  )

  const summary = useMemo(() => {
    let total = 0, free = 0, paid = 0
    let totalTokens = 0, inputTokens = 0, outputTokens = 0, llmCalls = 0
    for (const s of stats) {
      total += s.total
      free += s.free
      paid += s.paid
      totalTokens += s.total_tokens || 0
      inputTokens += s.input_tokens || 0
      outputTokens += s.output_tokens || 0
      llmCalls += s.llm_calls || 0
    }
    return { total, free, paid, totalTokens, inputTokens, outputTokens, llmCalls }
  }, [stats])

  const featureSummary = useMemo(() => {
    let selections = 0
    let actualUses = 0
    let pageUses = 0
    let agentUses = 0
    let featureTokens = 0
    for (const item of featureStats) {
      selections += item.selections || 0
      actualUses += item.actual_uses || 0
      pageUses += item.page_uses || 0
      agentUses += item.agent_uses || 0
      featureTokens += item.total_tokens || 0
    }
    const topFeature = featureStats[0] || null
    return {
      selections,
      actualUses,
      pageUses,
      agentUses,
      featureTokens,
      topFeature,
    }
  }, [featureStats])

  const chartData = useMemo(() =>
    stats.map(s => ({
      ...s,
      label: s.date.slice(5), // MM-DD
    })),
  [stats])

  const isSingleDay = startDate === endDate
  const rangeLabel = isSingleDay ? startDate : `${startDate} ~ ${endDate}`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-light text-foreground">流量统计</h2>
          <p className="text-sm font-light text-muted-foreground mt-1">
            按日期与模型查看用户对话次数与 Token 消耗
          </p>
        </div>
        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-0.5">
          {([
            { key: 'today' as const, label: '今日' },
            { key: 'd7' as const, label: '7天' },
            { key: 'd14' as const, label: '14天' },
            { key: 'd30' as const, label: '30天' },
          ]).map(opt => {
            const todayStr = todayKey()
            const isActive =
              (opt.key === 'today' && startDate === todayStr && endDate === todayStr) ||
              (opt.key === 'd7' && startDate === shiftDateKey(todayStr, -6) && endDate === todayStr) ||
              (opt.key === 'd14' && startDate === shiftDateKey(todayStr, -13) && endDate === todayStr) ||
              (opt.key === 'd30' && startDate === shiftDateKey(todayStr, -29) && endDate === todayStr)
            return (
              <button
                key={opt.key}
                onClick={() => applyQuickRange(opt.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-light transition-all duration-200 ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-light text-muted-foreground">时间范围</span>
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={e => setStartDate(e.target.value || startDate)}
            className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-primary/60"
          />
          <span className="text-muted-foreground/60 text-xs">至</span>
          <input
            type="date"
            value={endDate}
            min={startDate}
            max={todayKey()}
            onChange={e => setEndDate(e.target.value || endDate)}
            className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-primary/60"
          />
          <button
            onClick={() => { setStartDate(endDate) }}
            className="h-8 px-2 rounded-lg border border-border text-[11px] font-light text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            title="将开始日期对齐到结束日期，仅查询当天"
          >
            仅当天
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-light text-muted-foreground">模型</span>
          <select
            value={modelFilter}
            onChange={e => setModelFilter(e.target.value)}
            className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-primary/60 max-w-[260px]"
          >
            <option value="">全部模型</option>
            {availableModels.map(m => (
              <option key={m} value={m}>{modelDisplayName(m)}</option>
            ))}
          </select>
          {modelFilter && (
            <button
              onClick={() => setModelFilter('')}
              className="h-8 px-2 rounded-lg border border-border text-[11px] font-light text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              清除
            </button>
          )}
        </div>

        <button
          onClick={() => fetchStats(startDate, endDate, modelFilter)}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 h-8 px-3 rounded-lg bg-card border border-border text-xs font-light text-foreground hover:bg-muted transition-all duration-150 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 text-sm text-destructive font-light">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {([
          { label: '总对话', value: summary.total.toLocaleString(), color: 'text-foreground', sub: `免费 ${summary.free} · 苹果 ${summary.paid}` },
          { label: 'LLM 调用', value: summary.llmCalls.toLocaleString(), color: 'text-blue-500', sub: modelFilter ? modelDisplayName(modelFilter) : '全部模型' },
          { label: 'Token 总消耗', value: summary.totalTokens.toLocaleString(), color: 'text-emerald-500', sub: `输入 ${summary.inputTokens.toLocaleString()} · 输出 ${summary.outputTokens.toLocaleString()}` },
          { label: '模型种类', value: modelStats.length.toLocaleString(), color: 'text-amber-500', sub: `${dayCount} 天 · ${rangeLabel}` },
        ] as const).map(card => (
          <div
            key={card.label}
            className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl px-5 py-4"
          >
            <p className="text-xs font-light text-muted-foreground">{card.label}</p>
            <p className={`text-2xl font-light mt-1 ${card.color}`}>
              {loading ? '...' : card.value}
            </p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Referral Growth Funnel */}
      <section className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-medium text-foreground">推广码拉新漏斗</h3>
            </div>
            <p className="mt-1 text-xs font-light text-muted-foreground">首次点击 → 游客试用 → 注册 → 首个完整回答 → 邀请人奖励</p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            点击转注册 {referralFunnel.summary.clicks > 0 ? `${Math.round(referralFunnel.summary.registered / referralFunnel.summary.clicks * 100)}%` : '-'}
            {' · '}注册转激活 {referralFunnel.summary.registered > 0 ? `${Math.round(referralFunnel.summary.activated / referralFunnel.summary.registered * 100)}%` : '-'}
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {([
            ['点击', referralFunnel.summary.clicks],
            ['开始试用', referralFunnel.summary.trial_started],
            ['完成试用', referralFunnel.summary.trial_completed],
            ['注册', referralFunnel.summary.registered],
            ['激活', referralFunnel.summary.activated],
            ['待奖励', referralFunnel.summary.pending],
            ['已奖励', referralFunnel.summary.rewarded],
          ] as const).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border/70 bg-background/35 px-3 py-3 text-center">
              <p className="text-[10px] text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-light text-foreground">{loading ? '...' : value.toLocaleString()}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,1fr)]">
          <div className="min-h-[260px] rounded-xl border border-border/70 bg-background/25 p-3">
            {referralFunnel.daily.length === 0 ? (
              <div className="flex h-[230px] items-center justify-center text-sm text-muted-foreground">暂无推广数据</div>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={referralFunnel.daily} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" tickFormatter={(value) => String(value).slice(5)} tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="clicks" name="点击" fill="#ec4899" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="registered" name="注册" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="activated" name="激活" fill="#14b8a6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full min-w-[620px] text-left">
              <thead className="bg-muted/35 text-[10px] uppercase text-muted-foreground">
                <tr><th className="px-3 py-2">推广人 / 码</th><th className="px-3 py-2 text-center">点击</th><th className="px-3 py-2 text-center">试用完成</th><th className="px-3 py-2 text-center">注册</th><th className="px-3 py-2 text-center">激活</th><th className="px-3 py-2 text-center">奖励</th></tr>
              </thead>
              <tbody>
                {referralFunnel.byReferrer.slice(0, 20).map(row => (
                  <tr key={`${row.referrer_user_id}:${row.referral_code}`} className="border-t border-border/60 text-xs">
                    <td className="px-3 py-2"><p className="max-w-44 truncate text-foreground">{row.referrer_email}</p><p className="font-mono text-[10px] text-muted-foreground">{row.referral_code}</p></td>
                    <td className="px-3 py-2 text-center">{row.clicks}</td><td className="px-3 py-2 text-center">{row.trial_completed}</td><td className="px-3 py-2 text-center">{row.registered}</td><td className="px-3 py-2 text-center">{row.activated}</td><td className="px-3 py-2 text-center">{row.rewarded}</td>
                  </tr>
                ))}
                {referralFunnel.byReferrer.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-xs text-muted-foreground">暂无推广人数据</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Feature Entry Analytics */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <MousePointerClick className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium text-foreground">功能入口选择趋势</h3>
              </div>
              <p className="mt-1 text-xs font-light text-muted-foreground">
                统计用户点击功能入口的次数；入口选择从本版本打点上线后开始累计
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-right sm:grid-cols-4">
              {([
                { label: '入口选择', value: featureSummary.selections.toLocaleString(), tone: 'text-primary' },
                { label: '实际分析', value: featureSummary.actualUses.toLocaleString(), tone: 'text-foreground' },
                { label: '功能页', value: featureSummary.pageUses.toLocaleString(), tone: 'text-amber-500' },
                { label: 'Agent 调用', value: featureSummary.agentUses.toLocaleString(), tone: 'text-blue-500' },
              ] as const).map(item => (
                <div key={item.label} className="rounded-xl border border-border/70 bg-background/35 px-3 py-2">
                  <p className="text-[10px] font-light text-muted-foreground">{item.label}</p>
                  <p className={`text-base font-light ${item.tone}`}>{loading ? '...' : item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex h-64 items-center justify-center text-sm font-light text-muted-foreground">
              加载中...
            </div>
          ) : featureDailyStats.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm font-light text-muted-foreground">
              暂无入口选择数据
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={featureDailyStats} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                  labelFormatter={(v) => `日期: ${v}`}
                  formatter={(value: number, name: string) => [
                    Number(value).toLocaleString(),
                    name,
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 300 }} />
                {FEATURE_CHART_ITEMS.map(item => (
                  <Bar
                    key={item.key}
                    dataKey={item.key}
                    name={item.label}
                    stackId="feature-entry"
                    fill={item.color}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <div className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl p-5">
            <div className="mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-medium text-foreground">入口来源</h3>
            </div>
            <div className="space-y-2">
              {loading ? (
                <p className="py-8 text-center text-sm font-light text-muted-foreground">加载中...</p>
              ) : entryOriginStats.length === 0 ? (
                <p className="py-8 text-center text-sm font-light text-muted-foreground">暂无入口选择数据</p>
              ) : (
                entryOriginStats.map(item => {
                  const ratio = featureSummary.selections > 0 ? item.selections / featureSummary.selections : 0
                  return (
                    <div key={item.origin} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-light text-foreground">{item.label}</span>
                        <span className="text-xs font-light text-muted-foreground">
                          {item.selections.toLocaleString()} 次 · {item.users} 人
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(ratio * 100).toFixed(1)}%` }} />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl p-5">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-medium text-foreground">会话入口</h3>
            </div>
            <div className="space-y-2">
              {loading ? (
                <p className="py-8 text-center text-sm font-light text-muted-foreground">加载中...</p>
              ) : sessionModeStats.length === 0 ? (
                <p className="py-8 text-center text-sm font-light text-muted-foreground">暂无会话数据</p>
              ) : (
                sessionModeStats.map(item => {
                  const ratio = summary.total > 0 ? item.sessions / summary.total : 0
                  return (
                    <div key={item.mode} className="rounded-xl border border-border/70 bg-background/35 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-light text-foreground">{item.label}</span>
                        <span className="text-sm font-light text-foreground">{item.sessions.toLocaleString()}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                        <span>{item.users} 位用户</span>
                        <span>{(ratio * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Feature Ranking */}
      <div className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">功能入口与使用排行</h3>
            <p className="text-xs font-light text-muted-foreground mt-0.5">
              对比入口选择、实际分析、功能页/Agent 调用来源和 Token 消耗
              {modelFilter ? ` · 实际分析已按模型 ${modelDisplayName(modelFilter)} 过滤，入口选择不受模型过滤影响` : ''}
            </p>
          </div>
          <span className="text-[11px] font-light text-muted-foreground/70">
            热门：{featureSummary.topFeature?.label || '-'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">功能</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">入口选择</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">选择用户</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">实际分析</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">功能页 / Agent</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">完成 / 异常</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">Token</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground font-light">
                    加载中...
                  </td>
                </tr>
              ) : featureStats.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground font-light">
                    当前范围内暂无功能入口或功能分析数据
                  </td>
                </tr>
              ) : (
                featureStats.map(item => {
                  const abnormal = (item.failed || 0) + (item.empty || 0) + (item.aborted || 0)
                  return (
                    <tr key={item.kind} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <span className="text-sm font-light text-foreground">{item.label}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-sm font-medium text-primary">{item.selections.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-sm font-light text-muted-foreground">{item.entry_users.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-sm font-light text-foreground">{item.actual_uses.toLocaleString()}</span>
                        <span className="ml-1 text-[11px] text-muted-foreground">/ {item.actual_users} 人</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-xs font-light text-amber-500">{item.page_uses.toLocaleString()}</span>
                        <span className="text-xs font-light text-muted-foreground/60"> / </span>
                        <span className="text-xs font-light text-blue-500">{item.agent_uses.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-xs font-light text-emerald-500">{item.completed.toLocaleString()}</span>
                        <span className="text-xs font-light text-muted-foreground/60"> / </span>
                        <span className="text-xs font-light text-destructive">{abnormal.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-sm font-light text-emerald-500">{item.total_tokens.toLocaleString()}</span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-medium text-foreground">每日趋势</h3>
            <p className="text-xs font-light text-muted-foreground mt-0.5">
              对话数量（柱状）+ Token 消耗（折线，右轴）
              {modelFilter ? ` · 已筛选: ${modelDisplayName(modelFilter)}` : ''}
            </p>
          </div>
          <span className="text-[11px] font-light text-muted-foreground/70">{rangeLabel}</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-64 text-sm text-muted-foreground font-light">
            加载中...
          </div>
        ) : stats.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-sm text-muted-foreground font-light">
            暂无数据
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="left"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                }
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  fontSize: '12px',
                }}
                labelFormatter={(v) => `日期: ${v}`}
                formatter={(value: number, name: string) => [
                  Number(value).toLocaleString(),
                  name,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 300 }} />
              <Bar yAxisId="left" dataKey="free" name="免费体验" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="left" dataKey="paid" name="苹果用户" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="total_tokens"
                name="Token"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 2.5 }}
                activeDot={{ r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Model Breakdown */}
      <div className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">模型用量明细</h3>
            <p className="text-xs font-light text-muted-foreground mt-0.5">
              按模型统计调用次数与 Token 消耗 · 点击模型可一键过滤
            </p>
          </div>
          <span className="text-[11px] font-light text-muted-foreground/70">
            共 {modelStats.length} 个模型
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">模型</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">类别</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">调用</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">完成 / 失败</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">输入 Token</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">输出 Token</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">总 Token</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">占比</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground font-light">
                    加载中...
                  </td>
                </tr>
              ) : modelStats.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground font-light">
                    当前范围内暂无模型调用记录
                  </td>
                </tr>
              ) : (
                modelStats.map((m, idx) => {
                  const tokenSum = modelStats.reduce((acc, x) => acc + x.total_tokens, 0)
                  const ratio = tokenSum > 0 ? m.total_tokens / tokenSum : 0
                  const color = MODEL_PALETTE[idx % MODEL_PALETTE.length]
                  const selected = modelFilter === m.model
                  return (
                    <tr
                      key={m.model}
                      className={`border-b border-border/50 transition-colors cursor-pointer ${
                        selected ? 'bg-primary/5' : 'hover:bg-muted/20'
                      }`}
                      onClick={() => setModelFilter(selected ? '' : m.model)}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-sm font-light text-foreground truncate max-w-[260px]" title={m.model}>
                            {modelDisplayName(m.model)}
                          </span>
                          {selected && (
                            <span className="text-[10px] text-primary font-medium">已筛选</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-light text-muted-foreground">
                          {modelCategoryLabel(m.model)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-sm font-light text-foreground">{m.calls.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-xs font-light text-emerald-500">{m.completed}</span>
                        <span className="text-xs font-light text-muted-foreground/60"> / </span>
                        <span className="text-xs font-light text-destructive">{m.failed}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-sm font-light text-blue-500">{m.input_tokens.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-sm font-light text-amber-500">{m.output_tokens.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-sm font-medium text-emerald-500">{m.total_tokens.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${(ratio * 100).toFixed(1)}%`,
                                backgroundColor: color,
                              }}
                            />
                          </div>
                          <span className="text-[11px] font-light text-muted-foreground tabular-nums w-10 text-right">
                            {(ratio * 100).toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Breakdown Table */}
      <div className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30">
          <h3 className="text-sm font-medium text-foreground">用户对话排行</h3>
          <p className="text-xs font-light text-muted-foreground mt-0.5">
            范围内各用户的对话次数与 Token 消耗
            {modelFilter ? ` · Token 列已按模型 ${modelDisplayName(modelFilter)} 过滤` : ''}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">排名</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">用户</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">类型</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">总对话</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">免费</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">苹果</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">LLM 调用</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">Token</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground font-light">
                    加载中...
                  </td>
                </tr>
              ) : userStats.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground font-light">
                    暂无数据
                  </td>
                </tr>
              ) : (
                userStats.map((u, idx) => (
                  <tr key={u.user_id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium ${idx < 3 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                        {idx + 1}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-sm font-light text-foreground">{u.email}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-light ${
                        u.is_paid
                          ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                          : 'bg-blue-500/15 text-blue-500 border border-blue-500/30'
                      }`}>
                        {u.is_paid ? '苹果' : '免费'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-sm font-light text-foreground">{u.total}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-sm font-light text-blue-500">{u.free}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-sm font-light text-amber-500">{u.paid}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-sm font-light text-muted-foreground">{(u.llm_calls || 0).toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-sm font-light text-emerald-500">{(u.total_tokens || 0).toLocaleString()}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <p className="text-xs font-light text-muted-foreground/50 text-center">
        统计范围：{rangeLabel}（{dayCount} 天）· 共 {summary.total} 次对话（免费 {summary.free} / 苹果 {summary.paid}）·
        LLM 调用 {summary.llmCalls.toLocaleString()} 次 · Token {summary.totalTokens.toLocaleString()}
        （输入 {summary.inputTokens.toLocaleString()} / 输出 {summary.outputTokens.toLocaleString()}）·
        {userStats.length} 位活跃用户 · {modelStats.length} 个模型
        {appliedRange && appliedRange.start_date !== startDate ? ' · 已被服务端调整' : ''}
      </p>
    </div>
  )
}

// ─── Redemption Codes Component ───

function RedemptionCodesAdmin() {
  const [codes, setCodes] = useState<RedemptionCodeRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rowSaving, setRowSaving] = useState<Record<string, boolean>>({})
  const [codeEdits, setCodeEdits] = useState<Record<string, RedemptionCodeEdits>>({})
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [form, setForm] = useState({
    code: '',
    description: '',
    kind: 'membership_days' as RedemptionCodeRow['kind'],
    membership_days: '7',
    membership_tier: 'plus' as 'plus' | 'ultra',
    bonus_apple_limit: '0',
    bonus_days: '0',
    apple_amount: '0',
    apple_expiry_days: '90',
    max_redemptions: '',
    starts_at: '',
    expires_at: '',
    is_active: true,
  })

  const fetchCodes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/redemption-codes')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || '获取兑换码失败')
        return
      }
      setCodes(data.codes || [])
      setCodeEdits({})
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCodes()
  }, [fetchCodes])

  const createCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const payload = {
        ...form,
        membership_days: Number(form.membership_days || 0),
        membership_tier: form.membership_tier,
        bonus_apple_limit: Number(form.bonus_apple_limit || 0),
        bonus_days: Number(form.bonus_days || 0),
        apple_amount: Number(form.apple_amount || 0),
        apple_expiry_days: Number(form.apple_expiry_days || 90),
        max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : null,
        starts_at: form.starts_at || null,
        expires_at: form.expires_at || null,
        is_active: form.is_active,
      }
      const res = await fetch('/api/admin/redemption-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || '创建兑换码失败')
        return
      }
      setSuccess(`已创建兑换码 ${data.code?.code || ''}`)
      setForm(prev => ({ ...prev, code: '', description: '' }))
      fetchCodes()
    } catch {
      setError('网络错误')
    } finally {
      setSaving(false)
    }
  }

  const handleKindChange = (kind: RedemptionCodeRow['kind']) => {
    setForm(prev => ({
      ...prev,
      kind,
      membership_days: kind === 'bonus_quota' || kind === 'apple_wallet' ? '0' : prev.membership_days || '7',
      bonus_apple_limit: kind === 'membership_days' || kind === 'apple_wallet' ? '0' : prev.bonus_apple_limit || '10',
      bonus_days: kind === 'membership_days' || kind === 'apple_wallet' ? '0' : prev.bonus_days || '7',
      apple_amount: kind === 'apple_wallet' ? prev.apple_amount || '10' : '0',
    }))
  }

  const setCodeEdit = (code: string, edit: RedemptionCodeEdits) => {
    setCodeEdits(prev => ({
      ...prev,
      [code]: {
        ...prev[code],
        ...edit,
      },
    }))
  }

  const patchCode = async (code: RedemptionCodeRow, extra: Record<string, unknown> = {}) => {
    const edits = codeEdits[code.code] || {}
    const payload: Record<string, unknown> = { code: code.code, ...extra }
    if ('description' in edits) payload.description = edits.description || null
    if ('max_redemptions' in edits) payload.max_redemptions = edits.max_redemptions ? Number(edits.max_redemptions) : null
    if ('starts_at' in edits) payload.starts_at = edits.starts_at || null
    if ('expires_at' in edits) payload.expires_at = edits.expires_at || null

    setRowSaving(prev => ({ ...prev, [code.code]: true }))
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/admin/redemption-codes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || '更新兑换码失败')
        return
      }
      setCodes(prev => prev.map(item => item.code === code.code ? data.code : item))
      setCodeEdits(prev => {
        const next = { ...prev }
        delete next[code.code]
        return next
      })
      setSuccess(`已更新 ${code.code}`)
      setTimeout(() => setSuccess(null), 1600)
    } catch {
      setError('网络错误')
    } finally {
      setRowSaving(prev => ({ ...prev, [code.code]: false }))
    }
  }

  const toggleActive = async (code: RedemptionCodeRow) => {
    await patchCode(code, { is_active: !code.is_active })
  }

  const copyCode = async (code: string) => {
    await navigator.clipboard?.writeText(code)
    setSuccess(`已复制 ${code}`)
    setTimeout(() => setSuccess(null), 1600)
  }

  const kindLabel = (kind: RedemptionCodeRow['kind']) => {
    if (kind === 'bonus_quota') return '额外额度'
    if (kind === 'combo') return '会员+额度'
    if (kind === 'apple_wallet') return '一次性苹果'
    return '会员天数'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-light text-foreground">兑换码管理</h2>
          <p className="text-sm font-light text-muted-foreground mt-1">
            后台生成推广兑换码，和用户推荐码分开管理
          </p>
        </div>
        <button
          onClick={fetchCodes}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card border border-border text-sm font-light text-foreground hover:bg-muted transition-all duration-150 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 text-sm text-destructive font-light">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 text-sm text-primary font-light">
          {success}
        </div>
      )}

      <form onSubmit={createCode} className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl p-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        <input
          value={form.code}
          onChange={e => setForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
          placeholder="兑换码（留空自动生成）"
          className="md:col-span-2 h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary/60"
        />
        <input
          value={form.description}
          onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
          placeholder="用途说明"
          className="md:col-span-2 h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary/60"
        />
        <select
          value={form.kind}
          onChange={e => handleKindChange(e.target.value as RedemptionCodeRow['kind'])}
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary/60"
        >
          <option value="membership_days">会员天数</option>
          <option value="bonus_quota">额外额度</option>
          <option value="combo">会员+额度</option>
          <option value="apple_wallet">一次性苹果</option>
        </select>
        <button
          type="submit"
          disabled={saving}
          className="h-10 rounded-lg bg-primary px-4 text-sm font-light text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving ? '生成中...' : '生成'}
        </button>

        <input
          type="number"
          min={0}
          value={form.membership_days}
          onChange={e => setForm(prev => ({ ...prev, membership_days: e.target.value }))}
          placeholder="会员天数"
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary/60"
        />
        <select
          value={form.membership_tier}
          onChange={e => setForm(prev => ({ ...prev, membership_tier: e.target.value as 'plus' | 'ultra' }))}
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary/60"
          title="会员档位"
        >
          <option value="plus">Plus 权益</option>
          <option value="ultra">Ultra 权益</option>
        </select>
        <input
          type="number"
          min={0}
          value={form.bonus_apple_limit}
          onChange={e => setForm(prev => ({ ...prev, bonus_apple_limit: e.target.value }))}
          placeholder="额外每日额度"
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary/60"
        />
        <input
          type="number"
          min={0}
          value={form.bonus_days}
          onChange={e => setForm(prev => ({ ...prev, bonus_days: e.target.value }))}
          placeholder="额外额度天数"
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary/60"
        />
        <input
          type="number"
          min={0}
          value={form.apple_amount}
          onChange={e => setForm(prev => ({ ...prev, apple_amount: e.target.value }))}
          placeholder="一次性苹果数量"
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary/60"
        />
        <input
          type="number"
          min={1}
          value={form.apple_expiry_days}
          onChange={e => setForm(prev => ({ ...prev, apple_expiry_days: e.target.value }))}
          placeholder="苹果有效天数"
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary/60"
        />
        <input
          type="number"
          min={1}
          value={form.max_redemptions}
          onChange={e => setForm(prev => ({ ...prev, max_redemptions: e.target.value }))}
          placeholder="使用上限"
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary/60"
        />
        <input
          type="date"
          value={form.starts_at}
          onChange={e => setForm(prev => ({ ...prev, starts_at: e.target.value }))}
          title="开始日期"
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary/60"
        />
        <input
          type="date"
          value={form.expires_at}
          onChange={e => setForm(prev => ({ ...prev, expires_at: e.target.value }))}
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary/60"
        />
        <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-light text-muted-foreground">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={e => setForm(prev => ({ ...prev, is_active: e.target.checked }))}
            className="h-4 w-4"
          />
          立即启用
        </label>
        <p className="md:col-span-6 text-[11px] leading-5 font-light text-muted-foreground">
          会员可选择 Plus/Ultra；一次性苹果独立入钱包，默认 90 天有效。
        </p>
      </form>

      <div className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">兑换码</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">类型</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">权益</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">已用 / 上限</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">有效期</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">状态</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && codes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground font-light">
                    加载中...
                  </td>
                </tr>
              ) : codes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground font-light">
                    暂无兑换码
                  </td>
                </tr>
              ) : (
                codes.map(code => {
                  const edits = codeEdits[code.code] || {}
                  const hasEdits = Object.keys(edits).length > 0
                  const maxRedemptionsValue =
                    'max_redemptions' in edits
                      ? edits.max_redemptions || ''
                      : code.max_redemptions?.toString() || ''
                  const startsAtValue =
                    'starts_at' in edits
                      ? edits.starts_at || ''
                      : dateInputValue(code.starts_at)
                  const expiresAtValue =
                    'expires_at' in edits
                      ? edits.expires_at || ''
                      : dateInputValue(code.expires_at)
                  const descriptionValue =
                    'description' in edits
                      ? edits.description || ''
                      : code.description || ''

                  return (
                    <tr key={code.code} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <code className="text-sm text-foreground">{code.code}</code>
                          <button
                            onClick={() => copyCode(code.code)}
                            className="text-muted-foreground hover:text-foreground"
                            title="复制兑换码"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <input
                          value={descriptionValue}
                          onChange={e => setCodeEdit(code.code, { description: e.target.value })}
                          placeholder="用途说明"
                          className="mt-1 w-44 rounded-lg border border-border/50 bg-transparent px-2 py-1 text-[11px] text-muted-foreground outline-none focus:border-primary/60"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm font-light text-muted-foreground">
                        {kindLabel(code.kind)}
                      </td>
                      <td className="px-4 py-3 text-center text-xs font-light text-muted-foreground">
                        {code.membership_days > 0 ? `${code.membership_tier === 'ultra' ? 'Ultra' : 'Plus'} ${code.membership_days} 天` : '无会员'}
                        {' · '}{code.apple_amount > 0 ? `钱包 ${code.apple_amount} 个 / ${code.apple_expiry_days} 天` : `每日加额 ${code.bonus_apple_limit} × ${code.bonus_days} 天`}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-sm font-light text-foreground">{code.redeemed_count}</span>
                          <input
                            type="number"
                            min={1}
                            value={maxRedemptionsValue}
                            onChange={e => setCodeEdit(code.code, { max_redemptions: e.target.value })}
                            placeholder="不限"
                            className="w-20 rounded-lg border border-border/50 bg-transparent px-2 py-1 text-center text-xs text-muted-foreground outline-none focus:border-primary/60"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <input
                            type="date"
                            value={startsAtValue}
                            onChange={e => setCodeEdit(code.code, { starts_at: e.target.value })}
                            className="w-32 rounded-lg border border-border/50 bg-transparent px-2 py-1 text-center text-[11px] text-muted-foreground outline-none focus:border-primary/60"
                            title="开始日期"
                          />
                          <input
                            type="date"
                            value={expiresAtValue}
                            onChange={e => setCodeEdit(code.code, { expires_at: e.target.value })}
                            className="w-32 rounded-lg border border-border/50 bg-transparent px-2 py-1 text-center text-[11px] text-muted-foreground outline-none focus:border-primary/60"
                            title="过期日期，留空为不限"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-light border ${
                          code.is_active
                            ? 'bg-primary/10 text-primary border-primary/25'
                            : 'bg-muted text-muted-foreground border-border'
                        }`}>
                          {code.is_active ? '启用' : '停用'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <button
                            onClick={() => toggleActive(code)}
                            disabled={rowSaving[code.code]}
                            className="px-3 py-1 rounded-lg border border-border bg-card text-xs font-light text-foreground hover:bg-muted disabled:opacity-50"
                          >
                            {code.is_active ? '停用' : '启用'}
                          </button>
                          <button
                            onClick={() => patchCode(code)}
                            disabled={!hasEdits || rowSaving[code.code]}
                            className={`px-3 py-1 rounded-lg text-xs font-light transition-colors ${
                              hasEdits
                                ? 'bg-primary text-primary-foreground hover:opacity-90'
                                : 'bg-muted text-muted-foreground/40 cursor-not-allowed'
                            }`}
                          >
                            {rowSaving[code.code] ? '保存中...' : '保存'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Main Admin Page ───

export default function AdminPage() {
  const { user } = useAuth()
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('quotas')
  const [users, setUsers] = useState<UserQuotaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [edits, setEdits] = useState<Record<string, RowEdits>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saveSuccess, setSaveSuccess] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/quotas')
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || '获取数据失败')
        return
      }
      const data = await res.json()
      setUsers(data.users || [])
      setEdits({})
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user && isAdmin(user.email)) {
      fetchUsers()
    }
  }, [user, fetchUsers])

  const handleTierChange = (userId: string, tier: 'free' | 'plus' | 'ultra', currentExpiry: string | null) => {
    const defaultExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const currentExpiryTime = currentExpiry ? new Date(currentExpiry).getTime() : Number.NaN
    const nextExpiry = Number.isFinite(currentExpiryTime) && currentExpiryTime > Date.now()
      ? currentExpiry
      : defaultExpiry
    setRowEdit(userId, {
      membership_tier: tier,
      is_paid: tier !== 'free',
      daily_apple_limit: tier === 'plus' ? 30 : 5,
      membership_expires_at: tier === 'free' ? null : nextExpiry,
    })
  }

  const handleLimitChange = (userId: string, value: string) => {
    const num = parseInt(value)
    if (isNaN(num) || num < 0) return
    setEdits(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        daily_apple_limit: num,
      }
    }))
  }

  const setRowEdit = (userId: string, rowEdits: RowEdits) => {
    setEdits(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        ...rowEdits,
      }
    }))
  }

  const handleMembershipDateChange = (userId: string, value: string, tier: 'free' | 'plus' | 'ultra') => {
    const nextTier = value ? (tier === 'ultra' ? 'ultra' : 'plus') : 'free'
    setRowEdit(userId, {
      membership_expires_at: value || null,
      is_paid: !!value,
      membership_tier: nextTier,
      daily_apple_limit: nextTier === 'plus' ? 30 : 5,
    })
  }

  const handleBonusLimitChange = (userId: string, value: string) => {
    const num = parseInt(value)
    if (isNaN(num) || num < 0) return
    setRowEdit(userId, { bonus_apple_limit: num })
  }

  const handleBonusDateChange = (userId: string, value: string) => {
    setRowEdit(userId, { bonus_expires_at: value || null })
  }

  const handleReferralCodeChange = (userId: string, value: string) => {
    setRowEdit(userId, { referral_code: value.toUpperCase().replace(/[^A-Z0-9]/g, '') })
  }

  const copyToClipboard = async (text: string) => {
    if (!text) return
    await navigator.clipboard?.writeText(text)
  }

  const handleSave = async (userId: string) => {
    const rowEdits = edits[userId]
    if (!rowEdits) return

    setSaving(prev => ({ ...prev, [userId]: true }))
    setSaveSuccess(prev => ({ ...prev, [userId]: false }))

    try {
      const res = await fetch('/api/admin/quotas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, ...rowEdits }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(`卜卜象没能保存这次调整：${data.error || '原因还没露面'}`)
        return
      }

      const data = await res.json()
      const savedQuota = data.quota as Partial<UserQuotaRow> | undefined

      // Update local state
      setUsers(prev => prev.map(u => {
        if (u.user_id === userId) {
          return {
            ...u,
            is_paid: savedQuota?.is_paid ?? rowEdits.is_paid ?? u.is_paid,
            membership_tier: savedQuota?.membership_tier ?? rowEdits.membership_tier ?? u.membership_tier,
            daily_apple_limit: savedQuota?.daily_apple_limit ?? rowEdits.daily_apple_limit ?? u.daily_apple_limit,
            membership_expires_at: savedQuota?.membership_expires_at
              ?? ('membership_expires_at' in rowEdits ? rowEdits.membership_expires_at ?? null : u.membership_expires_at),
            bonus_apple_limit: savedQuota?.bonus_apple_limit ?? rowEdits.bonus_apple_limit ?? u.bonus_apple_limit,
            bonus_expires_at: savedQuota?.bonus_expires_at
              ?? ('bonus_expires_at' in rowEdits ? rowEdits.bonus_expires_at ?? null : u.bonus_expires_at),
            referral_code: rowEdits.referral_code ?? u.referral_code,
            invite_link: rowEdits.referral_code
              ? `${window.location.origin}/invite/${encodeURIComponent(rowEdits.referral_code)}`
              : u.invite_link,
            has_quota_record: true,
          }
        }
        return u
      }))

      // Clear edits for this row
      setEdits(prev => {
        const next = { ...prev }
        delete next[userId]
        return next
      })

      // Show success indicator
      setSaveSuccess(prev => ({ ...prev, [userId]: true }))
      setTimeout(() => {
        setSaveSuccess(prev => ({ ...prev, [userId]: false }))
      }, 2000)
    } catch {
      setError('卜卜象碰到一点网络风浪，稍后再保存一次喔')
    } finally {
      setSaving(prev => ({ ...prev, [userId]: false }))
    }
  }

  // Get the display value (edited or original)
  const getDisplayValue = (user: UserQuotaRow, field: keyof RowEdits) => {
    const rowEdits = edits[user.user_id]
    if (rowEdits && field in rowEdits) {
      return rowEdits[field]
    }
    return user[field]
  }

  // --- Render states ---

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground/40" />
        <p className="text-lg font-light text-muted-foreground">请先登录管理员账号</p>
        <button
          onClick={() => setShowAuthDialog(true)}
          className="px-6 py-2 rounded-full bg-primary text-primary-foreground text-sm font-light hover:opacity-90 transition-all duration-150"
        >
          登录
        </button>
        <AuthDialog isOpen={showAuthDialog} onClose={() => setShowAuthDialog(false)} />
      </div>
    )
  }

  if (!isAdmin(user.email)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <AlertCircle className="w-12 h-12 text-destructive/40" />
        <p className="text-lg font-light text-foreground">无权限访问</p>
        <p className="text-sm font-light text-muted-foreground">
          当前账号 {user.email} 不是管理员
        </p>
        <a
          href="/"
          className="px-6 py-2 rounded-full bg-secondary text-secondary-foreground text-sm font-light hover:bg-secondary/80 transition-all duration-150"
        >
          返回主站
        </a>
      </div>
    )
  }

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'quotas', label: '用户管理', icon: <Users className="w-4 h-4" /> },
    { key: 'codes', label: '兑换码', icon: <Ticket className="w-4 h-4" /> },
    { key: 'stats', label: '流量统计', icon: <BarChart3 className="w-4 h-4" /> },
  ]

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex items-center gap-1 bg-card/70 border border-border rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-light transition-all duration-200 ${
              activeTab === t.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'stats' ? (
        <TrafficStats />
      ) : activeTab === 'codes' ? (
        <RedemptionCodesAdmin />
      ) : (
        <>
          {/* Title bar */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-light text-foreground">配额管理</h2>
              <p className="text-sm font-light text-muted-foreground mt-1">
                管理用户苹果会员周期、推荐码/邀请链接和每日额度
              </p>
            </div>
            <button
              onClick={fetchUsers}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card border border-border text-sm font-light text-foreground hover:bg-muted transition-all duration-150 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 text-sm text-destructive font-light">
              {error}
            </div>
          )}

          {/* Table */}
          <div className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl overflow-hidden glass-minimal">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">邮箱</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">昵称</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">档位</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">会员到期</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">充值余额</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">每日额度</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">活动额外</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">今日已用</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">推荐码 / 链接</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">推荐</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">兑换</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && users.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-12 text-center text-sm text-muted-foreground font-light">
                        加载中...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-12 text-center text-sm text-muted-foreground font-light">
                        暂无用户数据
                      </td>
                    </tr>
                  ) : (
                    users.map(u => {
                      const hasEdits = !!edits[u.user_id]
                      const displayPaid = getDisplayValue(u, 'is_paid') as boolean
                      const displayTier = getDisplayValue(u, 'membership_tier') as 'free' | 'plus' | 'ultra'
                      const displayLimit = getDisplayValue(u, 'daily_apple_limit') as number
                      const displayMembershipExpiresAt = getDisplayValue(u, 'membership_expires_at') as string | null
                      const displayBonusLimit = getDisplayValue(u, 'bonus_apple_limit') as number
                      const displayBonusExpiresAt = getDisplayValue(u, 'bonus_expires_at') as string | null
                      const displayReferralCode = getDisplayValue(u, 'referral_code') as string

                      return (
                        <tr key={u.user_id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <span className="text-sm font-light text-foreground">{u.email}</span>
                            {!u.has_quota_record && (
                              <span className="ml-2 text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">无记录</span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <span className="text-sm font-light text-muted-foreground">{u.display_name || '-'}</span>
                          </td>

                          <td className="px-4 py-3 text-center">
                            <select
                              value={displayTier}
                              onChange={(e) => handleTierChange(u.user_id, e.target.value as 'free' | 'plus' | 'ultra', displayMembershipExpiresAt)}
                              className={`rounded-lg border px-2 py-1 text-xs font-light ${displayPaid ? 'border-accent/30 bg-accent/10 text-foreground' : 'border-border bg-muted text-muted-foreground'}`}
                              aria-label={`${u.email} 的会员档位`}
                            >
                              <option value="free">免费</option>
                              <option value="plus">Plus</option>
                              <option value="ultra">Ultra</option>
                            </select>
                          </td>

                          <td className="px-4 py-3 text-center">
                            <input
                              type="date"
                              value={dateInputValue(displayMembershipExpiresAt)}
                              onChange={(e) => handleMembershipDateChange(u.user_id, e.target.value, displayTier)}
                              className="w-36 text-center text-xs font-light bg-transparent border border-border/50 rounded-lg px-2 py-1 text-foreground focus:outline-none focus:border-primary/60 transition-all"
                            />
                          </td>

                          <td className="px-4 py-3 text-center">
                            <span className="text-sm font-light text-foreground">{u.wallet_balance} 🍎</span>
                          </td>

                          <td className="px-4 py-3 text-center">
                            <input
                              type="number"
                              min={0}
                              value={displayLimit}
                              onChange={(e) => handleLimitChange(u.user_id, e.target.value)}
                              className="w-20 text-center text-sm font-light bg-transparent border border-border/50 rounded-lg px-2 py-1 text-foreground focus:outline-none focus:border-primary/60 transition-all"
                            />
                          </td>

                          <td className="px-4 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                value={displayBonusLimit}
                                onChange={(e) => handleBonusLimitChange(u.user_id, e.target.value)}
                                className="w-20 text-center text-sm font-light bg-transparent border border-border/50 rounded-lg px-2 py-1 text-foreground focus:outline-none focus:border-primary/60 transition-all"
                              />
                              <input
                                type="date"
                                value={dateInputValue(displayBonusExpiresAt)}
                                onChange={(e) => handleBonusDateChange(u.user_id, e.target.value)}
                                className="w-32 text-center text-[11px] font-light bg-transparent border border-border/50 rounded-lg px-2 py-1 text-muted-foreground focus:outline-none focus:border-primary/60 transition-all"
                              />
                            </div>
                          </td>

                          <td className="px-4 py-3 text-center">
                            <span className="text-sm font-light text-muted-foreground">{u.apples_used_today}</span>
                            <p className="text-[10px] text-muted-foreground/60">{u.last_reset_date || '-'}</p>
                          </td>

                          <td className="px-4 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center gap-1">
                                <input
                                  value={displayReferralCode}
                                  onChange={(e) => handleReferralCodeChange(u.user_id, e.target.value)}
                                  className="w-28 text-center text-xs font-light bg-transparent border border-border/50 rounded-lg px-2 py-1 text-foreground focus:outline-none focus:border-primary/60 transition-all"
                                />
                                <button
                                  onClick={() => copyToClipboard(displayReferralCode)}
                                  className="text-muted-foreground hover:text-foreground"
                                  title="复制推荐码"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <button
                                onClick={() => copyToClipboard(u.invite_link)}
                                className="text-[10px] text-muted-foreground hover:text-foreground"
                              >
                                复制邀请链接
                              </button>
                            </div>
                          </td>

                          <td className="px-4 py-3 text-center">
                            <span className="text-sm font-light text-foreground">{u.referral_count}</span>
                            <p className="text-[10px] text-muted-foreground/60">
                              来自 {u.referred_by_email || '-'}
                            </p>
                          </td>

                          <td className="px-4 py-3 text-center">
                            <span className="text-sm font-light text-foreground">{u.redemption_count}</span>
                          </td>

                          <td className="px-4 py-3 text-center">
                            {saveSuccess[u.user_id] ? (
                              <span className="inline-flex items-center gap-1 text-xs text-accent font-light">
                                <Check className="w-3.5 h-3.5" />
                                已保存
                              </span>
                            ) : (
                              <button
                                onClick={() => handleSave(u.user_id)}
                                disabled={!hasEdits || saving[u.user_id]}
                                className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-light transition-all duration-150 ${
                                  hasEdits
                                    ? 'bg-primary text-primary-foreground hover:opacity-90'
                                    : 'bg-muted text-muted-foreground/40 cursor-not-allowed'
                                }`}
                              >
                                <Save className="w-3 h-3" />
                                {saving[u.user_id] ? '保存中...' : '保存'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs font-light text-muted-foreground/50 text-center">
            共 {users.length} 个用户 · 档位选择支持 Plus / Ultra；充值苹果与每日、活动额度分开记账
          </p>
        </>
      )}
    </div>
  )
}
