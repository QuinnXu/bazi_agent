"use client"

import React, { useEffect, useState } from 'react'
import { User, Plus, Check } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import type { FeatureParticipant } from '@/lib/feature-types'

interface BaziProfileRow {
  id: string
  profile_name: string
  bazi_result_text: string | null
  bazi_result: {
    fourPillars?: { year: string; month: string; day: string; hour: string }
  } | null
}

function rowToParticipant(row: BaziProfileRow): FeatureParticipant {
  const fp = row.bazi_result?.fourPillars
  const pillars = fp ? `${fp.year} ${fp.month} ${fp.day} ${fp.hour}` : null
  return {
    id: row.id,
    name: row.profile_name,
    pillars,
    baziText: row.bazi_result_text,
  }
}

interface ProfilePickerProps {
  multi?: boolean
  max?: number // max selectable in multi mode
  selectedIds: string[]
  onChange: (selected: FeatureParticipant[]) => void
  onOpenManager: () => void
  emptyHint?: string
}

export function ProfilePicker({
  multi = false,
  max = 4,
  selectedIds,
  onChange,
  onOpenManager,
  emptyHint = '人物册还是空的，先给小象添加一位吧',
}: ProfilePickerProps) {
  const [profiles, setProfiles] = useState<BaziProfileRow[]>([])
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()
  const supabase = createBrowserClient()

  useEffect(() => {
    if (user) loadProfiles()
  }, [user])

  const loadProfiles = async () => {
    if (!user) return
    setLoading(true)
    try {
      // @ts-ignore
      const { data, error } = await supabase
        .from('bazi_profiles')
        .select('id, profile_name, bazi_result_text, bazi_result')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error) {
        if (error.code === 'PGRST116') {
          setProfiles([])
          return
        }
        throw error
      }
      setProfiles((data as BaziProfileRow[]) || [])
    } catch (err) {
      console.error('[ProfilePicker] load failed', err)
      setProfiles([])
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = (row: BaziProfileRow) => {
    if (multi) {
      const isSelected = selectedIds.includes(row.id)
      let next: string[]
      if (isSelected) {
        next = selectedIds.filter(id => id !== row.id)
      } else {
        if (selectedIds.length >= max) return
        next = [...selectedIds, row.id]
      }
      onChange(
        next
          .map(id => profiles.find(p => p.id === id))
          .filter(Boolean)
          .map(p => rowToParticipant(p as BaziProfileRow)),
      )
    } else {
      onChange([rowToParticipant(row)])
    }
  }

  const handleAddNew = () => {
    onOpenManager()
    // Refresh after manager closes (best-effort: caller can also force a re-render)
    setTimeout(() => {
      loadProfiles()
    }, 1000)
  }

  if (!user) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
        登录后，小象才能读取你的人物册
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {loading ? (
        <div className="rounded-xl bg-card/40 border border-border/40 p-4 text-center text-xs text-muted-foreground">
          小象在翻人物册…
        </div>
      ) : profiles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-6 text-center space-y-3">
          <User className="w-10 h-10 text-muted-foreground/50 mx-auto" />
          <p className="text-sm text-muted-foreground">{emptyHint}</p>
          <button
            onClick={handleAddNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-light hover:opacity-90 transition-all"
          >
            <Plus className="w-4 h-4" />
            添加给小象看
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {profiles.map(row => {
              const isSelected = selectedIds.includes(row.id)
              const fp = row.bazi_result?.fourPillars
              return (
                <button
                  key={row.id}
                  onClick={() => handleToggle(row)}
                  className={`text-left rounded-lg border p-3 transition-all ${
                    isSelected
                      ? 'bg-primary/10 border-primary/50 shadow-sm'
                      : 'bg-card/60 border-border/60 hover:bg-card/80 hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {row.profile_name}
                      </p>
                      {fp && (
                        <p className="text-[11px] text-muted-foreground/80 mt-0.5 tracking-wider">
                          {fp.year} {fp.month} {fp.day} {fp.hour}
                        </p>
                      )}
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
          <button
            onClick={handleAddNew}
            className="w-full py-2.5 rounded-lg border border-dashed border-border/60 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            管理 / 新增小象人物册
          </button>
        </>
      )}
    </div>
  )
}
