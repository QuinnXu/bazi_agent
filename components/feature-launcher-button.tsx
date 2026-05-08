"use client"

import React, { useEffect, useState } from 'react'
import {
  Plus,
  Users,
  CalendarRange,
  ImageIcon,
  Compass,
  User,
  Check,
  Settings2,
} from 'lucide-react'
import type { FeatureKind } from '@/lib/feature-types'
import { createBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'

interface LauncherItem {
  id: FeatureKind
  title: string
  cost: number
  icon: React.ElementType
}

const ITEMS: LauncherItem[] = [
  { id: 'hepan', title: '合盘 / 应事', cost: 2, icon: Users },
  { id: 'fortune', title: '近期运势', cost: 1, icon: CalendarRange },
  { id: 'avatar', title: '头像分析推荐', cost: 3, icon: ImageIcon },
  { id: 'lifepath', title: '人生脉络', cost: 2, icon: Compass },
]

interface BaziProfileRow {
  id: string
  profile_name: string
  bazi_result_text: string | null
  bazi_result: {
    fourPillars?: { year: string; month: string; day: string; hour: string }
  } | null
}

interface FeatureLauncherButtonProps {
  disabled?: boolean
  onPick: (kind: FeatureKind) => void
  /**
   * Variant for visual size adjustments. 'sm' for inline-with-input, 'md' for standalone.
   */
  variant?: 'sm' | 'md'
  /**
   * Profile selection (passed through from parent so state is shared with the chat path).
   */
  selectedProfileId?: string | null
  onSelectProfile?: (
    profileId: string | null,
    baziResult: string | null,
    profile?: {
      name: string
      pillars?: string | null
      baziText?: string | null
    } | null,
  ) => void
  onOpenProfilesDialog?: () => void
}

export function FeatureLauncherButton({
  disabled = false,
  onPick,
  variant = 'md',
  selectedProfileId = null,
  onSelectProfile,
  onOpenProfilesDialog,
}: FeatureLauncherButtonProps) {
  const [open, setOpen] = useState(false)
  const [profiles, setProfiles] = useState<BaziProfileRow[]>([])
  const { user } = useAuth()
  const supabase = createBrowserClient()

  // Load profiles when popover opens (so newly created ones show up)
  useEffect(() => {
    if (!open || !user) return
    let cancelled = false
    const loadProfiles = async () => {
      try {
        // @ts-ignore — types are not generated for bazi_profiles
        const { data, error } = await supabase
          .from('bazi_profiles')
          .select('id, profile_name, bazi_result_text, bazi_result')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
        if (cancelled) return
        if (error) {
          if (error.code === 'PGRST116') setProfiles([])
          return
        }
        setProfiles((data as BaziProfileRow[]) || [])
      } catch {
        setProfiles([])
      }
    }
    loadProfiles()
    return () => {
      cancelled = true
    }
  }, [open, user])

  const sizeClass =
    variant === 'sm' ? 'w-8 h-8' : 'w-10 h-10'
  const shapeClass = variant === 'sm' ? 'rounded-full' : 'rounded-lg'

  const selected = profiles.find(p => p.id === selectedProfileId) || null
  const selectedSummary = selected
    ? selected.profile_name
    : profiles.length === 0
    ? '暂无人物'
    : '未选择'

  const handlePickProfile = (row: BaziProfileRow | null) => {
    if (!onSelectProfile) return
    if (row === null) {
      onSelectProfile(null, null, null)
    } else {
      const fp = row.bazi_result?.fourPillars
      const pillars = fp
        ? `${fp.year} ${fp.month} ${fp.day} ${fp.hour}`
        : null
      onSelectProfile(row.id, row.bazi_result_text || null, {
        name: row.profile_name,
        pillars,
        baziText: row.bazi_result_text || null,
      })
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        title="工具与人物"
        className={`${sizeClass} ${shapeClass} border border-border bg-card/80 hover:bg-card transition-all flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        <Plus
          className={`w-4 h-4 transition-transform ${open ? 'rotate-45' : ''}`}
        />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 bottom-full mb-3 w-72 max-w-[calc(100vw-1.5rem)] bg-card border border-border rounded-lg shadow-2xl z-50 overflow-hidden glass-minimal">
            {/* ---------- Section 1: Current bazi subject ---------- */}
            {user && onSelectProfile && (
              <>
                <div className="px-3 pt-2.5 pb-1.5 flex items-center justify-between border-b border-border/40">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
                    当前命主
                  </p>
                  <span className="text-[11px] text-foreground/60 truncate max-w-[8rem]">
                    {selectedSummary}
                  </span>
                </div>
                <div className="py-1.5 max-h-44 overflow-y-auto">
                  {profiles.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground/80 text-center">
                      还没有命主，先添加一位吧~
                    </p>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handlePickProfile(null)}
                        className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-colors ${
                          selectedProfileId === null
                            ? 'bg-muted/60 text-foreground'
                            : 'hover:bg-muted/40 text-muted-foreground'
                        }`}
                      >
                        <div className="w-7 h-7 rounded-md bg-muted/60 flex items-center justify-center flex-shrink-0">
                          <User className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-sm flex-1 truncate">不选择</span>
                        {selectedProfileId === null && (
                          <Check className="w-3.5 h-3.5 text-primary" />
                        )}
                      </button>
                      {profiles.map(row => {
                        const fp = row.bazi_result?.fourPillars
                        const pillars = fp
                          ? `${fp.year} ${fp.month} ${fp.day} ${fp.hour}`
                          : null
                        const isSelected = selectedProfileId === row.id
                        return (
                          <button
                            type="button"
                            key={row.id}
                            onClick={() => handlePickProfile(row)}
                            className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-colors ${
                              isSelected
                                ? 'bg-primary/8 text-foreground'
                                : 'hover:bg-muted/40 text-foreground'
                            }`}
                          >
                            <div
                              className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                                isSelected
                                  ? 'bg-primary/15 text-primary'
                                  : 'bg-muted/60 text-muted-foreground'
                              }`}
                            >
                              <User className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm truncate">
                                {row.profile_name}
                              </p>
                              {pillars && (
                                <p className="text-[10px] text-muted-foreground/70 truncate tracking-wider">
                                  {pillars}
                                </p>
                              )}
                            </div>
                            {isSelected && (
                              <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                            )}
                          </button>
                        )
                      })}
                    </>
                  )}
                </div>
                {onOpenProfilesDialog && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      onOpenProfilesDialog()
                    }}
                    className="w-full px-3 py-2 flex items-center gap-2 text-xs text-primary hover:bg-muted/40 transition-colors border-t border-border/40"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    管理人物档案
                  </button>
                )}
              </>
            )}

            {/* ---------- Section 2: Structured features ---------- */}
            <div className="px-3 pt-2.5 pb-1.5 border-t border-border/40">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
                结构化功能
              </p>
            </div>
            <div className="py-1.5">
              {ITEMS.map(item => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      onPick(item.id)
                    }}
                    className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {item.title}
                      </p>
                    </div>
                    <span className="text-[11px] text-primary/80 bg-primary/10 border border-primary/20 rounded-md px-2 py-0.5 whitespace-nowrap font-light">
                      苹果 ×{item.cost}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
