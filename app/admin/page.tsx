"use client"

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { isAdmin } from '@/lib/admin'
import { AuthDialog } from '@/components/auth-dialog'
import { RefreshCw, Save, Check, AlertCircle, BarChart3, Users, Calendar, Cpu } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Line,
} from 'recharts'

interface UserQuotaRow {
  user_id: string
  email: string
  display_name: string | null
  is_paid: boolean
  daily_apple_limit: number
  apples_used_today: number
  last_reset_date: string | null
  has_quota_record: boolean
}

interface RowEdits {
  is_paid?: boolean
  daily_apple_limit?: number
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

interface StatsRange {
  start_date: string
  end_date: string
}

type TabKey = 'quotas' | 'stats'

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
          className="ml-auto flex items-center gap-1.5 h-8 px-3 rounded-lg bg-card border border-border text-xs font-light text-foreground hover:bg-muted transition-all duration-300 disabled:opacity-50"
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

  const handleTogglePaid = (userId: string, currentValue: boolean) => {
    const newIsPaid = !currentValue
    setEdits(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        is_paid: newIsPaid,
        // Auto-set limit when toggling paid status
        daily_apple_limit: newIsPaid ? 999 : 5,
      }
    }))
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

      // Update local state
      setUsers(prev => prev.map(u => {
        if (u.user_id === userId) {
          return {
            ...u,
            is_paid: rowEdits.is_paid ?? u.is_paid,
            daily_apple_limit: rowEdits.daily_apple_limit ?? u.daily_apple_limit,
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
          className="px-6 py-2 rounded-full bg-primary text-primary-foreground text-sm font-light hover:opacity-90 transition-all duration-300"
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
          className="px-6 py-2 rounded-full bg-secondary text-secondary-foreground text-sm font-light hover:bg-secondary/80 transition-all duration-300"
        >
          返回主站
        </a>
      </div>
    )
  }

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'quotas', label: '配额管理', icon: <Users className="w-4 h-4" /> },
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
      ) : (
        <>
          {/* Title bar */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-light text-foreground">配额管理</h2>
              <p className="text-sm font-light text-muted-foreground mt-1">
                管理用户的苹果配额和付费状态
              </p>
            </div>
            <button
              onClick={fetchUsers}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card border border-border text-sm font-light text-foreground hover:bg-muted transition-all duration-300 disabled:opacity-50"
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
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">付费</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">每日额度</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">今日已用</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">重置日期</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && users.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground font-light">
                        加载中...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground font-light">
                        暂无用户数据
                      </td>
                    </tr>
                  ) : (
                    users.map(u => {
                      const hasEdits = !!edits[u.user_id]
                      const displayPaid = getDisplayValue(u, 'is_paid') as boolean
                      const displayLimit = getDisplayValue(u, 'daily_apple_limit') as number

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
                            <button
                              onClick={() => handleTogglePaid(u.user_id, displayPaid)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-light transition-all duration-300 ${
                                displayPaid
                                  ? 'bg-accent/20 text-accent border border-accent/30'
                                  : 'bg-muted text-muted-foreground border border-border'
                              }`}
                            >
                              {displayPaid ? 'VIP' : '免费'}
                            </button>
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
                            <span className="text-sm font-light text-muted-foreground">{u.apples_used_today}</span>
                          </td>

                          <td className="px-4 py-3 text-center">
                            <span className="text-xs font-light text-muted-foreground">{u.last_reset_date || '-'}</span>
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
                                className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-light transition-all duration-300 ${
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
            共 {users.length} 个用户 · 切换付费状态会自动设置额度（VIP: 999, 免费: 5），也可手动修改
          </p>
        </>
      )}
    </div>
  )
}
