"use client"

import React, { useState, useEffect } from 'react'
import { User, ChevronDown } from 'lucide-react'
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
}

export function ProfileSelector({ selectedProfileId, onSelectProfile }: ProfileSelectorProps) {
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
    <div className="relative">      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-1.5 px-3 py-2 h-10 rounded-full bg-white/80 border border-neutral-200/40 hover:bg-white transition-all duration-300"
      >
        <User className="w-3.5 h-3.5 text-neutral-600" />
        <span className="text-sm text-neutral-700 max-w-[80px] truncate">
          {profiles.length === 0 ? '添加人物' : (selectedProfile ? selectedProfile.profile_name : '选择人物')}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
      </button>

      {showDropdown && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowDropdown(false)}
          />          <div className="absolute left-0 bottom-full mb-2 w-48 bg-white/95 backdrop-blur-sm border border-neutral-200/40 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="py-2 max-h-64 overflow-y-auto">
              {profiles.length === 0 ? (
                <div className="px-4 py-3 text-sm text-neutral-500 text-center">
                  <p>暂无人物档案</p>
                  <p className="text-xs mt-1">点击右侧 + 添加</p>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => handleSelect(null)}
                    className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                      selectedProfileId === null
                        ? 'bg-neutral-100 text-neutral-800'
                        : 'text-neutral-700 hover:bg-neutral-50'
                    }`}
                  >
                    不选择人物
                  </button>
                  {profiles.map((profile) => (
                    <button
                      key={profile.id}
                      onClick={() => handleSelect(profile.id)}
                      className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                        selectedProfileId === profile.id
                          ? 'bg-neutral-100 text-neutral-800'
                          : 'text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      {profile.profile_name}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
