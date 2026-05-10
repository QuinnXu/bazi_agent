"use client"

import React, { useState, useEffect } from 'react'
import { X, User, Plus, Trash2, Edit2, ArrowLeft } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { BaziDialog } from './bazi-dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

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
  const [notice, setNotice] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
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
      setNotice('')
      setDeleteTargetId(null)
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
      setNotice('卜卜象还不知道这位是谁，先给 TA 起个好认的名字吧。')
      return
    }
    setNotice('')
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
    setDeleteTargetId(profileId)
  }

  const confirmDeleteProfile = async () => {
    if (!deleteTargetId) return
    try {
      // @ts-ignore - Database types will be generated after schema deployment
      const { error } = await supabase
        .from('bazi_profiles')
        .delete()
        .eq('id', deleteTargetId)

      if (error) throw error
      setProfiles(profiles.filter(p => p.id !== deleteTargetId))
      // 如果正在查看被删除的人物，返回列表
      if (viewingProfile?.id === deleteTargetId) {
        handleBackToList()
      }
      setDeleteTargetId(null)
    } catch (error) {
      console.error('删除人物失败:', error)
      setNotice('卜卜象这次没能移除人物资料，稍后再轻轻试一次喔。')
    }
  }

  const handleBaziSubmit = async (data: BaziData) => {
    if (!user) return
    if (!profileName.trim()) {
      setNotice('卜卜象还不知道这位是谁，先给 TA 起个好认的名字吧。')
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
        throw new Error(result.error || '小象排盘没成功')
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
        throw new Error(saveResult?.details || saveResult?.error || '小象暂时保存不了这个人物')
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
      setNotice('卜卜象暂时没把这份人物资料收稳，稍后再试一次喔。')
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
              <h2 className="text-2xl font-light text-foreground mb-2">小象人物册</h2>
              <p className="text-sm text-muted-foreground">把常看的命主放在这里，小象会记得他们的命盘</p>
            </div>

            {notice && (
              <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-light text-foreground">
                {notice}
              </div>
            )}

            <button
              onClick={handleAddProfile}
              className="mb-4 w-full py-3 rounded-lg bg-primary text-primary-foreground text-sm font-light hover:opacity-90 transition-all duration-300 flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              添加一位给小象看
            </button>

            <div className="flex-1 overflow-y-auto space-y-2">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">小象在翻人物册...</div>
              ) : profiles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <User className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p>人物册还是空的</p>
                  <p className="text-xs mt-1">先添加一位，小象才好结合命盘看</p>
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
                回人物册
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
                  修改资料
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
                      点击「修改资料」重新保存，小象会整理成更清楚的展示
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <p className="text-sm">小象还没有这份八字数据</p>
                    <p className="text-xs mt-1">点击「修改资料」补出生信息</p>
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
              {editingProfile ? '帮小象更新人物' : '给小象添加人物'}
            </h3>

            {notice && (
              <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-light text-foreground">
                {notice}
              </div>
            )}
            
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
                placeholder="例如：本人、伴侣、朋友的名字"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={viewingProfile ? handleBackToDetail : handleBackToList}
                className="flex-1 px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-light hover:bg-muted/80 transition-all duration-300"
              >
                先不填
              </button>
              <button
                onClick={handleNextToBazi}
                className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-light hover:opacity-90 transition-all duration-300"
              >
                继续补资料
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
      <AlertDialog open={Boolean(deleteTargetId)} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent className="glass-minimal bg-card/95">
          <AlertDialogHeader>
            <AlertDialogTitle>要从人物册里移除吗？</AlertDialogTitle>
            <AlertDialogDescription>
              卜卜象会忘掉这位人物的命盘资料，之后需要再看就要重新补一次啦。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>先留着</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteProfile}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
