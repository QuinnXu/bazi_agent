"use client"

import React, { useState, useEffect } from 'react'
import { User, ChevronDown, Plus } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'

interface BaziProfile {
  id: string
  profile_name: string
  bazi_result_text: string | null
}

interface ProfileSelectorProps {
  selectedProfileId: string | null
  onSelectProfile: (profileId: string | null, baziResult: string | null) => void
  onOpenProfilesDialog?: () => void
}

export function ProfileSelector({ selectedProfileId, onSelectProfile, onOpenProfilesDialog }: ProfileSelectorProps) {
  const [profiles, setProfiles] = useState<BaziProfile[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const { user } = useAuth()
  const supabase = createBrowserClient()
  useEffect(() => {
    if (user) {
      loadProfiles()
    }
  }, [user])

  // 当下拉菜单打开时，刷新人物列表
  useEffect(() => {
    if (showDropdown && user) {
      loadProfiles()
    }
  }, [showDropdown])

  const loadProfiles = async () => {
    if (!user) return

    try {      // @ts-ignore - Database types will be generated after schema deployment
      const { data, error } = await supabase
        .from('bazi_profiles')
        .select('id, profile_name, bazi_result_text')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        // 如果是 "没有行返回" 的错误，不算错误，只是没有数据
        if (error.code === 'PGRST116') {
          setProfiles([])
          return
        }
        throw error
      }
      setProfiles(data || [])
    } catch (error) {
      // 静默处理错误，不在控制台显示，因为无人物是正常情况
      setProfiles([])
    }
  }

  const selectedProfile = profiles.find(p => p.id === selectedProfileId)
  const handleSelect = (profileId: string | null) => {
    if (profileId === null) {
      onSelectProfile(null, null)
    } else {
      const profile = profiles.find(p => p.id === profileId)
      if (profile) {
        onSelectProfile(profileId, profile.bazi_result_text || null)
      }
    }
    setShowDropdown(false)
  }

  if (!user) {
    return null
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setShowDropdown(!showDropdown)
        }}
        className="flex items-center gap-1.5 px-3 py-2 h-10 rounded-full bg-card/80 border border-border hover:bg-card transition-all duration-300"
      >
        <User className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-sm text-foreground max-w-[80px] truncate">
          {profiles.length === 0 ? '添加人物' : (selectedProfile ? selectedProfile.profile_name : '选择人物')}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-300 ${showDropdown ? 'rotate-180' : ''}`} />
      </button>

      {showDropdown && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute left-0 bottom-full mb-3 w-56 bg-card backdrop-blur-md border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="py-2 max-h-64 overflow-y-auto">
              {profiles.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                  <p>暂无人物档案</p>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleSelect(null)}
                    className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                      selectedProfileId === null
                        ? 'bg-muted text-foreground'
                        : 'text-foreground hover:bg-muted/50'
                    }`}
                  >
                    不选择人物
                  </button>
                  {profiles.map((profile) => (
                    <button
                      type="button"
                      key={profile.id}
                      onClick={() => handleSelect(profile.id)}
                      className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                        selectedProfileId === profile.id
                          ? 'bg-muted text-foreground'
                          : 'text-foreground hover:bg-muted/50'
                      }`}
                    >
                      {profile.profile_name}
                    </button>
                  ))}
                </>
              )}
              <div className="border-t border-border mt-1 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowDropdown(false)
                    onOpenProfilesDialog?.()
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-primary hover:bg-muted/50 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  新建人物
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
