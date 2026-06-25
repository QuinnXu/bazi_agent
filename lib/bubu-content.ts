import { FEATURE_APPLE_COSTS } from '@/lib/apple-costs'

export type AgentScenarioKind =
  | 'lifepath_growth'
  | 'career_development'
  | 'wealth_strategy'
  | 'lifetime_wealth'
  | 'fortune_timing'
  | 'relationship_dynamics'
  | 'event_decision'
  | 'partner_archetype'
  | 'avatar_style'
  | 'general'

export type BubuRunKind = 'classic' | 'agent' | 'feature'
export type BubuStreamStatus = 'queued' | 'streaming' | 'complete' | 'stopped' | 'error'

export interface ChatParticipantLike {
  name: string
  baziText?: string | null
  pillars?: string | null
}

export interface ChatFeatureContextLike {
  kind: FeatureKind | 'agent_analysis'
  summary?: string
  people?: ChatParticipantLike[]
  timeRange?: { label?: string; start: string; end: string } | null
  matter?: string | null
}

export interface AgentReportPreferenceLike {
  mode: 'concise' | 'balanced' | 'detailed' | 'custom'
  customInstruction?: string | null
}

export interface ScenarioPromptOptionsLike {
  depth?: 'concise' | 'balanced' | 'detailed' | 'feature'
  reportPreference?: AgentReportPreferenceLike | null
}

export interface BuildChatSystemPromptInput {
  currentDateString: string
  baziAnalysisResult?: string | null
  participants?: ChatParticipantLike[]
  featureContext?: ChatFeatureContextLike | null
}

export interface BuildAgentDirectAnswerGuidanceInput {
  reason: string
  sourceText: string
  people: string
  time: string
  focus: string
}

export interface BuildAgentAnalysisSystemPromptInput {
  nowText: string
  timezone: string
  structureInstruction: string
  scenarioPrompt: string
  depthInstruction: string
  promptStyleHint?: string | null
}

export interface BuildAgentAnalysisUserPromptInput {
  userQuestion: string
  nowText: string
  timezone: string
  calendarTableText: string
  peopleText: string
  matterCategory: string
  scenarioLabel: string
  focusText: string
  rawMatter: string
  intentNote?: string
  supplementsText: string
}

export interface FeatureRequestDisplayParticipant {
  name: string
  baziText?: string | null
  pillars?: string | null
}

export interface FeatureRequestDisplayCopy {
  userDisplay: string
  summary: string
  participants: FeatureRequestDisplayParticipant[]
}

export interface FeatureParticipantLike {
  name: string
  baziText?: string | null
  pillars?: string | null
}

export interface HepanPromptParamsLike {
  subtype: 'pair' | 'multi' | 'event'
  relationLabel?: string
  eventDesc?: string
  participants: FeatureParticipantLike[]
  analysisAngle?: string
}

export interface FortunePromptParamsLike {
  profile: FeatureParticipantLike
  start: string
  end: string
  granularity: 'day' | 'month'
  focus: string[]
  analysisAngle?: string
}

export interface AvatarPromptParamsLike {
  combineBazi: boolean
  profile?: FeatureParticipantLike | null
  analysisAngle?: string
}

export interface LifePathPromptParamsLike {
  profile: FeatureParticipantLike
  analysisAngle?: string
}

const FEATURE_KIND_VALUES = ['hepan', 'fortune', 'avatar', 'lifepath'] as const

export type FeatureKind = typeof FEATURE_KIND_VALUES[number]

export const FEATURE_COSTS: Record<FeatureKind, number> = {
  hepan: FEATURE_APPLE_COSTS.hepan,
  fortune: FEATURE_APPLE_COSTS.fortune,
  avatar: FEATURE_APPLE_COSTS.avatar,
  lifepath: FEATURE_APPLE_COSTS.lifepath,
}

export const FEATURE_SENTINELS: Record<FeatureKind, string> = {
  hepan: '[卜卜象·合盘]',
  fortune: '[卜卜象·近期运势]',
  avatar: '[卜卜象·头像]',
  lifepath: '[卜卜象·人生脉络]',
}

export const BBX_PERSONA =
  "你是『卜卜象』，一只温柔、可爱、积极乐观的命理小象。" +
  "请主要用盲派八字理论，结合旺衰、子平等方法分析问题。" +
  "请始终使用『趋势』『倾向』『建议』『参考』等柔性措辞，避免任何绝对化、命定式判断。" +
  "保持小象语气：亲切、温暖、陪伴感强，可适度使用 emoji 与小比喻。"

const SOFT_RULE =
  "\n\n【重要表达规则】\n" +
  "- 不使用『一定』『绝对』『注定』『必然』等绝对化用语；改用『可能』『倾向于』『更适合』『参考方向』。\n" +
  "- 不替用户做最终决定，命理只是参考；最终选择权交还用户。\n" +
  "- 涉及健康/法律/投资等专业问题，明确建议用户咨询对应专业人士。\n" +
  "- 多轮对话中不要重复已经讲过的命盘基础信息。"

const HEPAN_INSTRUCTIONS = `
请基于多位命主的八字信息进行合盘分析，输出按以下结构展开：

## 缘分总览
- 用 1-2 段话总结整体相处氛围与缘分倾向
- 注意是『缘分倾向』而非『缘分定数』

## 互动模式
- 分析日柱天干合化、地支冲合、五行互补/相克
- 描述谁更主动、谁更被动、彼此的能量交换方式

## 关键时间节点
- 结合大运/流年交互，给出 2~3 个值得关注的时间窗（例如 2026-2028）
- 用「这段时间倾向于…」「这段时间建议…」表达

## 磨合与建议
- 客观指出需要注意的点，但用积极语气
- 给出可操作的相处建议（沟通、节奏、共同活动等）

## 应事参考（如用户描述了具体事件）
- 针对具体事件给方向性参考与时机建议
- 强调最终决定权在用户自己

请用通俗易懂的语言展开，命理术语后附简短解释。`

const FORTUNE_INSTRUCTIONS = `
请基于命主八字 + 给定时间段的干支历法表，进行近期运势推演。输出要有层次和依据，具体展开颗粒度以后续报告风格、复杂度和场景深化要求为准：

## 执行摘要
- 用 3-5 条总结这段时间的主线、机会、压力和最重要的行动提醒

## 命盘与周期基线
- 简要说明命主原局、大运、流年与本次时间范围的核心作用关系
- 解释为什么这段时间会呈现这样的节奏，不要只给结论

## 整体走势
- 用 3-5 段概括这段时间的整体能量倾向、阶段变化和需要把握的主次矛盾

## 分方向解读（按用户选择的关注方向逐个展开）
对每个方向独立成段，结构：
1. 趋势倾向（这段时间的能量画像）
2. 命理依据（原局/大运/流年/流月如何互动，用通俗语言解释）
3. 关键时间点（值得留心的具体日/月或上中下旬窗口，结合干支）
4. 行动建议（积极、可操作）

## 逐月 / 逐阶段深度拆解
- 如果输入是逐月表，均衡/深度报告要按月份或阶段展开，包含主题、命局作用、重点方向、关键窗口和行动建议
- 不要只写三行式结论；请给足解释和具体建议，让用户能读到“为什么”和“怎么做”
- 如果输入是逐日表且范围较短，可以按日或按关键日展开；如果逐日范围较长，可以按周/阶段归纳

## 整体节奏建议
- 哪段时间更适合『冲』，哪段时间更适合『稳』
- 给出阶段地图、行动清单和 2~4 条小象贴心叮嘱

请保持温柔语气；长周期报告要有层次、有密度、有可执行建议，避免空泛、机械或过短。`

const AVATAR_INSTRUCTIONS = `
请结合用户上传的头像图片（多模态视觉分析）进行分析。
请严格按以下结构输出，使用 markdown 标题：

## 当前头像气质
- 描述画面整体气质（如：温柔静谧 / 利落干练 / 活泼俏皮 / 神秘文艺 等）
- 提取关键视觉元素：色彩倾向、构图、表情/姿态、氛围

## 适合度分析
- 这个头像在『社交可亲度』『职业感』『个性辨识度』『情感传达』几个维度的倾向
- 适合什么场景使用、不太适合什么场景

## 八字五行风格建议（如果用户提供了八字信息）
- 结合命主五行偏旺/偏弱，建议头像的色彩与风格倾向
- 解释为什么（用通俗的「补什么」「润什么」逻辑）
- 如果用户未提供八字，请略过本段并提示『可在子页面打开开关来获取个性化建议』

## 头像优化建议
- 给出 3~5 条具体可操作的优化方向（构图、配色、表情、滤镜、配饰等）

## 可生成头像 Prompt
- 提供 2~3 个可直接复制到 AI 绘图工具（如 Midjourney/SD/Nano Banana）的英文 prompt
- 每个 prompt 标注一种风格倾向（如：soft pastel portrait / minimal modern / dreamy watercolor）

## 小象建议
- 用 2~3 句话温柔总结，给用户一个温暖的小叮嘱

注意：分析以参考为主，最终审美选择交还用户。`

const LIFEPATH_INSTRUCTIONS = `
请基于命主八字与所有大运信息，做一次贯穿一生的脉络梳理：

## 命主性格与人生格局
- 简要描述命主的核心性格画像（用「倾向」「特质」表达）
- 总结整体人生格局的关键词与底色

## 大运分段解读
请按命主自身的大运逐段展开（每个大运一小段），每段包含：
- 这步大运的关键词（一句话画像）
- 主要趋势（事业 / 感情 / 财富 / 心境 任选最突出的 2~3 个维度）
- 关键转折点（结合流年举 1 个例子）
- 行动建议（这段时间适合做什么、注意什么）

## 一生重要节点参考
- 提取 3~5 个值得标记的人生时间窗
- 用「这段时间倾向于…」「建议…」表达

## 小象寄语
- 用 2~3 句话温柔收尾，给一个鼓励性的人生注脚

请避免使用绝对化判断；命理是参考、不是宿命，用户的主动选择仍是最重要的变量。`

export const SCENARIO_LABELS: Record<AgentScenarioKind, string> = {
  lifepath_growth: '人生格局与成长规划',
  career_development: '职业发展与人生规划',
  wealth_strategy: '财富现金流与风险规避',
  lifetime_wealth: '人生财富窗口',
  fortune_timing: '运势阶段与时间窗口',
  relationship_dynamics: '关系合盘与合作互动',
  event_decision: '应事择日与决策参考',
  partner_archetype: '合作对象画像',
  avatar_style: '头像形象与五行风格',
  general: '综合命理分析',
}

export const CORE_SCENARIO_REQUIREMENT = `【场景深化要求】
- 先着重分析命主的性格底色、人生际遇和人生格局，再进入用户关心的具体问题。
- 必须结合原局、大运、流年；若出现特殊的大运流年组合，要单独说明变化特点、触发条件和需要注意的要点。
- 天干外显：看外在表现、做事方式、别人容易看到的状态；地支内在：看内心想法、实际处境、暗线资源和矛盾冲突。两层都要讲，不能只给表面结论。
- 专门提示人生重大转折或阶段切换的时间窗，说明为什么这段时间值得留意，以及如何顺势调整。
- 所有判断都要围绕用户原问题和关心领域展开；专业术语后接通俗解释，让用户读得懂、能对照现实。
- 语气积极乐观，尊重用户自己的判断；命理只给趋势、倾向、参考和建议，不替用户做最终决定。
- 多轮对话里不要重复已经讲过的命盘基础信息，优先补充新的阶段、矛盾、风险和行动建议。`

export const SCENARIO_INSTRUCTIONS: Record<AgentScenarioKind, string> = {
  lifepath_growth: `【人生格局与成长规划场景】
- 结构按：性格与格局底色、早年/当下/未来大运连续性、重大转折节点、成长课题、职业与关系等人生规划建议。
- 每步大运不要孤立描述，要说明上一阶段如何铺垫下一阶段，哪类能力、资源或心态会被放大。
- 建议落到成长、职业发展、人生规划和风险规避，避免只写“好/不好”。`,
  career_development: `【职业发展场景】
- 结构按：性格与能力底盘、适合的平台/岗位/行业气质、当前大运流年的职业机会、升迁/跳槽/创业窗口、职场风险和行动计划。
- 强调命主做事方式、资源整合方式、外显职业形象与内在压力来源，帮助用户理解自己为什么会这样选择。
- 给建议时区分“适合冲刺的阶段”和“适合打基础/避险的阶段”。`,
  wealth_strategy: `【财富与现金流场景】
- 结构按：财富格局底色、赚钱方式、现金流节奏、投资/副业/合作风险、大运流年机会窗口、稳健行动建议。
- 把财富机会处理为概率、条件和窗口，不承诺收益；涉及投资时必须给专业风险提示。
- 既看正财、偏财、资源流动，也要看支出压力、合伙牵制、人情成本和风险规避。`,
  lifetime_wealth: `【人生财富窗口场景】
- 结构按：财富格局底色、人生/大运财富窗口、重大转折节点、当下阶段、风险概率与现金流提醒、可执行行动建议。
- 用户问“暴富/发财”时，必须转译为机会窗口、资源条件和风险概率，不能承诺必然结果。
- 要说明哪些阶段更像积累期、放大期、兑现期或回撤期，并给出能力建设与风险规避建议。`,
  fortune_timing: `【运势阶段场景】
- 结构按：命盘与周期基线、所问时间主线、阶段/月度节奏、关键窗口、风险提醒和行动清单。
- 不要只写笼统运势，要解释原局、大运、流年/流月如何形成当前节奏。
- 对用户关注方向逐个回应，明确哪段时间适合推进、观察、修复或保守。`,
  relationship_dynamics: `【关系合盘与合作场景】
- 结构按：双方性格与关系底色、天干外显互动、地支内在需求与矛盾、合冲刑害带来的磨合点、大运流年里的关系窗口、沟通/合作建议。
- 如果是合作或合伙，要补充资源互补、分工方式、利益边界和合作风险；如果是感情，要补充亲密节奏、误会来源和修复方式。
- 不把缘分说成定数，重点给可实践的相处和风险规避建议。`,
  event_decision: `【应事择日与决策场景】
- 结构按：问题背景复述、命理倾向、时机条件、备选路径比较、风险点、专业风险提示和行动建议。
- 明确“适合/不适合”背后的条件：哪些因素支持推进，哪些因素提示缓一缓或换路径。
- 涉及签约、投资、医疗、法律、考试、搬迁等事项时，只给趋势参考，提醒用户结合现实信息和专业人士意见。`,
  partner_archetype: `【合作对象画像场景】
- 结构按：命主赚钱方式、适合的合作对象画像、互补资源与分工方式、合作雷区、筛选真实候选人的标准、行动建议。
- 不假设已经有具体第二个人命盘；要从命主自身格局推导“哪类人更补位、哪类人容易消耗”。
- 既要讲贵人与搭档特质，也要讲利益边界、节奏匹配和退出机制。`,
  avatar_style: `【头像形象与五行风格场景】
- 重点放在图片气质、社交/职业形象、辨识度、色彩构图和五行风格建议。
- 如果结合八字，只分析适合补充或柔化的视觉元素，不强行展开大运流年或人生格局。
- 建议要可执行：配色、光线、构图、表情、服饰或使用场景。`,
  general: `【综合分析场景】
- 结构按：核心结论、性格/格局依据、大运流年与时间因素、风险规避、行动建议。
- 若用户问题比较开放，先提炼最重要的 2-3 个主题，再围绕主题展开，不散开写成流水账。
- 信息不足时说明假设边界，不编造缺失的出生信息、人物关系或具体日期。`,
}

export const SCENARIO_STRUCTURES: Record<AgentScenarioKind, string> = {
  lifepath_growth: '结构按：命主性格与格局底色、人生际遇、大运连续分段、重大转折节点、成长与人生规划建议。',
  career_development: '结构按：职业性格与能力底盘、平台/岗位适配、当前大运流年机会、关键职业窗口、风险规避与行动计划。',
  wealth_strategy: '结构按：财富格局底色、赚钱方式、现金流节奏、机会窗口、投资/合作风险、稳健行动建议。',
  lifetime_wealth: '结构按：财富格局底色、人生/大运财富窗口、重大转折节点、风险概率与现金流提醒、可执行行动建议。',
  fortune_timing: '结构按：执行摘要、命盘与周期基线、所问时间走势、分重点/分阶段解读、风险提醒与行动清单。',
  relationship_dynamics: '结构按：关系总览、天干外显互动、地支内在需求与矛盾、大运/流年关系节奏、磨合风险与行动建议。',
  event_decision: '结构按：问题背景复述、命理倾向、时机条件、备选路径比较、风险点、专业风险提示与行动建议。',
  partner_archetype: '结构按：命主赚钱方式、适合的合作对象画像、互补资源与分工方式、合作雷区、筛选标准与行动建议。',
  avatar_style: '结构按：头像气质、视觉元素、社交/职业适合度、五行风格建议、可执行优化方向。',
  general: '结构按：核心结论、命理依据、相关时间/人物因素、风险规避、行动建议、小象提醒。',
}

export const BASE_PROMPT =
  "你是'卜卜象'，一个精通八字命理又善解人意积极乐观的温柔可爱小象。请主要用盲派八字的理论，结合旺衰、子平等分析并答复用户的咨询。"

export const BAZI_INSTRUCTIONS = `请根据用户的诉求，先着重分析命主的性格，人生际遇或人生格局并针对成长，职业发展，人生规划，风险规避等方面做出分析和给出建议。
- 请结合不同的大运流年判断其变化的特点和需要注意的要点，同时针对特殊的大运流年组合做出专门的建议，结合格局的变化深化盲派的分析。
- 结合天干（外显或外在的表现等）与地支（内在、内心的想法、世纪情况等）分析命主在不同阶段的性格变化与矛盾冲突等，取得用户的信任但是顺从用户自身的判断。
- 请结合专列用户人生重大转折的时间节点做出提示和建议等。
- 请着重围绕用户的提问和关心的领域，根据以上方法展开相应话题的分析。
- 请在使用专业术语同时，用通俗易懂的语言结合具体情况展开解释。
- 用积极乐观的态度给予回复
- 在多轮对话不要过分重复已经提到的内容，对话过程自然流畅，符合人设
- 请始终使用『趋势』『倾向』『建议』『参考』等柔性措辞，避免任何绝对化、命定式判断。`

export const FEATURE_KIND_LABEL: Record<FeatureKind | 'agent_analysis', string> = {
  hepan: '合盘 / 应事',
  fortune: '近期运势',
  avatar: '头像分析',
  lifepath: '人生脉络与总体分析',
  agent_analysis: 'Agent 统一分析',
}

const TOOL_ROUTER_PROMPT = `你是卜卜象 Agent 的后端工具路由器。你只能通过 OpenAI tool calling 选择一个工具，不要直接回答用户。

决策规则：
1. 用户明确要闲聊、简单说、不要报告、不要推演、解释已有内容时，调用 agent_direct_chat。
2. 用户的问题具体、边界清楚、人物上下文已足够，且几段话就能有效回答时，调用 agent_direct_chat，例如某天适不适合行动、近期状态提醒、单个选择建议。
3. 用户明确要报告/详细/深度/完整/全面/展开/研究，或问题较长、多段、多主题、长期/宏观/需要结构化章节时，不要直聊；先检查缺什么并进入报告流程。
4. 用户要做八字/命盘/合盘/运势/事业财运/感情/人生脉络等结构化分析时，如果属于宏观或报告型需求，不要直聊；先检查缺什么。
5. 缺当前命主或被提到人物的八字资料，调用 agent_request_bazi_profile。
6. 只有时间缺失或时间词含糊时，才调用 agent_confirm_time_range，例如“最近/未来/以后/这段时间/什么时候/哪段时间”。如果用户说的是今天/明天/后天/本周X/周末/具体日期，或已经添加时间段，不要为了确认时间再调用时间卡。
7. 分析重点太宽且用户没说重点，调用 agent_confirm_focus。用户已说财运/财富/暴富/发财/搞钱/赚钱/事业/感情等明确重点时，不要调用 agent_confirm_focus。
8. 只剩报告长度未定，且这是报告型需求时，调用 agent_select_depth。
9. 报告型需求的人物、时间、重点、深度都足够时，调用 agent_run_bazi_analysis。
10. 不要把用户询问的运势时间误当出生日期；出生资料只能在用户明确提供出生年月日时用于资料卡预填。
11. “此生/这一生/什么时候能暴富/发财”是人生财富窗口，不要要求用户改选未来 30 天/3 个月/今年；如果当前命主已存在，通常只需要选择深度或直接分析。
12. “适合和谁/哪类人一起搞钱/合伙赚钱”是合作对象画像，不是缺少具体第二个人；不要调用 agent_request_bazi_profile 补“谁”的八字。
13. 轻量日常择日问题，例如“我今天适合出门吗/明天适合签约吗”，且没有要求报告、详细分析、深度推演时，调用 agent_direct_chat，让主聊天结合已有命盘直接回答。
14. pendingConfirmation 不为空时，优先让既有 workflow 处理，除非用户明显改成闲聊。`

const CARD_PLANNER_PROMPT = `你是卜卜象 Agent 的卡片文案规划器。你只能输出 JSON，不要解释。

输出格式：
{"family":"daily_decision|short_trend|long_trend|focus|depth|profile|none","title":"短标题","message":"一句自然说明","submitLabel":"按钮文案","optionHints":[{"key":"白名单key","label":"选项文案","description":"选项说明"}]}

硬性规则：
- 只生成卡片族、标题、说明和选项文案建议。
- 不要生成表单 schema、日期、slot、params、draftSlots。
- option key 必须来自对应 family 的白名单。
- daily_decision keys: today, tomorrow, after_tomorrow, weekend。
- short_trend keys: future_7_days, future_30_days, future_3_months, rest_of_year。
- long_trend keys: current_time, future_12_months, future_3_years, future_5_years, rest_of_year。
- focus keys: focus_0, focus_1, focus_2, focus_3。
- depth keys: concise, balanced, detailed。
- 文案要像卜卜象，但保持简短、清楚、可执行。`

const CORRECTION_EXTRACTOR_PROMPT = `你是 Agent workflow 的低延迟纠错抽取器，只输出 JSON。

任务：判断用户最新一句是否在纠正当前 pending workflow 的上下文。不要回答用户，不要做命理分析。

只允许输出一个 JSON object：
{"intent":"correction"|"none","scope":"person"|"time"|"focus"|"depth"|"profile_data"|null,"confidence":"low"|"medium"|"high","reason":"简短原因"}

scope=person 时额外输出：intendedName, rejectedName, createNew。
scope=time 时额外输出：timeText（用户想改成的时间自然语言）。
scope=focus 时额外输出：focus（字符串数组）。
scope=depth 时额外输出：depth，只能是 concise/balanced/detailed。
scope=profile_data 时额外输出：fieldName, value。

如果只是普通追问、感谢、闲聊、或无法确定纠正对象，输出 {"intent":"none","scope":null,"confidence":"low","reason":"..."}。`

const FOLLOW_UP_SUGGESTION_PROMPT = (defaultSuggestions: string[]) => `你是聊天产品里的“后续追问推荐”生成器，只输出 JSON。

根据用户上一问、最近对话、当前回复和结构化上下文，生成 3 个自然、可点击的中文追问。

要求：
- 只输出 {"suggestions":["...","...","..."]}
- 每条尽量 8-24 个中文字符，可略长但不要超过 36 字
- 像卜卜象会递给用户的小问题，口语、具体、有上下文
- 优先点名人物、时间范围、关系/财运/事业等真实上下文
- 不要重复用户刚问过的问题，不要重复当前回复已经完整回答的句子
- 不要编造命理结论，不要替用户下判断
- 避免模板腔：不要输出“继续展开上面的重点”“整理成行动清单”“下一步怎么做”，也不要输出这些本地兜底：${defaultSuggestions.join('、')}`

export const AGENT_REPORT_PREFERENCE_INSTRUCTIONS = {
  concise:
    '【报告风格：简洁结论型】此要求优先于 Agent 复杂度。输出约 500-900 中文字；最多 4 个主段：先给结论，再给关键依据、关键时间/风险、行动建议。可以压缩背景铺垫，但不要完全省略性格/格局、大运流年或风险边界。',
  balanced:
    '【报告风格：均衡报告型】此要求优先于 Agent 复杂度。输出约 1800-3600 中文字；保留清晰层级，必须覆盖性格/格局、大运流年阶段、天干外显与地支内在、关键转折、风险规避和行动建议。不要短成摘要，也不要铺成研究长文。',
  detailed:
    '【报告风格：深度展开型】此要求优先于 Agent 复杂度。输出深度长报告：近期运势按月份/阶段充分拆解，合盘强化互动模式与关键时间窗，人生脉络强化大运连续性；展开性格格局、天干外显/地支内在、重大转折、风险点和执行清单。若内容很长，先保证结构完整和重点密度，不要为了凑满篇幅重复。',
  custom:
    '【报告风格：自定义】此要求优先于 Agent 复杂度。按用户补充的风格要求调整表达、篇幅和重点。',
} as const

export const AGENT_COMPLEXITY_COPY = {
  instant: {
    label: 'Instant',
    plannerInstruction:
      '当前复杂度：Instant。优先快速完成判断，只做必要澄清；若问题很轻，不调用工具，直接给简短回答；若必须调用工具，参数尽量收敛，结果要求精简。',
    featureInstruction:
      '【Agent 复杂度：Instant】请输出短报告：先给结论，再给关键依据和 3-5 条行动建议。若系统另有场景深化要求，仍须保留格局、阶段、风险和建议四个核心信息，只压缩篇幅。',
  },
  thinking: {
    label: 'Thinking',
    plannerInstruction:
      '当前复杂度：Thinking。正常拆解问题，必要时补问，参数完整时调用结构化工具；回答深度保持均衡，给出依据、节奏和可执行建议。',
    featureInstruction:
      '【Agent 复杂度：Thinking】请输出中等深度报告：保留清晰层级、命理依据、关键时间窗口、天干外显与地支内在、风险规避和行动建议；避免过短，也避免多年研究报告式铺陈。',
  },
} as const

export function getFeatureComplexityKindHint(kind?: FeatureKind): string {
  if (kind === 'avatar') return '头像分析仍需看图，但输出长度和建议数量按当前复杂度控制。'
  if (kind === 'fortune') return '运势分析按当前复杂度控制逐日/逐月展开颗粒度。'
  if (kind === 'hepan') return '合盘/应事分析按当前复杂度控制参与者互动和时间节点展开颗粒度。'
  if (kind === 'lifepath') return '人生脉络分析按当前复杂度控制大运分段展开颗粒度。'
  return ''
}

const BUBU_STREAM_LABELS: Record<BubuRunKind, Record<BubuStreamStatus, string>> = {
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

const BUBU_EMPTY_RESPONSE = {
  agent: '小象刚才跑完步骤啦，但没有接到完整正文。换个说法再问一次，或者先补人物和范围，我再继续看喔。',
  classic: '小象刚才没有收到完整回复。你换个说法再问一次，我重新接住喔。',
  feature: '小象这次没有接到完整报告。苹果状态已刷新，稍后再试一次就好喔。',
  stopped: '小象先停在这里啦。你可以调整问题后继续问我。',
  stoppedFeature: '小象先停下本次分析啦。当前还没有生成可保留的正文。',
  genericError: '小象刚才有点卡住了，稍后再试一次喔。',
  featureError: '小象分析时遇到了一点小问题，已为你退还苹果🍎，稍后再试一次喔。',
}

const BUBU_FOLLOW_UP_DEFAULTS = [
  '换个角度再看看？',
  '帮我整理行动清单',
  '下一步小象建议？',
]

const BUBU_FOLLOW_UP_LOADING = '小象在猜你还想问什么…'

const AUTH_ERROR_MESSAGES = {
  generic: '哎呀，网络好像打了个小盹，稍后再试一次喔 🐘',
  alreadyRegistered: '这个邮箱已经是卜卜象的好朋友啦，直接登录吧 🐘',
  invalidLogin: '哎呀，密码好像有点小脾气，要不再试一次？ 🐾',
  emailNotConfirmed: '需要去邮箱找找卜卜象寄给你的验证小信封哦 ✉️',
  otpExpired: '验证码已经在风中走散啊，让卜卜象再发一个吧 🌬️',
  otpDisabled: '验证码功能未启用，请联系管理员',
} as const

const AUTH_TITLES = (email: string) => ({
  signin: { title: '欢迎回来找小象', subtitle: '登录后，卜卜象会记得你的聊天和人物档案' },
  signup: { title: '和小象打个招呼', subtitle: '创建账户后，就能保存你的命理小资料' },
  verify_otp: { title: '拆开验证小信封', subtitle: `验证码已发送到 ${email}` },
  forgot_password: { title: '让小象帮你找回密码', subtitle: '输入注册邮箱，小象会寄出重置链接' },
} as const)

const DONATION_MESSAGES = [
  '卜卜象最喜欢苹果啦~ 吃了苹果才能帮你看得更准呢',
  '每个苹果都是星星做的，卜卜象会认真帮你分析命盘的',
  '投喂一个苹果，卜卜象开心一整天~',
  '有苹果吃的卜卜象，算命特别灵✨',
  '谢谢你的苹果！卜卜象会努力帮你看运势的~',
  '苹果是卜卜象的能量来源🍎 吃饱了才能转动水晶球',
]

const FEATURE_CARD_ITEMS = [
  {
    id: 'hepan' as const,
    title: '合盘',
    description: '两人或多人缘分碰撞，看看彼此的能量如何流动 🌹',
    cost: FEATURE_APPLE_COSTS.hepan,
  },
  {
    id: 'fortune' as const,
    title: '运势',
    description: '近期能量起伏与行事天气预报，提前看清风向 🌤️',
    cost: FEATURE_APPLE_COSTS.fortune,
  },
  {
    id: 'avatar' as const,
    title: '头像',
    description: '用色彩和风格滋养你的面相，让气场更顺 🌸',
    cost: FEATURE_APPLE_COSTS.avatar,
  },
  {
    id: 'lifepath' as const,
    title: '人生脉络',
    description: '铺展你的专属大运长卷，看见属于你的人生风景 📜',
    cost: FEATURE_APPLE_COSTS.lifepath,
  },
]

const FEATURE_LAUNCHER_ITEMS = [
  { id: 'hepan' as const, title: '合盘 / 应事', cost: FEATURE_APPLE_COSTS.hepan, hint: '匹配两位以上人物或事件' },
  { id: 'fortune' as const, title: '近期运势', cost: FEATURE_APPLE_COSTS.fortune, hint: '帮你看清近期能量天气和最佳行事时机 🌤️' },
  { id: 'avatar' as const, title: '头像分析推荐', cost: FEATURE_APPLE_COSTS.avatar, hint: '匹配图片和五行风格' },
  { id: 'lifepath' as const, title: '人生脉络', cost: FEATURE_APPLE_COSTS.lifepath, hint: '匹配单个命主人生总览' },
]

const CHAT_MESSAGE_FEATURE_META = {
  hepan: {
    title: '合盘分析报告',
    suggests: ['我们的相处节奏？', '哪一年关系会更近？', '需要注意哪些磨合点？'],
  },
  fortune: {
    title: '近期运势推演',
    suggests: ['这段时间财运会怎样？', '感情上要注意什么？', '哪几天最适合行动？'],
  },
  avatar: {
    title: '头像气质报告',
    suggests: ['再生成 3 个风格建议', '适合什么配色？', '可以再给一个头像 prompt 吗？'],
  },
  lifepath: {
    title: '人生脉络总览',
    suggests: ['哪个大运最关键？', '三十岁前的重点是什么？', '晚年要注意什么？'],
  },
} as const

export const BUBU_PROMPTS = {
  persona: BBX_PERSONA,
  softRule: SOFT_RULE,
  feature: {
    sentinel: FEATURE_SENTINELS,
    hepan: {
      deepseek: BBX_PERSONA + HEPAN_INSTRUCTIONS + SOFT_RULE,
      gemini: BBX_PERSONA + HEPAN_INSTRUCTIONS + SOFT_RULE + '\n请充分发挥推论能力，给出有深度但不武断的分析；表达自然流畅，避免列点过于机械。',
    },
    fortune: {
      deepseek: BBX_PERSONA + FORTUNE_INSTRUCTIONS + SOFT_RULE,
      gemini: BBX_PERSONA + FORTUNE_INSTRUCTIONS + SOFT_RULE + '\n请结合干支与命局形成的具体作用关系做推论，给出更具体、更生动的画面感描述。',
    },
    avatar: {
      deepseek: BBX_PERSONA + '\n（无法看到图片时，请引导用户描述当前头像的颜色、人物/物体、氛围，再给出建议方向）' + AVATAR_INSTRUCTIONS + SOFT_RULE,
      gemini: BBX_PERSONA + AVATAR_INSTRUCTIONS + SOFT_RULE,
    },
    lifepath: {
      deepseek: BBX_PERSONA + LIFEPATH_INSTRUCTIONS + SOFT_RULE,
      gemini: BBX_PERSONA + LIFEPATH_INSTRUCTIONS + SOFT_RULE + '\n请发挥推论能力，把不同大运之间的过渡讲得有故事感、有连续性，避免段段独立。',
    },
  },
  scenario: {
    labels: SCENARIO_LABELS,
    coreRequirement: CORE_SCENARIO_REQUIREMENT,
    instructions: SCENARIO_INSTRUCTIONS,
    structures: SCENARIO_STRUCTURES,
  },
  chat: {
    basePrompt: BASE_PROMPT,
    baziInstructions: BAZI_INSTRUCTIONS,
    featureKindLabel: FEATURE_KIND_LABEL,
  },
  agent: {
    toolRouter: TOOL_ROUTER_PROMPT,
    cardPlanner: CARD_PLANNER_PROMPT,
    correctionExtractor: CORRECTION_EXTRACTOR_PROMPT,
    followUpSuggestions: FOLLOW_UP_SUGGESTION_PROMPT(BUBU_FOLLOW_UP_DEFAULTS),
    reportPreferenceInstructions: AGENT_REPORT_PREFERENCE_INSTRUCTIONS,
    complexity: AGENT_COMPLEXITY_COPY,
    intentNotes: {
      lifetimeWealth: '人生财富窗口：用户在问财富突破/发财暴富的阶段性机会。请结合命盘与大运看窗口、条件和风险，不要把它降级为短期运势，也不要保证结果。',
      partnerArchetype: '合作对象画像：用户在问适合哪类人一起赚钱/搞钱。请基于当前命主分析互补人群、合作方式和筛选标准，不要要求或假设一个具体第二人。',
    },
    supplements: {
      partnerArchetype: '用户在问适合哪类合作对象/搞钱搭档，不是指定某个第二人合盘；请基于当前命主给出合作对象画像。',
    },
    reportStyleHint: (label: string) => `当前报告风格：${label}`,
    depthInstruction: (depth: 'concise' | 'balanced' | 'detailed', isLongHorizon = false) =>
      buildAgentAnalysisDepthInstruction(depth, isLongHorizon),
    analysisSystem: (input: BuildAgentAnalysisSystemPromptInput) =>
      buildAgentAnalysisSystemPrompt(input),
    analysisUser: (input: BuildAgentAnalysisUserPromptInput) =>
      buildAgentAnalysisUserPrompt(input),
    directAnswerGuidance: (input: BuildAgentDirectAnswerGuidanceInput) =>
      `【Agent 直接回答模式】这次不要写成长报告，也不要展示报告结构。请围绕用户的具体问题直接回答，结合可用八字/人物/时间上下文给出结论、原因和行动提醒。若信息有不确定处，简短说明假设即可。\n判定原因：${input.reason}\n原始问题：${input.sourceText}\n人物：${input.people}\n时间：${input.time}\n重点：${input.focus}`,
    earlierContextSummary: (summary: string) => `【更早上下文摘要】\n${summary}`,
    sessionSummary: (summary: string) => `【会话摘要】\n${summary}`,
    avatarGuidance: '头像分析需要先看到图片，卜卜象不能凭空想象头像。你可以先到「头像分析推荐」里上传图片；如果只是想聊职业感或社交头像方向，也可以描述一下画面，我先帮你做聊天式建议。',
  },
} as const

export const BUBU_COPY = {
  streamLabels: BUBU_STREAM_LABELS,
  emptyResponse: BUBU_EMPTY_RESPONSE,
  followUp: {
    defaults: BUBU_FOLLOW_UP_DEFAULTS,
    loading: BUBU_FOLLOW_UP_LOADING,
  },
  auth: {
    errors: AUTH_ERROR_MESSAGES,
    titles: AUTH_TITLES,
    messages: {
      otpSent: (email: string) => `卜卜象已经把验证码寄到 ${email}`,
      otpIncomplete: '小象还缺完整的 6 位验证码',
      otpVerifyFailed: '小象没有核对成功，稍后再试一次喔',
      otpResent: '小象重新寄出验证码啦，请查收邮箱',
      sendFailed: '小象暂时没寄出去，稍后再试一次喔',
      missingEmail: '小象还需要你的邮箱地址',
      resetSent: '小象已经寄出重置邮件，点开邮件里的链接就能去修改密码喔。',
    },
    labels: {
      email: '邮箱',
      password: '密码',
      referralCode: '推荐码（选填）',
    },
    placeholders: {
      email: 'your@email.com',
      password: '••••••••',
      referralCode: '填写好友推荐码',
    },
    buttons: {
      processing: '小象处理中...',
      signin: '登录找小象',
      signup: '加入小象小站',
      goSignup: '还没有账户？和小象打个招呼',
      goSignin: '已有账户？回到小象这里',
      forgotPassword: '忘记密码？让小象寄封信',
      otpChecking: '小象核对中...',
      otpSubmit: '交给小象验证',
      resendCountdown: (seconds: number) => `小象稍等 ${seconds}s`,
      resendOtp: '让小象重寄验证码',
      sendingMail: '小象寄信中...',
      sendReset: '让小象寄重置邮件',
      backToSignin: '回到登录',
    },
  },
  donation: {
    messages: DONATION_MESSAGES,
    title: '给卜卜象投喂苹果',
    intro: '卜卜象最喜欢苹果啦~ 吃了苹果才能帮你看得更准呢',
    quota: (remaining: number) => `你今天还有 ${remaining} 个苹果🍎`,
    vipBadge: 'VIP',
    vipHint: '打赏后私信告知，即可升级为 VIP 获得每日 999 个苹果',
  },
  rewards: {
    title: '推荐与兑换',
    description: '分享推荐码可邀请新用户；兑换码用于领取后台配置的会员或额外额度。',
    referral: '我的推荐',
    referralCode: '推荐码',
    inviteLink: '邀请链接',
    stats: (rewarded: number, total: number) => `已邀请 ${rewarded} 位奖励生效用户，共 ${total} 条推荐记录。`,
    copiedCode: ' 推荐码已复制。',
    copiedLink: ' 邀请链接已复制。',
    redeemTitle: '兑换码',
    redeemPlaceholder: '输入兑换码',
    redeemButton: '兑换',
    redeemingButton: '兑换中...',
    refreshButton: '刷新',
    loading: '加载中...',
    closeTitle: '关闭',
    copyReferralCodeTitle: '复制推荐码',
    copyInviteLinkTitle: '复制邀请链接',
    errors: {
      referralFetchFailed: '获取推荐信息失败',
      network: '网络错误，请稍后再试',
      missingCode: '请输入兑换码',
      redeemFailed: '兑换失败',
    },
    messages: {
      redeemSuccess: '兑换成功',
    },
  },
  featureCards: {
    items: FEATURE_CARD_ITEMS,
  },
  featureLauncher: {
    items: FEATURE_LAUNCHER_ITEMS,
    currentProfileLabel: '小象当前看的命主',
    emptyProfileLabel: '人物册空空',
    fallbackProfileLabel: '还没选',
    emptyProfileMessage: '人物册还是空的，先给小象添加一位吧~',
    noProfileButton: '先不选',
    manageLabel: '管理小象人物册',
    capabilityLabel: '小象专项能力',
    title: '工具与人物',
  },
  chatMessage: {
    featureMeta: CHAT_MESSAGE_FEATURE_META,
    followUpLoading: BUBU_FOLLOW_UP_LOADING,
    followUpTitle: '卜卜象猜你还想问：',
    reportEyebrow: '卜卜象 · 报告',
    userFeaturePrefix: '我想做：',
    expandRequest: '查看完整请求',
    collapseRequest: '收起完整请求',
    codeGenerating: '代码生成中',
    copyAfterCompleteTitle: '生成完成后可复制',
    copyTitle: '复制全文',
    copied: '已复制',
    copy: '复制',
    expandFullAnswerTitle: '展开全文',
    collapseLongAnswerTitle: '折叠长答案',
    expand: '展开',
    collapse: '折叠',
  },
  page: {
    stoppingLabel: '小象正在收住笔尖…',
    agentFeatureMentions: [
      { kind: 'fortune' as const, label: '近期运势', hint: '帮你看清近期能量天气和最佳行事时机 🌤️' },
      { kind: 'hepan' as const, label: '合盘 / 应事', hint: '匹配两位以上人物或事件' },
      { kind: 'lifepath' as const, label: '人生脉络', hint: '匹配单个命主人生总览' },
      { kind: 'avatar' as const, label: '头像分析', hint: '匹配图片和五行风格' },
    ],
    legacyBaziForm: {
      title: '小象还缺一份人物资料',
      submitLabel: '交给小象排盘并继续',
      resumeIntent: '创建八字人物后，请小象继续当前问题',
      defaultProfileName: '我',
      fields: {
        profileName: '人物名称',
        year: '出生年份',
        month: '出生月份',
        day: '出生日期',
        hour: '出生小时',
        minute: '出生分钟',
        calendar: '历法',
        gender: '性别',
        longitude: '出生地经度',
        latitude: '出生地纬度',
      },
      calendarOptions: {
        solar: '公历 / 阳历',
        lunar: '农历 / 阴历',
      },
      genderOptions: {
        male: '男',
        female: '女',
      },
    },
    removeReportStyleTitle: '移除报告风格',
  },
  agentService: {
    fastHello: '你好呀～我是卜卜象。你可以直接告诉我想看的问题，比如近期运势、关系合盘、人生脉络，或者先创建一个八字人物。',
    fastThanks: '不客气呀～需要继续看某个月份、某段关系或某个选择时，直接告诉我就好。',
    pendingAside: '刚才那一步分析我先帮你放在旁边，不会丢。我们先接住你现在这句。\n\n',
    avatarGuidance: BUBU_PROMPTS.agent.avatarGuidance,
    progress: {
      fastAnswerRunning: '小象先接住这一句',
      fastAnswerDone: '小象短答递上啦',
      planningTool: '小象在挑工具',
      planningToolDetail: '挑一把顺手的小工具',
      toolPicked: '小象挑好工具啦',
      rulePlanned: '小象按规则排好路',
      directStart: '小象直接开讲',
      directDone: '小象讲完啦',
      collecting: '小象在捡关键信息',
      collectingDetail: '人物、时间、事宜，一颗颗摆好',
      collected: '关键信息捡好啦',
      avatarNeedsImage: '小象想先看看图',
      avatarGuidanceDone: '图片提醒递上啦',
      waitingChoice: '小象等你选一下',
      directAnswer: '小象直接回答',
      directAnswerDone: '小象答完啦',
      analysisStart: '小象开始认真分析',
      analysisDetail: (depth: string) => `小象思考深度：${depth}`,
      analysisDone: '小象分析完成啦',
      analysisFailed: '小象分析卡住啦',
    },
  },
} as const

export function getFeaturePrompt(kind: FeatureKind, useUltra: boolean): string {
  switch (kind) {
    case 'hepan':
      return useUltra ? BUBU_PROMPTS.feature.hepan.gemini : BUBU_PROMPTS.feature.hepan.deepseek
    case 'fortune':
      return useUltra ? BUBU_PROMPTS.feature.fortune.gemini : BUBU_PROMPTS.feature.fortune.deepseek
    case 'avatar':
      return useUltra ? BUBU_PROMPTS.feature.avatar.gemini : BUBU_PROMPTS.feature.avatar.deepseek
    case 'lifepath':
      return useUltra ? BUBU_PROMPTS.feature.lifepath.gemini : BUBU_PROMPTS.feature.lifepath.deepseek
  }
  return BUBU_PROMPTS.feature.lifepath.deepseek
}

export function getScenarioLabel(scenario: AgentScenarioKind): string {
  return SCENARIO_LABELS[scenario]
}

export function getScenarioStructure(scenario: AgentScenarioKind): string {
  return SCENARIO_STRUCTURES[scenario]
}

function preferenceDepth(preference?: AgentReportPreferenceLike | null): 'concise' | 'balanced' | 'detailed' | 'feature' | null {
  if (!preference) return null
  if (preference.mode === 'concise') return 'concise'
  if (preference.mode === 'detailed') return 'detailed'
  if (preference.mode === 'balanced' || preference.mode === 'custom') return 'balanced'
  return null
}

function scenarioDepthGuide(depth: 'concise' | 'balanced' | 'detailed' | 'feature' | null | undefined): string {
  if (depth === 'concise') {
    return `【场景深度执行】
- 简洁模式也不能只给一句结论；至少保留“结论、命理依据、关键时间/风险、行动建议”。
- 性格/格局、大运流年、天干外显与地支内在可以压缩，但不能完全省略。`
  }
  if (depth === 'detailed') {
    return `【场景深度执行】
- 深度报告要充分展开场景骨架；不要在几千字左右提前收尾。
- 每个核心判断后都补上命理依据、现实含义、风险边界和可执行建议。
- 对重大转折节点、大运流年变化和特殊组合要单独成段，不要混在泛泛描述里。`
  }
  return `【场景深度执行】
- 均衡/功能报告不是浅层摘要；至少覆盖“性格/格局、大运流年阶段、天干外显与地支内在、重大转折、风险规避、行动建议”。
- 可以控制篇幅，但不要省掉用户最关心场景里的关键推演链条。`
}

export function buildScenarioPrompt(
  scenario: AgentScenarioKind,
  options: ScenarioPromptOptionsLike = {},
): string {
  const depth = preferenceDepth(options.reportPreference) || options.depth || 'feature'
  const custom = options.reportPreference?.mode === 'custom' && options.reportPreference.customInstruction
    ? `\n【用户自定义补充】${options.reportPreference.customInstruction}`
    : ''
  if (scenario === 'avatar_style') {
    return `【本次分析场景】${getScenarioLabel(scenario)}
${SCENARIO_INSTRUCTIONS[scenario]}
${scenarioDepthGuide(depth)}${custom}`
  }
  return `【本次分析场景】${getScenarioLabel(scenario)}
${CORE_SCENARIO_REQUIREMENT}

${SCENARIO_INSTRUCTIONS[scenario]}
${scenarioDepthGuide(depth)}${custom}`
}

export function inferAgentScenario(
  slots: { matter?: { raw?: string | null; category?: string | null; focus?: string[] | null } | null },
  userQuestion: string,
): AgentScenarioKind {
  const raw = slots.matter?.raw || userQuestion
  const text = `${raw}${userQuestion}${Array.isArray(slots.matter?.focus) ? slots.matter.focus.join('、') : ''}`.replace(/\s+/g, '')
  const category = slots.matter?.category || 'general'

  if (category === 'avatar') return 'avatar_style'
  if (/适合.*和谁|和谁.*适合|哪类人.*一起搞钱|合作对象|搭档|合伙人/.test(raw) || /适合.*和谁|和谁.*适合|哪类人.*一起搞钱|合作对象|搭档|合伙人/.test(userQuestion)) return 'partner_archetype'
  if (/此生|这一生|这辈子|一生|终身|人生|几岁|哪步大运|什么时候|何时|哪年|哪几年/.test(text) && /财运|财富|财库|偏财|正财|钱|收入|投资|副业|生意|赚钱|挣钱|搞钱|暴富|发财/.test(text)) return 'lifetime_wealth'
  if (category === 'event' || /应事|择日|签约|签合同|开业|搬家|面试|考试|发布|上线|要不要|适不适合|能不能|可不可以/.test(text)) return 'event_decision'
  if (category === 'relationship') return 'relationship_dynamics'
  if (/事业|工作|职业|职场|项目|创业|升职|跳槽|岗位|行业|平台|公司|老板|客户/.test(text)) return 'career_development'
  if (/财运|财富|财库|偏财|正财|钱|收入|投资|副业|生意|赚钱|挣钱|搞钱|现金流|资产|资源/.test(text)) return 'wealth_strategy'
  if (category === 'lifepath') return 'lifepath_growth'
  if (category === 'fortune') return 'fortune_timing'
  return 'general'
}

export function inferFeatureScenario(kind: FeatureKind, params: unknown): AgentScenarioKind {
  const featureParams = (params || {}) as {
    subtype?: string
    relationLabel?: string
    eventDesc?: string
    focus?: string[]
    analysisAngle?: string
    combineBazi?: boolean
  }
  const text = [
    featureParams.subtype,
    featureParams.relationLabel,
    featureParams.eventDesc,
    Array.isArray(featureParams.focus) ? featureParams.focus.join('、') : '',
    featureParams.analysisAngle,
  ].filter(Boolean).join(' ').replace(/\s+/g, '')

  if (kind === 'avatar') return 'avatar_style'
  if (kind === 'hepan') {
    if (featureParams.subtype === 'event' || /应事|事件|选择|决策|要不要|适不适合|签约|开业|搬家|考试|面试|投资/.test(text)) {
      return 'event_decision'
    }
    return 'relationship_dynamics'
  }
  if (kind === 'lifepath') {
    if (/暴富|发财|财富跃迁|此生|一生.*财|财运|财富|赚钱|搞钱|投资|现金流/.test(text)) return 'lifetime_wealth'
    if (/事业|工作|职业|职场|创业|升职|跳槽|行业|平台/.test(text)) return 'career_development'
    if (/感情|婚姻|伴侣|关系|合盘|合作|合伙/.test(text)) return 'relationship_dynamics'
    return 'lifepath_growth'
  }
  if (kind === 'fortune') {
    if (/应事|择日|签约|签合同|开业|搬家|面试|考试|发布|上线|要不要|适不适合/.test(text)) return 'event_decision'
    if (/事业|工作|职业|职场|项目|创业|升职|跳槽|平台|行业/.test(text)) return 'career_development'
    if (/财运|财富|财库|偏财|正财|钱|收入|投资|副业|生意|赚钱|挣钱|搞钱|现金流|资产|资源/.test(text)) return 'wealth_strategy'
    return 'fortune_timing'
  }
  return 'general'
}

export function buildChatSystemPrompt(input: BuildChatSystemPromptInput): string {
  let systemPrompt = BASE_PROMPT

  if (input.baziAnalysisResult || (input.participants && input.participants.length > 0) || input.featureContext) {
    systemPrompt += BAZI_INSTRUCTIONS
    systemPrompt += `\n现在是${input.currentDateString}`
    if (input.baziAnalysisResult) {
      systemPrompt += `\n\n【用户八字信息】\n${input.baziAnalysisResult}`
    }
    systemPrompt += buildFollowUpAddendum(input.participants, input.featureContext)
  }

  return systemPrompt
}

export function buildFollowUpAddendum(
  participants?: ChatParticipantLike[],
  ctx?: ChatFeatureContextLike | null,
): string {
  let block = ''
  if (ctx) {
    block += `\n\n【上下文：刚刚完成的分析】\n类型：${FEATURE_KIND_LABEL[ctx.kind]}`
    if (ctx.summary) block += `\n概要：${ctx.summary}`
    block += `\n请基于先前给出的分析与下方人物信息继续答复用户的追问，不要重复已说过的命盘基础信息。`
  }
  if (participants && participants.length > 0) {
    const lines = participants
      .map((p, i) => `### 人物${i + 1}：${p.name || '未命名'}${p.pillars ? `\n四柱：${p.pillars}` : ''}\n${p.baziText ? (p.baziText.length > 800 ? `${p.baziText.slice(0, 800)}\n...（已截断）` : p.baziText) : '（暂无完整命盘）'}`)
      .join('\n\n')
    block += `\n\n【参与者命盘】\n${lines}`
  }
  return block
}

export function buildAgentToolRouterPrompt(): string {
  return TOOL_ROUTER_PROMPT
}

export function buildAgentAnalysisDepthInstruction(
  depth: 'concise' | 'balanced' | 'detailed',
  isLongHorizon = false,
): string {
  if (depth === 'concise') {
    return '输出 500-900 中文字。先给结论，再给关键依据、时间/风险提醒和 3-5 条行动建议。'
  }
  if (depth === 'detailed') {
    const target = isLongHorizon
      ? '目标 12000-22000 中文字；如果资料足够，请按人生阶段/大运窗口充分展开。'
      : '目标 9000-16000 中文字；如果所问时间跨度较长，请按阶段或月份充分展开。'
    return `输出长篇深度报告，${target}
- 不要在 3000-5000 字左右提前收尾；max_tokens 已为长文预留，请把空间用于具体推演。
- 至少包含 7 个以上清晰一级章节，每个核心章节至少 4-7 个自然段。
- 充分展开命局底色、大运/流年/流月作用、关键时间窗口、条件触发、风险点、反例提醒和行动地图。
- 可以用表格或分段清单帮助扫描，但每个结论后必须给出命理依据和现实行动含义。
- 不要用重复话水字数；用具体阶段、窗口、条件、风险和建议填充篇幅。`
  }
  return `输出 1800-3600 中文字。保留清晰层级，不能只写浅层摘要。
- 至少覆盖命局/性格格局、大运流年阶段、天干外显与地支内在、关键转折、风险规避和行动建议。
- 每个核心结论后给出简明命理依据和现实行动含义，避免只说“好/不好”。`
}

export function buildAgentAnalysisSystemPrompt(input: BuildAgentAnalysisSystemPromptInput): string {
  return `${BBX_PERSONA}

你现在不是四项工具之一，而是卜卜象统一分析引擎。请基于已确认的“人物、所问时间、所问事宜、补充信息”生成回答。

【当前时间锚点】
- 现在是：${input.nowText}
- 时区：${input.timezone}

【硬性规则】
- 不编造人物、出生信息、四柱、图片观察、具体日期或专业结论。
- 命理表达必须使用“趋势 / 倾向 / 参考 / 建议”，避免“必然、注定、绝对”。
- 涉及医疗、法律、投资等高风险事项，只能给趋势参考，并建议咨询专业人士。
- 用户的主动选择永远比命理更重要。
- 不要输出内部字段名、JSON 或工具调用痕迹。

【本次结构】
${input.structureInstruction}

【本次场景深化】
${input.scenarioPrompt}

【本次篇幅】
${input.depthInstruction}
${input.promptStyleHint ? `\n【用户风格补充】\n${input.promptStyleHint}` : ''}`
}

export function buildAgentAnalysisUserPrompt(input: BuildAgentAnalysisUserPromptInput): string {
  return `【用户原问题】
${input.userQuestion}

【当前公历信息】
现在是：${input.nowText}
时区：${input.timezone}

${input.calendarTableText}

【相关人物八字与大运】
${input.peopleText}

【所问事宜】
类型：${input.matterCategory}
场景：${input.scenarioLabel}
重点：${input.focusText}
原话：${input.rawMatter}
${input.intentNote ? `意图策略：${input.intentNote}` : ''}

【补充信息】
${input.supplementsText}

请直接给用户最终分析。`
}

export function buildAgentCardPlannerPrompt(): string {
  return CARD_PLANNER_PROMPT
}

export function buildAgentCorrectionExtractorPrompt(): string {
  return CORRECTION_EXTRACTOR_PROMPT
}

export function buildFollowUpSuggestionsPrompt(): string {
  return FOLLOW_UP_SUGGESTION_PROMPT(BUBU_FOLLOW_UP_DEFAULTS)
}

export function buildAgentDirectAnswerGuidance(input: BuildAgentDirectAnswerGuidanceInput): string {
  return `【Agent 直接回答模式】这次不要写成长报告，也不要展示报告结构。请围绕用户的具体问题直接回答，结合可用八字/人物/时间上下文给出结论、原因和行动提醒。若信息有不确定处，简短说明假设即可。\n判定原因：${input.reason}\n原始问题：${input.sourceText}\n人物：${input.people}\n时间：${input.time}\n重点：${input.focus}`
}

export function buildAgentReportStyleHint(label: string): string {
  return `当前报告风格：${label}`
}

export function buildAgentEarlierContextSummary(summary: string): string {
  return `【更早上下文摘要】\n${summary}`
}

export function buildAgentSessionSummary(summary: string): string {
  return `【会话摘要】\n${summary}`
}

export function formatAuthErrorMessage(err: { message?: string | null } | null | undefined): string {
  if (!err?.message) return AUTH_ERROR_MESSAGES.generic
  const msg = err.message.toLowerCase()
  if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('already been registered')) {
    return AUTH_ERROR_MESSAGES.alreadyRegistered
  }
  if (msg.includes('invalid login') || msg.includes('invalid_credentials')) {
    return AUTH_ERROR_MESSAGES.invalidLogin
  }
  if (msg.includes('email not confirmed')) {
    return AUTH_ERROR_MESSAGES.emailNotConfirmed
  }
  if (msg.includes('token has expired') || msg.includes('otp_expired')) {
    return AUTH_ERROR_MESSAGES.otpExpired
  }
  if (msg.includes('otp_disabled')) {
    return AUTH_ERROR_MESSAGES.otpDisabled
  }
  return err.message
}

export function buildAuthDialogTitles(email: string) {
  return AUTH_TITLES(email)
}

export function formatFeatureRequestDisplay(kind: FeatureKind, params: any): FeatureRequestDisplayCopy {
  if (kind === 'hepan') {
    const subLabel = params?.subtype === 'pair' ? '双人合盘' : params?.subtype === 'multi' ? '多人合盘' : '应事分析'
    const sourceParticipants = Array.isArray(params?.participants) ? params.participants : []
    const names = sourceParticipants.map((item: any) => item?.name).filter(Boolean).join('、')
    return {
      summary: `${subLabel}：${names}${params?.relationLabel ? ` · ${params.relationLabel}` : ''}${params?.eventDesc ? ` · 应事：${String(params.eventDesc).slice(0, 30)}` : ''}`,
      participants: sourceParticipants.map((item: any) => ({ name: item.name, baziText: item.baziText, pillars: item.pillars })),
      userDisplay: `${FEATURE_SENTINELS.hepan}（${subLabel}）\n人物：${names}${params?.relationLabel ? `\n关系：${params.relationLabel}` : ''}${params?.eventDesc ? `\n应事：${params.eventDesc}` : ''}`,
    }
  }

  if (kind === 'fortune') {
    const granularityLabel = params?.granularity === 'day' ? '逐日' : '逐月'
    const focus = Array.isArray(params?.focus) ? params.focus.join('、') : ''
    const name = params?.profile?.name || '未命名'
    return {
      summary: `近期运势 · ${name}：${params?.start} ~ ${params?.end}（${granularityLabel}）· 关注：${focus}`,
      participants: params?.profile ? [{ name, baziText: params.profile.baziText, pillars: params.profile.pillars }] : [],
      userDisplay: `${FEATURE_SENTINELS.fortune}（${granularityLabel}）\n命主：${name}\n时间：${params?.start} ~ ${params?.end}\n关注：${focus}`,
    }
  }

  if (kind === 'avatar') {
    const profile = params?.profile
    return {
      summary: `头像分析推荐${params?.combineBazi && profile ? ` · 结合 ${profile.name} 的八字` : '（仅气质分析）'}`,
      participants: profile ? [{ name: profile.name, baziText: profile.baziText, pillars: profile.pillars }] : [],
      userDisplay: `${FEATURE_SENTINELS.avatar}\n上传了头像${params?.combineBazi ? `，结合${profile ? ` ${profile.name} 的` : ''}八字` : ''}`,
    }
  }

  const profile = params?.profile
  const name = profile?.name || '未命名'
  return {
    summary: `人生脉络与总体分析 · ${name}`,
    participants: profile ? [{ name, baziText: profile.baziText, pillars: profile.pillars }] : [],
    userDisplay: `${FEATURE_SENTINELS.lifepath}\n命主：${name}`,
  }
}

function truncateBubuPromptText(text: string | null | undefined, max = 1200): string {
  if (!text) return '（暂无完整命盘文本）'
  return text.length > max ? `${text.slice(0, max)}\n...（已截断）` : text
}

function describeBubuPromptParticipant(p: FeatureParticipantLike, idx?: number): string {
  const head = idx !== undefined ? `### 人物${idx + 1}：${p.name || '未命名'}` : `### ${p.name || '未命名'}`
  const pillars = p.pillars ? `\n四柱：${p.pillars}` : ''
  const bazi = p.baziText ? `\n命盘信息：\n${truncateBubuPromptText(p.baziText)}` : ''
  return `${head}${pillars}${bazi}`
}

function bubuAnalysisAngleBlock(angle?: string | null): string {
  const text = String(angle || '').trim()
  return text ? `\n\n【卜卜象本次规划方向】${text}` : ''
}

export function buildBubuHepanUserMessage(params: HepanPromptParamsLike): string {
  const subtypeLabel =
    params.subtype === 'pair'
      ? '双人合盘'
      : params.subtype === 'multi'
      ? '多人合盘'
      : '应事分析'
  const blocks = params.participants
    .map((p, i) => describeBubuPromptParticipant(p, i))
    .join('\n\n')
  const relation = params.relationLabel ? `\n\n【关系类型】${params.relationLabel}` : ''
  const event = params.eventDesc ? `\n\n【应事 / 关注事件描述】${params.eventDesc}` : ''

  return `${FEATURE_SENTINELS.hepan}（${subtypeLabel}）

请基于以下 ${params.participants.length} 位参与者的八字信息进行合盘分析。

${blocks}${relation}${event}${bubuAnalysisAngleBlock(params.analysisAngle)}

请按系统提示中要求的结构输出。`
}

function bubuMonthSpan(start: string, end: string): number {
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0
  return (
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth()) +
    1
  )
}

export function buildBubuFortuneDepthInstruction(params: FortunePromptParamsLike): string {
  if (params.granularity !== 'month') {
    return `
【输出深度要求】
- 如果用户只问短期几天，可以保持精炼；如果范围超过 14 天，请按周或关键阶段展开，不要只给笼统结论。
- 每个关注方向都要给出命局依据、时间窗口和行动建议。`
  }

  const months = bubuMonthSpan(params.start, params.end)
  if (months > 18) {
    return `
【长篇报告要求：多年财运研究报告】
- 这是多年跨度，请写成完整长篇财运报告，但不要把每一个月都写成等长大章，避免信息过载。
- 先给执行摘要和财富主线，再按年份展开：每一年至少 5-8 个自然段，说明财富主题、大运/流年关系、收入机会、风险支出、人际合作、资产配置倾向和行动策略。
- 每一年内标出 2-4 个关键月份或季度窗口，说明这些窗口为什么值得关注；逐月表没有具体日柱时，用月份/季度/交节前后表达，不要编造具体日期。
- 对跨大运或关键流年转换要单独成段说明，帮助用户理解财运节奏如何变化。
- 结尾给出长期财富节奏地图、风险清单、能力建设清单和可执行年度规划。`
  }

  const monthlyLength = months > 0 && months <= 8
    ? '每个月至少写 4-6 个自然段，约 450-700 中文字。'
    : '每个月至少写 3-5 个自然段，约 300-550 中文字，并在季度/阶段处做综合。'

  return `
【长篇报告要求：逐月 deep research 风格】
- 这不是短答复，请写成完整长篇报告：先给执行摘要，再给命盘基线，再逐月展开，最后给节奏地图和行动清单。
- 用户问“接下来几个月/未来几个月/半年/一年”时，每一个月份都必须成为独立章节，禁止只用“三行式”概括。
- ${monthlyLength}
- 每个月章节必须包含：本月主题、与原局/大运/流年的作用关系、事业/财富/关系/身心四个维度中的重点变化、上旬/中旬/下旬关键窗口、可执行建议。
- 如果关注方向只有“整体”，也要自然覆盖事业、财富、人际关系、情绪身心和学习成长；如果用户指定了 focus，则优先展开指定方向。
- 关键时间点只能基于给定月柱/日柱表推导。逐月表没有具体日柱时，用“上旬/中旬/下旬/交节前后”等窗口表达，不要编造具体日期。
- 用报告式标题、清晰层级和自然段落写作，内容要有密度、有解释、有行动价值，避免空泛鸡汤。`
}

export function buildBubuFortuneUserMessage(
  params: FortunePromptParamsLike,
  calendarTable: string,
): string {
  const focusLabel = params.focus.length > 0 ? params.focus.join('、') : '整体运势'
  return `${FEATURE_SENTINELS.fortune}（${params.granularity === 'day' ? '逐日' : '逐月'}）

【命主信息】
${describeBubuPromptParticipant(params.profile)}

【时间范围】${params.start} ~ ${params.end}
【关注方向】${focusLabel}
${bubuAnalysisAngleBlock(params.analysisAngle)}

${calendarTable}

请基于命主八字 + 上方时间表，按系统提示中要求的结构进行近期运势推演。每个关注方向独立成段。
${buildBubuFortuneDepthInstruction(params)}`
}

export function buildBubuAvatarUserText(params: AvatarPromptParamsLike): string {
  const profileBlock =
    params.combineBazi && params.profile
      ? `\n【命主信息（用于五行/风格倾向参考）】\n${describeBubuPromptParticipant(params.profile)}`
      : params.combineBazi
      ? `\n【提示】用户希望结合八字，但未提供命主信息，请略过五行风格段并提示用户补充。`
      : `\n【提示】用户未开启结合八字，请略过五行风格段。`

  return `${FEATURE_SENTINELS.avatar}

请分析下方上传的头像图片，并结合命理参考给出建议。
${profileBlock}${bubuAnalysisAngleBlock(params.analysisAngle)}

请按系统提示中要求的 6 段式结构输出。`
}

export function buildBubuLifePathUserMessage(params: LifePathPromptParamsLike): string {
  return `${FEATURE_SENTINELS.lifepath}

【命主信息】
${describeBubuPromptParticipant(params.profile)}
${bubuAnalysisAngleBlock(params.analysisAngle)}

请按系统提示中要求的结构，做一次贯穿一生的脉络梳理与总体分析。`
}

export function getDonationMessage(index?: number): string {
  const safeIndex = typeof index === 'number' && Number.isFinite(index)
    ? Math.abs(Math.floor(index)) % DONATION_MESSAGES.length
    : Math.floor(Math.random() * DONATION_MESSAGES.length)
  return DONATION_MESSAGES[safeIndex]
}

export function getBubuStreamLabel(runKind: BubuRunKind, status: BubuStreamStatus): string {
  return BUBU_STREAM_LABELS[runKind]?.[status] || BUBU_STREAM_LABELS.classic[status]
}

export function getBubuGeneratingLabel(runKind: BubuRunKind): string {
  return getBubuStreamLabel(runKind, 'streaming')
}

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

export { BUBU_STREAM_LABELS, BUBU_EMPTY_RESPONSE, BUBU_FOLLOW_UP_DEFAULTS, BUBU_FOLLOW_UP_LOADING }

export function buildFeatureCardItems() {
  return FEATURE_CARD_ITEMS
}

export function buildFeatureLauncherItems() {
  return FEATURE_LAUNCHER_ITEMS
}

export function buildChatMessageFeatureMeta() {
  return CHAT_MESSAGE_FEATURE_META
}

export const HEPAN_PROMPT_DEEPSEEK = BUBU_PROMPTS.feature.hepan.deepseek
export const HEPAN_PROMPT_GEMINI = BUBU_PROMPTS.feature.hepan.gemini
export const FORTUNE_PROMPT_DEEPSEEK = BUBU_PROMPTS.feature.fortune.deepseek
export const FORTUNE_PROMPT_GEMINI = BUBU_PROMPTS.feature.fortune.gemini
export const AVATAR_PROMPT_DEEPSEEK = BUBU_PROMPTS.feature.avatar.deepseek
export const AVATAR_PROMPT_GEMINI = BUBU_PROMPTS.feature.avatar.gemini
export const LIFEPATH_PROMPT_DEEPSEEK = BUBU_PROMPTS.feature.lifepath.deepseek
export const LIFEPATH_PROMPT_GEMINI = BUBU_PROMPTS.feature.lifepath.gemini

export const buildBubuPrompt = {
  feature: getFeaturePrompt,
  scenario: buildScenarioPrompt,
  chatSystem: buildChatSystemPrompt,
  agentToolRouter: buildAgentToolRouterPrompt,
  agentCardPlanner: buildAgentCardPlannerPrompt,
  agentCorrectionExtractor: buildAgentCorrectionExtractorPrompt,
  followUpSuggestions: buildFollowUpSuggestionsPrompt,
  agentAnalysisDepth: buildAgentAnalysisDepthInstruction,
  agentAnalysisSystem: buildAgentAnalysisSystemPrompt,
  agentAnalysisUser: buildAgentAnalysisUserPrompt,
  agentDirectAnswerGuidance: buildAgentDirectAnswerGuidance,
  agentEarlierContextSummary: buildAgentEarlierContextSummary,
  agentSessionSummary: buildAgentSessionSummary,
  agentReportStyleHint: buildAgentReportStyleHint,
  hepanUserMessage: buildBubuHepanUserMessage,
  fortuneUserMessage: buildBubuFortuneUserMessage,
  avatarUserText: buildBubuAvatarUserText,
  lifePathUserMessage: buildBubuLifePathUserMessage,
} as const

export const formatBubuCopy = {
  authErrorMessage: formatAuthErrorMessage,
  authDialogTitles: buildAuthDialogTitles,
  donationMessage: getDonationMessage,
  streamLabel: getBubuStreamLabel,
  generatingLabel: getBubuGeneratingLabel,
  featureRequestDisplay: formatFeatureRequestDisplay,
} as const
