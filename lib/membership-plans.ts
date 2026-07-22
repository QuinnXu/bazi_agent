import {
  AGENT_REPORT_APPLE_COSTS_BY_PLAN,
  CLASSIC_CHAT_APPLE_COSTS,
  FEATURE_APPLE_COSTS_BY_PLAN,
  LIUYAO_APPLE_COSTS_BY_PLAN,
  type MembershipTier,
  type UserTierId,
} from '@/lib/apple-costs'

export type MembershipPlanId = UserTierId

export interface MembershipPlan {
  id: MembershipPlanId
  name: string
  eyebrow: string
  badge?: string
  description: string
  priceLabel: string
  priceHint: string
  quotaLabel: string
  features: string[]
  ctaLabel: string
  highlighted: boolean
  disabled: boolean
}

export interface ApplePricingRow {
  label: string
  detail: string
  guest: string
  free: string
  plus: string
  ultra: string
}

export function getMembershipEntryLabel(tier?: MembershipTier | null): string {
  if (!tier) return '会员套餐'
  if (tier === 'plus') return '升级 / 续费'
  if (tier === 'ultra') return '会员权益'
  return '升级会员'
}

function apples(cost: number): string {
  return cost === 0 ? '免费' : `${cost} 🍎`
}

export const membershipPlans: MembershipPlan[] = [
  {
    id: 'guest',
    name: '游客体验',
    eyebrow: '先认识小象',
    description: '无需注册，完成一次引导式首问，快速感受完整回答。',
    priceLabel: '1 次',
    priceHint: '完整首问体验',
    quotaLabel: '不发放每日苹果',
    features: [
      '一次完整的引导式首问',
      '可体验人物资料录入流程',
      '不开放专题分析与历史记录',
      '注册后领取每日苹果',
    ],
    ctaLabel: '当前体验',
    highlighted: false,
    disabled: true,
  },
  {
    id: 'free',
    name: '注册用户',
    eyebrow: '日常轻量使用',
    description: '适合日常聊天、短报告和偶尔使用专题分析。',
    priceLabel: '¥0',
    priceHint: '长期免费',
    quotaLabel: '每日 5 🍎 · 每日刷新',
    features: [
      '基础聊天与卦内追问免费',
      '短报告 1 🍎，均衡报告 3 🍎',
      '四类专题分析按标准价消耗',
      '保存人物资料和聊天记录',
    ],
    ctaLabel: '注册领取苹果',
    highlighted: false,
    disabled: false,
  },
  {
    id: 'plus',
    name: 'Plus',
    eyebrow: '高频深度分析',
    badge: '推荐',
    description: '适合连续问答、深度报告和高频专题分析。',
    priceLabel: '¥7 起',
    priceHint: '周卡 · 固定期购买',
    quotaLabel: '每日 30 🍎 · 会员折扣价',
    features: [
      '每日额度提升至 30 🍎',
      '简洁报告免费，其他报告更省',
      '专题功能每次节省 1–2 🍎',
      '支持周、月、季、年四种期限',
    ],
    ctaLabel: '选择 Plus',
    highlighted: true,
    disabled: false,
  },
  {
    id: 'ultra',
    name: 'Ultra',
    eyebrow: '重度无限使用',
    badge: '不限苹果',
    description: '适合每日大量生成、连续研究和高频使用全部专题能力。',
    priceLabel: '¥19 起',
    priceHint: '周卡 · 固定期购买',
    quotaLabel: '全功能不扣苹果',
    features: [
      '所有聊天、报告与专题均为 0 🍎',
      '已有充值苹果在会员期内暂停消耗',
      '支持周、月、季、年四种期限',
      '受合理使用和反滥用规则保护',
    ],
    ctaLabel: '选择 Ultra',
    highlighted: false,
    disabled: false,
  },
]

export const applePricingRows: ApplePricingRow[] = [
  {
    label: '基础聊天',
    detail: '快速回答，不启用深度推理',
    guest: '首问内',
    free: '免费',
    plus: '免费',
    ultra: '不扣苹果',
  },
  {
    label: '经典投喂',
    detail: '启用深度推理的单次对话',
    guest: '—',
    free: apples(CLASSIC_CHAT_APPLE_COSTS.free),
    plus: apples(CLASSIC_CHAT_APPLE_COSTS.plus),
    ultra: apples(CLASSIC_CHAT_APPLE_COSTS.ultra),
  },
  {
    label: '简洁报告',
    detail: '结论、依据和行动提醒',
    guest: '首问内',
    free: apples(AGENT_REPORT_APPLE_COSTS_BY_PLAN.concise.free),
    plus: apples(AGENT_REPORT_APPLE_COSTS_BY_PLAN.concise.plus),
    ultra: apples(AGENT_REPORT_APPLE_COSTS_BY_PLAN.concise.ultra),
  },
  {
    label: '均衡报告',
    detail: '格局、阶段、风险与建议',
    guest: '—',
    free: apples(AGENT_REPORT_APPLE_COSTS_BY_PLAN.balanced.free),
    plus: apples(AGENT_REPORT_APPLE_COSTS_BY_PLAN.balanced.plus),
    ultra: apples(AGENT_REPORT_APPLE_COSTS_BY_PLAN.balanced.ultra),
  },
  {
    label: '深度报告',
    detail: '长周期推演与专项建议',
    guest: '—',
    free: apples(AGENT_REPORT_APPLE_COSTS_BY_PLAN.detailed.free),
    plus: apples(AGENT_REPORT_APPLE_COSTS_BY_PLAN.detailed.plus),
    ultra: apples(AGENT_REPORT_APPLE_COSTS_BY_PLAN.detailed.ultra),
  },
  {
    label: '近期运势',
    detail: '指定时间范围的趋势分析',
    guest: '—',
    free: apples(FEATURE_APPLE_COSTS_BY_PLAN.fortune.free),
    plus: apples(FEATURE_APPLE_COSTS_BY_PLAN.fortune.plus),
    ultra: apples(FEATURE_APPLE_COSTS_BY_PLAN.fortune.ultra),
  },
  {
    label: '合盘 · 应事',
    detail: '多人关系或具体事件分析',
    guest: '—',
    free: apples(FEATURE_APPLE_COSTS_BY_PLAN.hepan.free),
    plus: apples(FEATURE_APPLE_COSTS_BY_PLAN.hepan.plus),
    ultra: apples(FEATURE_APPLE_COSTS_BY_PLAN.hepan.ultra),
  },
  {
    label: '头像分析',
    detail: '图片与五行风格匹配',
    guest: '—',
    free: apples(FEATURE_APPLE_COSTS_BY_PLAN.avatar.free),
    plus: apples(FEATURE_APPLE_COSTS_BY_PLAN.avatar.plus),
    ultra: apples(FEATURE_APPLE_COSTS_BY_PLAN.avatar.ultra),
  },
  {
    label: '人生脉络',
    detail: '完整人生阶段与关键节点',
    guest: '—',
    free: apples(FEATURE_APPLE_COSTS_BY_PLAN.lifepath.free),
    plus: apples(FEATURE_APPLE_COSTS_BY_PLAN.lifepath.plus),
    ultra: apples(FEATURE_APPLE_COSTS_BY_PLAN.lifepath.ultra),
  },
  {
    label: '六爻解卦',
    detail: '完整起卦、排盘与首次解读',
    guest: '—',
    free: apples(LIUYAO_APPLE_COSTS_BY_PLAN.reading.free),
    plus: apples(LIUYAO_APPLE_COSTS_BY_PLAN.reading.plus),
    ultra: apples(LIUYAO_APPLE_COSTS_BY_PLAN.reading.ultra),
  },
  {
    label: '卦内追问',
    detail: '沿用本卦上下文继续追问',
    guest: '—',
    free: apples(LIUYAO_APPLE_COSTS_BY_PLAN.followUp.free),
    plus: apples(LIUYAO_APPLE_COSTS_BY_PLAN.followUp.plus),
    ultra: apples(LIUYAO_APPLE_COSTS_BY_PLAN.followUp.ultra),
  },
]
