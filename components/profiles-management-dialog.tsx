"use client"

import React, { useState, useEffect } from 'react'
import { X, User, Plus, Trash2, Edit2, ArrowLeft } from 'lucide-react'
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
  gender: 'male' | 'female' | 'other' | null
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

interface BaziResultData {
  gender: string
  fourPillars: {
    year: string
    month: string
    day: string
    hour: string
  }
  dayun: Array<{
    ageStart: number
    ageEnd: number
    ganZhi: string
    yearStart: number
    yearEnd: number
  }>
}

interface ProfilesManagementDialogProps {
  isOpen: boolean
  onClose: () => void
  onProfileSaved?: (profile: BaziProfile) => void
}

export function ProfilesManagementDialog({ isOpen, onClose, onProfileSaved }: ProfilesManagementDialogProps) {
  const [profiles, setProfiles] = useState<BaziProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogStep, setDialogStep] = useState<'list' | 'name' | 'bazi' | 'detail'>('list')
  const [editingProfile, setEditingProfile] = useState<BaziProfile | null>(null)
  const [viewingProfile, setViewingProfile] = useState<BaziProfile | null>(null)
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
      setViewingProfile(null)
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
        if (error.code === 'PGRST116') {
          setProfiles([])
          return
        }
        throw error
      }
      setProfiles(data || [])
    } catch (error) {
      setProfiles([])
    } finally {
      setLoading(false)
    }
  }

  const handleAddProfile = () => {
    setEditingProfile(null)
    setViewingProfile(null)
    setProfileName('')
    setDialogStep('name')
  }

  const handleEditProfile = (profile: BaziProfile) => {
    setEditingProfile(profile)
    setProfileName(profile.profile_name)
    setDialogStep('name')
  }

  const handleViewProfile = (profile: BaziProfile) => {
    setViewingProfile(profile)
    setDialogStep('detail')
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
    setViewingProfile(null)
    setProfileName('')
  }

  const handleBackToDetail = () => {
    if (viewingProfile) {
      setDialogStep('detail')
      setEditingProfile(null)
      setProfileName('')
    } else {
      handleBackToList()
    }
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
      // 如果正在查看被删除的人物，返回列表
      if (viewingProfile?.id === profileId) {
        handleBackToList()
      }
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
      }

      const profileData = {
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
        bazi_result: result.baziData,
      }

      const saveResponse = await fetch('/api/bazi-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingProfile ? { id: editingProfile.id } : {}),
          ...profileData,
          bazi_result_json: result.baziData,
        }),
      })
      const saveResult = await saveResponse.json().catch(() => ({}))
      if (!saveResponse.ok) {
        throw new Error(saveResult?.details || saveResult?.error || '保存人物失败')
      }

      const savedProfile = saveResult.profile as BaziProfile | undefined
      if (savedProfile) {
        onProfileSaved?.(savedProfile)
      }

      // 刷新列表
      await loadProfiles()

      // 如果是从 detail 页编辑的，保存后返回 detail 并刷新数据
      if (viewingProfile && editingProfile) {
        if (savedProfile) {
          setViewingProfile(savedProfile)
        }
        setDialogStep('detail')
        setEditingProfile(null)
        setProfileName('')
      } else {
        setDialogStep('list')
        setEditingProfile(null)
        setViewingProfile(null)
        setProfileName('')
      }
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
          
          <div className="relative bg-card/95 backdrop-blur-sm border border-border rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-xl flex flex-col glass-minimal">
            <button
              onClick={onClose}
              className="absolute right-4 top-4 w-8 h-8 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>

            <div className="mb-6">
              <h2 className="text-2xl font-light text-foreground mb-2">人物管理</h2>
              <p className="text-sm text-muted-foreground">管理您的八字人物档案</p>
            </div>

            <button
              onClick={handleAddProfile}
              className="mb-4 w-full py-3 rounded-lg bg-primary text-primary-foreground text-sm font-light hover:opacity-90 transition-all duration-300 flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              添加新人物
            </button>

            <div className="flex-1 overflow-y-auto space-y-2">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">加载中...</div>
              ) : profiles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <User className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p>暂无人物档案</p>
                  <p className="text-xs mt-1">点击上方按钮添加</p>
                </div>
              ) : (
                profiles.map((profile) => {
                  const baziData = profile.bazi_result as BaziResultData | null
                  const fp = baziData?.fourPillars
                  return (
                    <div
                      key={profile.id}
                      onClick={() => handleViewProfile(profile)}
                      className="p-4 rounded-lg bg-card/60 border border-border hover:bg-card/80 transition-all duration-300 cursor-pointer group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-medium text-foreground mb-1">
                            {profile.profile_name}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {profile.birth_year}年{profile.birth_month}月{profile.birth_day}日 {profile.birth_hour}:{profile.birth_minute.toString().padStart(2, '0')}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {profile.is_solar_calendar ? '阳历' : '阴历'} · {profile.gender === 'female' ? '女' : '男'}
                          </p>
                          {fp && (
                            <p className="text-xs text-primary/70 mt-1.5 font-medium tracking-wider">
                              {fp.year}  {fp.month}  {fp.day}  {fp.hour}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEditProfile(profile) }}
                            className="w-8 h-8 rounded-lg hover:bg-primary/10 flex items-center justify-center transition-colors"
                            title="编辑"
                          >
                            <Edit2 className="w-4 h-4 text-primary" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteProfile(profile.id) }}
                            className="w-8 h-8 rounded-lg hover:bg-destructive/10 flex items-center justify-center transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 2: 人物详情 */}
      {dialogStep === 'detail' && viewingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm"
            onClick={onClose}
          />
          
          <div className="relative bg-card/95 backdrop-blur-sm border border-border rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-xl flex flex-col glass-minimal">
            {/* 头部导航 */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={handleBackToList}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                返回列表
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* 可滚动区域 */}
            <div className="flex-1 overflow-y-auto">
              {/* 人物信息区 */}
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-xl font-medium text-foreground mb-1">
                    {viewingProfile.profile_name}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {viewingProfile.birth_year}年{viewingProfile.birth_month}月{viewingProfile.birth_day}日 {viewingProfile.birth_hour}:{viewingProfile.birth_minute.toString().padStart(2, '0')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {viewingProfile.is_solar_calendar ? '阳历' : '阴历'} · {viewingProfile.gender === 'female' ? '女' : '男'}
                  </p>
                </div>
                <button
                  onClick={() => handleEditProfile(viewingProfile)}
                  className="px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-xs text-muted-foreground hover:text-foreground transition-all duration-300 flex items-center gap-1.5 flex-shrink-0"
                >
                  <Edit2 className="w-3 h-3" />
                  修改信息
                </button>
              </div>

              <div className="border-t border-border/50 pt-5 space-y-5">
                {viewingProfile.bazi_result ? (() => {
                  const data = viewingProfile.bazi_result as BaziResultData
                  return (
                    <>
                      {/* 四柱八字 */}
                      <div>
                        <p className="text-sm font-light text-foreground mb-3">四柱八字</p>
                        <div className="grid grid-cols-4 gap-3 text-center">
                          {(['year', 'month', 'day', 'hour'] as const).map((key, i) => {
                            const labels = ['年柱', '月柱', '日柱', '时柱']
                            const pillar = data.fourPillars[key]
                            const gan = pillar?.charAt(0) || ''
                            const zhi = pillar?.charAt(1) || ''
                            return (
                              <div key={key} className="rounded-xl bg-muted/30 border border-border/30 py-3 px-2">
                                <p className="text-[10px] text-muted-foreground mb-2">{labels[i]}</p>
                                <p className="text-lg font-medium text-foreground leading-tight">{gan}</p>
                                <p className="text-lg font-medium text-foreground leading-tight">{zhi}</p>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* 大运 */}
                      {data.dayun && data.dayun.length > 0 && (
                        <div>
                          <p className="text-sm font-light text-foreground mb-3">大运</p>
                          <div className="flex flex-wrap gap-2">
                            {data.dayun.map((dy, i) => (
                              <div key={i} className="rounded-xl bg-muted/30 border border-border/30 px-3 py-2 text-center min-w-[64px]">
                                <p className="text-sm font-medium text-foreground">{dy.ganZhi}</p>
                                <p className="text-[10px] text-muted-foreground mt-1">{dy.ageStart}-{dy.ageEnd}岁</p>
                                <p className="text-[10px] text-muted-foreground">{dy.yearStart}-{dy.yearEnd}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )
                })() : viewingProfile.bazi_result_text ? (
                  <div>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                      {viewingProfile.bazi_result_text}
                    </pre>
                    <p className="text-[10px] text-muted-foreground/60 mt-3">
                      点击「修改信息」重新保存可更新为结构化展示
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <p className="text-sm">暂无八字数据</p>
                    <p className="text-xs mt-1">点击「修改信息」添加出生信息</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: 输入人物名称 */}
      {dialogStep === 'name' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm"
            onClick={viewingProfile ? handleBackToDetail : handleBackToList}
          />
          
          <div className="relative bg-card/95 backdrop-blur-sm border border-border rounded-2xl p-6 max-w-md w-full shadow-xl glass-minimal">
            <button
              onClick={viewingProfile ? handleBackToDetail : handleBackToList}
              className="absolute right-4 top-4 w-8 h-8 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>

            <h3 className="text-lg font-light text-foreground mb-4">
              {editingProfile ? '编辑人物' : '添加新人物'}
            </h3>
            
            <div className="mb-4">
              <label className="block text-sm font-light text-foreground mb-2">
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
                className="w-full px-4 py-3 rounded-lg bg-card/60 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-300"
                placeholder="例如：张三、李四、本人等"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={viewingProfile ? handleBackToDetail : handleBackToList}
                className="flex-1 px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-light hover:bg-muted/80 transition-all duration-300"
              >
                取消
              </button>
              <button
                onClick={handleNextToBazi}
                className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-light hover:opacity-90 transition-all duration-300"
              >
                下一步
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: 输入八字信息 */}
      {dialogStep === 'bazi' && (
        <BaziDialog
          isOpen={true}
          onClose={viewingProfile ? handleBackToDetail : handleBackToList}
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
