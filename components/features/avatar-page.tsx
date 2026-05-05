"use client"

import React, { useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { FeaturePageShell } from '@/components/feature-page-shell'
import { ProfilePicker } from './profile-picker'
import { useAuth } from '@/contexts/auth-context'
import type { AvatarParams, FeatureParticipant } from '@/lib/feature-types'

interface AvatarPageProps {
  onBack: () => void
  onSubmit: (params: AvatarParams) => void
  onOpenProfilesManager: () => void
  onRequireAuth: () => void
  loading?: boolean
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB hard limit
const COMPRESS_THRESHOLD = 4 * 1024 * 1024 // start compressing if > 4MB
const COMPRESS_MAX_DIM = 1280 // longest edge for compressed payload

/**
 * Read a File as base64 data URL.
 */
function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * Compress an image data URL down to <= maxDim on the longest edge as JPEG.
 */
async function compressDataUrl(
  dataUrl: string,
  maxDim = COMPRESS_MAX_DIM,
  quality = 0.85,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const { width, height } = img
      const longest = Math.max(width, height)
      if (longest <= maxDim) {
        resolve(dataUrl)
        return
      }
      const scale = maxDim / longest
      const w = Math.round(width * scale)
      const h = Math.round(height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      try {
        resolve(canvas.toDataURL('image/jpeg', quality))
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = () => reject(new Error('image load failed'))
    img.src = dataUrl
  })
}

export function AvatarPage({
  onBack,
  onSubmit,
  onOpenProfilesManager,
  onRequireAuth,
  loading = false,
}: AvatarPageProps) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [imageDataUrl, setImageDataUrl] = useState<string>('')
  const [fileName, setFileName] = useState<string>('')
  const [previewSizeKb, setPreviewSizeKb] = useState<number>(0)
  const [combineBazi, setCombineBazi] = useState(true)
  const [profile, setProfile] = useState<FeatureParticipant | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const stepLabels = ['上传头像', '是否结合八字']

  const canNext = !!imageDataUrl
  const canSubmit =
    canNext && (!combineBazi || !!profile)

  const handleFile = async (file: File) => {
    setErrorMsg('')
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setErrorMsg('请上传 JPG / PNG / WEBP 格式的图片')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setErrorMsg('图片过大（>10MB），请压缩后再试')
      return
    }
    setIsProcessing(true)
    try {
      let dataUrl = await readFileAsDataURL(file)
      if (file.size > COMPRESS_THRESHOLD) {
        dataUrl = await compressDataUrl(dataUrl)
      }
      const sizeKb = Math.round((dataUrl.length * 3) / 4 / 1024)
      setImageDataUrl(dataUrl)
      setFileName(file.name)
      setPreviewSizeKb(sizeKb)
    } catch (e) {
      console.error('[avatar] read file failed', e)
      setErrorMsg('图片读取失败，请重试')
    } finally {
      setIsProcessing(false)
    }
  }

  const onPickFile: React.ChangeEventHandler<HTMLInputElement> = e => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
    if (e.target) e.target.value = ''
  }

  const onDrop: React.DragEventHandler<HTMLDivElement> = e => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  const handleClear = () => {
    setImageDataUrl('')
    setFileName('')
    setPreviewSizeKb(0)
    setErrorMsg('')
  }

  const handleSubmit = () => {
    if (!user) {
      onRequireAuth()
      return
    }
    if (!canSubmit) return
    onSubmit({
      imageDataUrl,
      combineBazi,
      profile: combineBazi ? profile : null,
    })
  }

  const handleNext = () => {
    if (step === 1 && canNext) setStep(2)
  }
  const handlePrev = () => setStep(s => Math.max(1, s - 1))

  return (
    <FeaturePageShell
      title="头像分析推荐"
      subtitle="上传头像，结合气质与五行给出风格建议"
      step={step}
      totalSteps={2}
      stepLabels={stepLabels}
      onBack={onBack}
      onPrev={handlePrev}
      onNext={handleNext}
      onSubmit={handleSubmit}
      canPrev={step > 1}
      canNext={canNext}
      canSubmit={canSubmit}
      isLastStep={step === 2}
      loading={loading || isProcessing}
      loadingText={isProcessing ? '正在处理图片…' : '小象正在认真看图…'}
      cost={3}
    >
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            支持 JPG / PNG / WEBP，最大 10MB。建议头像清晰、主体居中。
          </p>

          {!imageDataUrl ? (
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={e => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`relative cursor-pointer rounded-3xl border-2 border-dashed p-12 text-center transition-all ${
                dragOver
                  ? 'border-primary/60 bg-primary/5'
                  : 'border-border/60 bg-card/40 hover:border-primary/40 hover:bg-card/60'
              }`}
            >
              <ImagePlus className="w-12 h-12 text-muted-foreground/60 mx-auto mb-3" />
              <p className="text-sm text-foreground font-light">
                点击或拖拽上传头像
              </p>
              <p className="text-[11px] text-muted-foreground/70 mt-1">
                JPG / PNG / WEBP · ≤ 10MB
              </p>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(',')}
                onChange={onPickFile}
                className="hidden"
              />
            </div>
          ) : (
            <div className="rounded-3xl border border-border bg-card/60 p-5 flex items-center gap-4">
              <div className="relative w-24 h-24 md:w-32 md:h-32 rounded-2xl overflow-hidden bg-muted flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageDataUrl}
                  alt="preview"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {fileName || '已上传'}
                </p>
                <p className="text-[11px] text-muted-foreground/80 mt-1">
                  {previewSizeKb > 0 ? `约 ${previewSizeKb} KB` : ''}
                </p>
                <button
                  onClick={handleClear}
                  className="mt-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  重新上传
                </button>
              </div>
            </div>
          )}

          {errorMsg && (
            <p className="text-xs text-destructive">{errorMsg}</p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border/60 bg-card/60 p-4 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                结合个人五行与近期运势
              </p>
              <p className="text-xs text-muted-foreground font-light mt-1 leading-relaxed">
                打开后，卜卜象会根据命主八字给出更贴合气质的配色与风格建议。
              </p>
            </div>
            <button
              onClick={() => setCombineBazi(!combineBazi)}
              className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${
                combineBazi ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  combineBazi ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {combineBazi && (
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">
                选择命主人物
              </label>
              <ProfilePicker
                selectedIds={profile?.id ? [profile.id] : []}
                onChange={list => setProfile(list[0] || null)}
                onOpenManager={onOpenProfilesManager}
                emptyHint="还没有人物，添加一位才能结合八字哦~"
              />
              {!profile && (
                <p className="text-[11px] text-muted-foreground/70">
                  没有合适的人物？可以先关掉「结合八字」开关，依然能给纯气质分析。
                </p>
              )}
            </div>
          )}

          <div className="rounded-xl bg-secondary/40 border border-border/40 p-3 text-xs text-muted-foreground leading-relaxed">
            点击「开始分析」后，卜卜象会用多模态模型看图，再结合
            {combineBazi ? '命主五行' : '气质特征'}给出建议。
          </div>
        </div>
      )}
    </FeaturePageShell>
  )
}
