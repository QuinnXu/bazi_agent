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
      homeTitle: '初次相逢，听听八字如何定义「我」',
      badge: '免费先看一次',
      headlineLead: '先免费认识「我」，',
      headlineAccent: '小象带路。',
      description: '你可以先留下想问的问题。补完「我」的人物信息后，小象先给一次入门画像；注册后保存记录，并继续深入刚才的问题。',
      primaryCta: '免费先看一次',
      secondaryCta: '登录保存',
      inputPlaceholder: '随便跟小象聊聊你的困惑，比如：我最近总是很焦虑，适合做什么？',
      trialPoints: ['一次入门画像', '问题注册后继续', '保存后深入追问'],
      finalCtaEyebrow: 'Free trial',
      finalCtaTitle: '不确定从哪开始，就先让小象认识「我」。',
    },
    assistantIntro: '',
    profileCardTitle: '结缘档案：留下您降生这世界的时刻',
    profileCardMessage: (_question: string) =>
      '小象已将您的疑问珍藏。初次相识，为了证明小象的能力，我们先为您免费排一次【本命底色预测】。如果您觉得说得到位，稍后我们再来解开心中的结。',
    profileSubmitLabel: '排盘起卦，看小象解析',
    trialRequestVisibleText: '命盘已备好，请小象为我展开第一份「本命入门录」。',
    trialAnswerOpening: '命盘已铺开，八字流转。这是小象为您解析的第一份「本命入门录」。',
    postTrialComposerPlaceholder: '入阁后，小象会先回答你最初的问题',
    registrationHookButton: '立即入阁，继续深聊',
    registrationHookMessage: (question?: string | null) => {
      const trimmed = question?.trim()
      return trimmed
        ? `命理浩瀚，以上只是冰山一角。您之前留下的问题是『${trimmed}』。想要立刻让小象解答，并永久保存您的本命手札吗？`
        : '命理浩瀚，以上只是冰山一角。想要立刻让小象解开心中的结，并永久保存您的本命手札吗？'
    },
    trialSummaryTopic: '性格底色、过去经历、当下阶段',
    deferredQuestionLabel: (question: string) =>
      `已收到你的问题，注册后继续深入：「${question}」`,
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
    `请为「${profileName || GUEST_FIRST_QA_FLOW.defaultProfileName}」铺开命盘，写下第一份「本命入门录」。`,
    `请先解析：${GUEST_FIRST_QA_FLOW.copy.trialSummaryTopic}。`,
    `报告必须直接以这句话开场，前面不要添加标题或说明：“${GUEST_FIRST_QA_FLOW.copy.trialAnswerOpening}”`,
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
  return question.trim()
}

export function buildGuestFirstQaTrialPromptContext(question?: string | null): string {
  const balancedInstruction = getAgentReportPreferenceInstruction(GUEST_FIRST_QA_FLOW.reportPreference)
  const trimmedQuestion = question?.trim()
  return [
    '【游客首次试用配置】',
    `flowId：${GUEST_FIRST_QA_FLOW.id}`,
    '入口：首页固定免费试用。',
    `默认人物：${GUEST_FIRST_QA_FLOW.defaultProfileName}`,
    `复杂度：${GUEST_FIRST_QA_FLOW.complexity}`,
    `报告偏好：${GUEST_FIRST_QA_FLOW.reportPreference.mode}`,
    '试用额度：游客 30 天内 1 次最终答复；本轮答复需要给到可感知价值，但仍保持克制。',
    `免费第一问固定为：${GUEST_FIRST_QA_FLOW.fixedTrialQuestion}`,
    '用户可见消息已做产品化压缩；不要向用户复述这些内部配置。',
    trimmedQuestion
      ? `首页原始问题是注册后的第二题隐藏 hint：${trimmedQuestion}`
      : '本次没有首页原始问题；注册后不要自动生成第二题。',
    '免费首答禁止直接回答首页原始问题；只能在固定入门画像中轻微参考其关注方向。',
    `最终报告必须直接以“${GUEST_FIRST_QA_FLOW.copy.trialAnswerOpening}”开场；这句话之前不要输出标题、寒暄、序号或其他文字。`,
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
    '用户从首页固定试用入口进入后，已经补充默认人物的出生信息。请回答固定游客首问，不要直接回答首页原始问题。',
  ].join('\n')
}
