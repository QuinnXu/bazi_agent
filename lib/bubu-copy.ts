export type BubuRunKind = 'classic' | 'agent' | 'feature'
export type BubuStreamStatus = 'queued' | 'streaming' | 'complete' | 'stopped' | 'error'

export const BUBU_STREAM_LABELS: Record<BubuRunKind, Record<BubuStreamStatus, string>> = {
  classic: {
    queued: '小象在听题',
    streaming: '小象在写给你',
    complete: '看好啦',
    stopped: '先停在这里',
    error: '小象卡住啦',
  },
  agent: {
    queued: '小象在排步骤',
    streaming: '小象在写给你',
    complete: '看好啦',
    stopped: '先停在这里',
    error: '小象卡住啦',
  },
  feature: {
    queued: '小象在铺报告',
    streaming: '小象在写报告',
    complete: '报告好啦',
    stopped: '先停在这里',
    error: '小象卡住啦',
  },
}

export const BUBU_EMPTY_RESPONSE = {
  agent: '小象刚才跑完步骤啦，但没有接到完整正文。换个说法再问一次，或者先补人物和范围，我再继续看喔。',
  classic: '小象刚才没有收到完整回复。你换个说法再问一次，我重新接住喔。',
  feature: '小象这次没有接到完整报告。苹果状态已刷新，稍后再试一次就好喔。',
  stopped: '小象先停在这里啦。你可以调整问题后继续问我。',
  stoppedFeature: '小象先停下本次分析啦。当前还没有生成可保留的正文。',
  genericError: '小象刚才有点卡住了，稍后再试一次喔。',
  featureError: '小象分析时遇到了一点小问题，已为你退还苹果🍎，稍后再试一次喔。',
}

export const BUBU_FOLLOW_UP_DEFAULTS = [
  '换个角度再看看？',
  '帮我整理行动清单',
  '下一步小象建议？',
]

export const BUBU_FOLLOW_UP_LOADING = '小象在猜你还想问什么…'

const FOLLOW_UP_SKIP_PREFIXES = [
  '抱歉',
  '已停止',
  '这次没有收到',
  '这次报告没有生成',
  'Agent 已完成步骤，但没有返回正文',
  '小象刚才没有收到完整回复',
  '小象这次没有接到完整报告',
  '小象刚才跑完步骤啦，但没有接到完整正文',
  '小象先停',
  '小象刚才有点卡住',
  '小象分析时遇到',
]

const TEMPLATE_FOLLOW_UPS = [
  '继续展开上面的重点',
  '整理成行动清单',
  '下一步怎么做',
  '展开上面',
  '继续说说',
  ...BUBU_FOLLOW_UP_DEFAULTS.map(item => item.replace(/[？?]$/u, '')),
]

export function getBubuStreamLabel(runKind: BubuRunKind, status: BubuStreamStatus): string {
  return BUBU_STREAM_LABELS[runKind]?.[status] || BUBU_STREAM_LABELS.classic[status]
}

export function getBubuGeneratingLabel(runKind: BubuRunKind): string {
  return getBubuStreamLabel(runKind, 'streaming')
}

export function shouldSkipFollowUpSuggestions(content: string): boolean {
  const text = content.trim()
  if (!text) return true
  return FOLLOW_UP_SKIP_PREFIXES.some(prefix => text.startsWith(prefix))
}

export function isTemplateFollowUpSuggestion(value: string): boolean {
  const text = value.replace(/[。.!！？?]+$/u, '').trim()
  return TEMPLATE_FOLLOW_UPS.some(template => text === template)
}

export function createBubuMessageId(prefix = 'msg'): string {
  const randomId = globalThis.crypto?.randomUUID?.()
  if (randomId) return `${prefix}-${randomId}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
