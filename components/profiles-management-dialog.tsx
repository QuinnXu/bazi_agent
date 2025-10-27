"use client"

import React, { useState, useEffect } from 'react'
import { X, User, Plus, Trash2, Edit2 } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { BaziDialog } from './bazi-dialog'

interface BaziProfile {
  id: string
  user_id: string
  profile_name: string
  birth_year: number
  birth_month: number
  birth_day: number
  birth_hour: number
  birth_minute: number
  is_solar_calendar: boolean
  gender: 'male' | 'female' | 'other'
  birth_longitude: number
  birth_latitude: number
  bazi_result_text: string | null
  bazi_result: any | null
  created_at: string
  updated_at: string
}

interface BaziData {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  isSolar: boolean
  isFemale: boolean
  longitude: string
  latitude: string
}

interface ProfilesManagementDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function ProfilesManagementDialog({ isOpen, onClose }: ProfilesManagementDialogProps) {
  const [profiles, setProfiles] = useState<BaziProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogStep, setDialogStep] = useState<'list' | 'name' | 'bazi'>('list')
  const [editingProfile, setEditingProfile] = useState<BaziProfile | null>(null)
  const [profileName, setProfileName] = useState('')
  const { user } = useAuth()
  const supabase = createBrowserClient()

  useEffect(() => {
    if (isOpen && user) {
      loadProfiles()
    }
  }, [isOpen, user])

  // 重置对话框状态
  useEffect(() => {
    if (!isOpen) {
      setDialogStep('list')
      setEditingProfile(null)
      setProfileName('')
    }
  }, [isOpen])

  const loadProfiles = async () => {
    if (!user) return

    setLoading(true)
    try {
      // @ts-ignore - Database types will be generated after schema deployment
      const { data, error } = await supabase
        .from('bazi_profiles')
        .select('*')
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
      // 静默处理，无人物是正常情况
      setProfiles([])
    } finally {
      setLoading(false)
    }
  }

  const handleAddProfile = () => {
    setEditingProfile(null)
    setProfileName('')
    setDialogStep('name')
  }
  const handleEditProfile = (profile: BaziProfile) => {
    setEditingProfile(profile)
    setProfileName(profile.profile_name)
    setDialogStep('name')
  }

  const handleNextToBazi = () => {
    if (!profileName.trim()) {
      alert('请输入人物名称')
      return
    }
    setDialogStep('bazi')
  }

  const handleBackToList = () => {
    setDialogStep('list')
    setEditingProfile(null)
    setProfileName('')
  }

  const handleDeleteProfile = async (profileId: string) => {
    if (!confirm('确定要删除这个人物吗？')) return

    try {
      // @ts-ignore - Database types will be generated after schema deployment
      const { error } = await supabase
        .from('bazi_profiles')
        .delete()
        .eq('id', profileId)

      if (error) throw error
      setProfiles(profiles.filter(p => p.id !== profileId))
    } catch (error) {
      console.error('删除人物失败:', error)
      alert('删除失败，请稍后重试')
    }
  }

  const handleBaziSubmit = async (data: BaziData) => {
    if (!user) return
    if (!profileName.trim()) {
      alert('请输入人物名称')
      return
    }

    try {
      // 获取八字分析结果
      const response = await fetch('/api/bazi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          year: parseInt(data.year),
          month: parseInt(data.month),
          day: parseInt(data.day),
          hour: parseInt(data.hour),
          isSolar: data.isSolar,
          isFemale: data.isFemale,
          longitude: parseFloat(data.longitude),
          latitude: parseFloat(data.latitude)
        })
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || '八字计算失败')
      }      console.log('保存八字结果:', result)

      if (editingProfile) {
        // 更新现有人物
        // @ts-ignore - Database types will be generated after schema deployment
        const { error } = await supabase
          .from('bazi_profiles')
          // @ts-ignore
          .update({
            profile_name: profileName.trim(),
            birth_year: parseInt(data.year),
            birth_month: parseInt(data.month),
            birth_day: parseInt(data.day),
            birth_hour: parseInt(data.hour),
            birth_minute: parseInt(data.minute),
            is_solar_calendar: data.isSolar,
            gender: data.isFemale ? 'female' : 'male',
            birth_longitude: parseFloat(data.longitude),
            birth_latitude: parseFloat(data.latitude),
            bazi_result_text: result.baziResult,
          })
          .eq('id', editingProfile.id)

        if (error) {
          console.error('更新错误:', error)
          throw error
        }
      } else {
        // 创建新人物
        // @ts-ignore - Database types will be generated after schema deployment
        const { error } = await supabase
          .from('bazi_profiles')
          // @ts-ignore
          .insert({
            user_id: user.id,
            profile_name: profileName.trim(),
            birth_year: parseInt(data.year),
            birth_month: parseInt(data.month),
            birth_day: parseInt(data.day),
            birth_hour: parseInt(data.hour),
            birth_minute: parseInt(data.minute),
            is_solar_calendar: data.isSolar,
            gender: data.isFemale ? 'female' : 'male',
            birth_longitude: parseFloat(data.longitude),
            birth_latitude: parseFloat(data.latitude),
            bazi_result_text: result.baziResult,
          })

        if (error) {
          console.error('插入错误:', error)
          throw error
        }
      }

      setDialogStep('list')
      setEditingProfile(null)
      setProfileName('')
      loadProfiles()
    } catch (error) {
      console.error('保存人物失败:', error)
      alert('保存失败，请稍后重试')
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Step 1: 人物列表 */}
      {dialogStep === 'list' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm"
            onClick={onClose}
          />
          
          <div className="relative bg-white/90 backdrop-blur-sm border border-neutral-200/40 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-xl flex flex-col">
            <button
              onClick={onClose}
              className="absolute right-4 top-4 w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-neutral-600" />
            </button>

            <div className="mb-6">
              <h2 className="text-2xl font-light text-neutral-800 mb-2">人物管理</h2>
              <p className="text-sm text-neutral-600">管理您的八字人物档案</p>
            </div>

            <button
              onClick={handleAddProfile}
              className="mb-4 w-full py-3 rounded-lg bg-neutral-800 text-white text-sm font-light hover:bg-neutral-700 transition-all duration-300 flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              添加新人物
            </button>

            <div className="flex-1 overflow-y-auto space-y-2">
              {loading ? (
                <div className="text-center py-8 text-neutral-500">加载中...</div>
              ) : profiles.length === 0 ? (
                <div className="text-center py-8 text-neutral-500">
                  <User className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
                  <p>暂无人物档案</p>
                  <p className="text-xs mt-1">点击上方按钮添加</p>
                </div>
              ) : (
                profiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="p-4 rounded-lg bg-white/60 border border-neutral-200/40 hover:bg-white/80 transition-all duration-300"
                  >
                    <div className="flex items-start justify-between gap-3">                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-medium text-neutral-800 mb-1">
                          {profile.profile_name}
                        </h3>
                        <p className="text-sm text-neutral-600">
                          {profile.birth_year}年{profile.birth_month}月{profile.birth_day}日 {profile.birth_hour}:{profile.birth_minute.toString().padStart(2, '0')}
                        </p>
                        <p className="text-xs text-neutral-500 mt-1">
                          {profile.is_solar_calendar ? '阳历' : '阴历'} · {profile.gender === 'female' ? '女' : '男'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditProfile(profile)}
                          className="w-8 h-8 rounded-lg hover:bg-blue-50 flex items-center justify-center transition-colors"
                          title="编辑"
                        >
                          <Edit2 className="w-4 h-4 text-blue-500" />
                        </button>
                        <button
                          onClick={() => handleDeleteProfile(profile.id)}
                          className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 2: 输入人物名称 */}
      {dialogStep === 'name' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm"
            onClick={handleBackToList}
          />
          
          <div className="relative bg-white/90 backdrop-blur-sm border border-neutral-200/40 rounded-2xl p-6 max-w-md w-full shadow-xl">
            <button
              onClick={handleBackToList}
              className="absolute right-4 top-4 w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-neutral-600" />
            </button>

            <h3 className="text-lg font-light text-neutral-800 mb-4">
              {editingProfile ? '编辑人物' : '添加新人物'}
            </h3>
            
            <div className="mb-4">
              <label className="block text-sm font-light text-neutral-700 mb-2">
                人物名称
              </label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && profileName.trim()) {
                    handleNextToBazi()
                  }
                }}
                className="w-full px-4 py-3 rounded-lg bg-white/60 border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300"
                placeholder="例如：张三、李四、本人等"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleBackToList}
                className="flex-1 px-4 py-2 rounded-lg bg-neutral-100 text-neutral-700 text-sm font-light hover:bg-neutral-200 transition-all duration-300"
              >
                取消
              </button>
              <button
                onClick={handleNextToBazi}
                className="flex-1 px-4 py-2 rounded-lg bg-neutral-800 text-white text-sm font-light hover:bg-neutral-700 transition-all duration-300"
              >
                下一步
              </button>
            </div>
          </div>
        </div>
      )}      {/* Step 3: 输入八字信息 */}
      {dialogStep === 'bazi' && (
        <BaziDialog
          isOpen={true}
          onClose={handleBackToList}
          onSubmit={handleBaziSubmit}
          initialData={editingProfile ? {
            year: editingProfile.birth_year.toString(),
            month: editingProfile.birth_month.toString(),
            day: editingProfile.birth_day.toString(),
            hour: editingProfile.birth_hour.toString(),
            minute: editingProfile.birth_minute.toString(),
            isSolar: editingProfile.is_solar_calendar,
            isFemale: editingProfile.gender === 'female',
            longitude: editingProfile.birth_longitude.toString(),
            latitude: editingProfile.birth_latitude.toString(),
          } : undefined}
        />
      )}
    </>
  )
}
