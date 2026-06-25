import type { AgentReportPreference } from '@/lib/agent-complexity'

export const GUEST_FIRST_QA_FLOW = {
  id: 'guest_first_qa_v1',
  legacyIds: ['onboarding'],
  requestPrefix: 'guest-first-qa-profile',
  legacyRequestPrefixes: ['guest-onboarding-profile'],
  defaultProfileName: '我',
  complexity: 'instant',
  reportPreference: { mode: 'concise' } as AgentReportPreference,
  copy: {
    assistantIntro:
      '我先把这次分析的默认人物设为「我」。补完出生信息后，我会直接回答你刚才的问题，并重点看过去经历、当下状态和下一步行动。',
    profileCardTitle: '先建立「我」的人物信息',
    profileCardMessage: (question: string) =>
      `首页问题：「${question}」\n先补「我」的出生信息，小象会直接开始分析。`,
    profileSubmitLabel: '创建「我」并继续分析',
    authHintTitle: {
      collecting: '先补「我」的人物信息',
      completed: '注册后保存并继续原问题',
    },
    authHintDescription: {
      collecting: '小象会默认使用人物「我」来分析。完成资料后会直接给出简洁结论。',
      completed: '这次试用已经完成。登录或注册后，小象会把这段记录写入正式会话，并自动接着你在首页输入的问题继续回答。',
    },
  },
  responseFormat: [
    '一句话结论：先给清晰判断，不铺垫。',
    '过去经历：指出可能反复出现的惯性、经验或内在模式。',
    '当下状态：结合当前阶段的现实约束、机会和风险。',
    '下一步行动：给 2-3 条可以马上执行的小建议。',
    '继续深入：用一句自然邀请，引导注册后保存记录并继续细看。',
  ],
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
  question: string,
  profileName: string = GUEST_FIRST_QA_FLOW.defaultProfileName,
): string {
  return [
    `继续回答我刚才从首页带来的问题：「${question}」`,
    `我已经补好了默认人物「${profileName || GUEST_FIRST_QA_FLOW.defaultProfileName}」的出生信息。`,
    '请直接给出简洁、结构化的结论。',
    `固定回复结构：\n${GUEST_FIRST_QA_FLOW.responseFormat.map((item, index) => `${index + 1}. ${item}`).join('\n')}`,
  ].join('\n')
}

export function buildGuestFirstQaPostRegistrationPrompt(question: string): string {
  return [
    '我已经登录并保存了刚才的试用对话。',
    `请继续追问并回答我在首页输入的原问题：「${question}」`,
    '这次继续沿用刚才的人物信息，保持简洁结构化。',
    `固定回复结构：\n${GUEST_FIRST_QA_FLOW.responseFormat.map((item, index) => `${index + 1}. ${item}`).join('\n')}`,
  ].join('\n')
}

export function buildGuestFirstQaSystemPrompt(question?: string | null): string {
  return [
    '【游客首次问答链路 guest_first_qa_v1】',
    `默认人物：${GUEST_FIRST_QA_FLOW.defaultProfileName}`,
    '用户从 landing page 输入问题后，已经补充默认人物的出生信息。请直接回答原问题，不要要求用户选择报告长度、输出形式、分析重点、时间范围，也不要再发起人物选择卡片。',
    '语气要像一次首次体验：清楚、轻、可行动，有一点陪伴感，但不要写成长篇报告。',
    '必须使用下面的固定结构，并保留这些小标题：',
    ...GUEST_FIRST_QA_FLOW.responseFormat.map((item, index) => `${index + 1}. ${item}`),
    question ? `landing 原始问题：${question}` : null,
  ].filter(Boolean).join('\n')
}
