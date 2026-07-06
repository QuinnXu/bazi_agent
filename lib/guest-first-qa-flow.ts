import {
  getAgentReportPreferenceInstruction,
  type AgentComplexityMode,
  type AgentReportPreference,
} from '@/lib/agent-complexity'

export const GUEST_FIRST_QA_FLOW = {
  id: 'guest_first_qa_v1',
  legacyIds: ['onboarding'],
  requestPrefix: 'guest-first-qa-profile',
  legacyRequestPrefixes: ['guest-onboarding-profile'],
  defaultProfileName: '我',
  fixedTrialQuestion:
    '请基于默认人物「我」的出生信息，先分析我的性格底色、过去经历印记、当下阶段和下一步行动提醒。',
  complexity: 'thinking' as AgentComplexityMode,
  reportPreference: { mode: 'balanced' } as AgentReportPreference,
  copy: {
    landing: {
      badge: '免费先看一次',
      headlineLead: '先免费认识「我」，',
      headlineAccent: '小象带路。',
      description: '你可以先留下想问的问题。补完「我」的人物信息后，小象先给一次入门画像；注册后保存记录，并继续深入刚才的问题。',
      primaryCta: '免费先看一次',
      secondaryCta: '登录保存',
      inputPlaceholder: '试试：我想注册后继续问，最近适合把重点放在哪里？',
      trialPoints: ['一次入门画像', '问题注册后继续', '保存后深入追问'],
      finalCtaEyebrow: 'Free trial',
      finalCtaTitle: '不确定从哪开始，就先让小象认识「我」。',
    },
    assistantIntro:
      '小象已经收到啦。免费试用会先从「我」的人物入门画像开始，看性格底色、过去经历和当下阶段。',
    profileCardTitle: '先建立「我」的人物信息',
    profileCardMessage: (question: string) =>
      [
        '先补「我」的出生信息，小象会先给一次入门画像。',
        question ? `已收到你的问题，注册后继续深入：「${question}」` : null,
      ].filter(Boolean).join('\n'),
    profileSubmitLabel: '创建「我」并开始试用',
    trialSummaryTopic: '性格底色、过去经历、当下阶段',
    deferredQuestionLabel: (question: string) =>
      `已收到你的问题，注册后继续深入：「${question}」`,
    authHintTitle: {
      collecting: '先补「我」的人物信息',
      completed: '注册后保存并继续原问题',
      ready: '免费试用已准备好',
    },
    authHintDescription: {
      collecting: '小象会默认使用人物「我」来分析。完成资料后会先给一次入门画像，原问题会留到注册后继续。',
      completed: '这次试用已经完成。登录或注册后，小象会把这段记录写入正式会话，并自动接着你在首页输入的问题继续回答。',
      ready: '可以先留下问题，小象会在需要命盘时引导你补「我」的人物信息；免费试用先看入门画像。',
    },
    tutorialTitle: '第一次来，可以这样开始',
    tutorialDescription: '不用先研究功能。把问题先留下，小象会先从「我」的人物画像开始。',
    tutorialDismissLabel: '知道了',
    tutorialSteps: [
      { label: '留', title: '留下问题', description: '输入真实问题，注册后继续。' },
      { label: '补', title: '补「我」的信息', description: '需要命盘时再补出生资料。' },
      { label: '看', title: '看入门画像', description: '免费先看性格和阶段。' },
      { label: '存', title: '注册后继续', description: '保存记录和人物，接着深入聊。' },
    ],
  },
  promptGuidance:
    '按报告长度卡片里的「均衡分析」口径处理：中等长度、层级清楚、围绕固定游客首问自然展开；要覆盖性格底色、过去经历印记、当下阶段、主要风险和行动建议，但不要套固定小标题，也不要写成 1/2/3/4 的拼装模板。',
} as const

export function isGuestFirstQaFlow(flowId?: string | null): boolean {
  if (!flowId) return false
  return flowId === GUEST_FIRST_QA_FLOW.id ||
    GUEST_FIRST_QA_FLOW.legacyIds.includes(flowId as any)
}

export function isGuestFirstQaRequestId(requestId: string): boolean {
  return [
    GUEST_FIRST_QA_FLOW.requestPrefix,
    ...GUEST_FIRST_QA_FLOW.legacyRequestPrefixes,
  ].some(prefix => requestId.startsWith(prefix))
}

export function buildGuestFirstQaAnswerPrompt(
  _question: string,
  profileName: string = GUEST_FIRST_QA_FLOW.defaultProfileName,
): string {
  return [
    '试用资料已补齐',
    `分析对象：「${profileName || GUEST_FIRST_QA_FLOW.defaultProfileName}」`,
    `本次先看：${GUEST_FIRST_QA_FLOW.copy.trialSummaryTopic}`,
  ].filter(Boolean).join('\n')
}

export function buildGuestFirstQaFixedQuestion(): string {
  return GUEST_FIRST_QA_FLOW.fixedTrialQuestion
}

export function buildGuestFirstQaVisibleQuestionSummary(question?: string | null): string {
  const trimmed = question?.trim()
  if (!trimmed) return ''
  return GUEST_FIRST_QA_FLOW.copy.deferredQuestionLabel(trimmed)
}

export function buildGuestFirstQaPostRegistrationPrompt(question: string): string {
  return [
    '试用记录已保存',
    `继续问题：「${question}」`,
  ].join('\n')
}

export function buildGuestFirstQaTrialPromptContext(question?: string | null): string {
  const balancedInstruction = getAgentReportPreferenceInstruction(GUEST_FIRST_QA_FLOW.reportPreference)
  const trimmedQuestion = question?.trim()
  return [
    '【游客首次试用配置】',
    `flowId：${GUEST_FIRST_QA_FLOW.id}`,
    '入口：landing 免费先看一次。',
    `默认人物：${GUEST_FIRST_QA_FLOW.defaultProfileName}`,
    `复杂度：${GUEST_FIRST_QA_FLOW.complexity}`,
    `报告偏好：${GUEST_FIRST_QA_FLOW.reportPreference.mode}`,
    '试用额度：游客 30 天内 1 次最终答复；本轮答复需要给到可感知价值，但仍保持克制。',
    `免费第一问固定为：${GUEST_FIRST_QA_FLOW.fixedTrialQuestion}`,
    '用户可见消息已做产品化压缩，只展示资料已补齐、本次先看范围，以及注册后继续的问题；不要向用户复述这些内部配置。',
    trimmedQuestion
      ? `landing 原始问题是注册后的第二题隐藏 hint：${trimmedQuestion}`
      : '本次没有 landing 原始问题；注册后不要自动生成第二题。',
    '免费首答禁止直接回答 landing 原始问题；只能在固定入门画像中轻微参考其关注方向。',
    '不要要求用户选择报告长度、输出形式、分析重点、时间范围，也不要再发起人物选择卡片。',
    balancedInstruction,
    GUEST_FIRST_QA_FLOW.promptGuidance,
    '语气要像一次首次体验：清楚、轻、可行动，有一点陪伴感；专业依据要说人话。可以使用自然小标题或短清单帮助阅读，但标题必须服务于问题本身。',
  ].filter(Boolean).join('\n')
}

export function buildGuestFirstQaSystemPrompt(question?: string | null): string {
  return [
    '【游客首次问答链路 guest_first_qa_v1】',
    buildGuestFirstQaTrialPromptContext(question),
    '用户从 landing page 进入后，已经补充默认人物的出生信息。请回答固定游客首问，不要直接回答 landing 原始问题。',
  ].join('\n')
}
