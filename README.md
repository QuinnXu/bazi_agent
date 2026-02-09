# 🌟 八字命理 AI 聊天应用

基于 Next.js 15、Supabase 和 DeepSeek API 的现代化命理咨询系统。

## ✨ 核心功能

- 🎯 **智能对话** - DeepSeek Reasoner AI 流式对话
- 👥 **人物管理** - 多人物八字档案系统
- 📊 **八字分析** - 专业八字排盘和分析
- 💾 **云端存储** - Supabase 数据持久化
- 🔐 **用户系统** - 完整认证和数据隔离（RLS）
- 🎨 **现代 UI** - 简洁优雅的交互界面

---

## 🚀 快速开始

### 1. 环境要求

- Node.js 18+
- pnpm (推荐) 或 npm
- Supabase 账号
- DeepSeek API 密钥

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

创建 `.env.local` 文件：

```bash
# DeepSeek API
DEEPSEEK_API_KEY=your-deepseek-key
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 4. 部署数据库

在 Supabase Dashboard 的 SQL Editor 中执行 `supabase/schema_v2_english.sql`，确保存在 `profiles` 等表（不要使用 `users` 表名）。

### 5. 配置 Supabase 认证回调（必做）

在 **Supabase Dashboard → Authentication → URL Configuration** 中配置：

- **Site URL**：开发环境填 `http://localhost:3000`，生产环境填你的域名（如 `https://your-app.vercel.app`）
- **Redirect URLs**：添加以下地址（开发与生产各一条）  
  - `http://localhost:3000/auth/callback`  
  - `https://你的生产域名/auth/callback`

否则邮箱确认链接无法正确跳回应用，登录/注册会异常。

### 6. 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:3000

**提醒**：若开启邮箱验证，注册后需在邮件中点击确认链接，跳转到 `/auth/callback` 完成验证后才能登录。

---

## 📁 项目结构

```
├── app/                      # Next.js 15 App Router
│   ├── api/                  # API 路由
│   │   ├── bazi/            # 八字计算 API
│   │   ├── bazi-profile/    # 八字档案 API
│   │   ├── chat/            # 聊天 API (DeepSeek)
│   │   ├── messages/        # 消息 API
│   │   └── sessions/        # 会话 API
│   ├── globals.css          # 全局样式
│   ├── layout.tsx           # 根布局
│   └── page.tsx             # 主页面
│
├── components/               # React 组件
│   ├── ui/                  # Shadcn UI 基础组件
│   ├── auth-dialog.tsx      # 认证对话框
│   ├── bazi-dialog.tsx      # 八字输入对话框
│   ├── chat-message.tsx     # 聊天消息组件
│   ├── profile-selector.tsx # 人物选择器
│   └── ...                  # 其他组件
│
├── contexts/                 # React Context
│   └── auth-context.tsx     # 认证上下文
│
├── hooks/                    # 自定义 Hooks
│   ├── use-mobile.ts        # 移动端检测
│   └── use-toast.ts         # Toast 通知
│
├── lib/                      # 工具库
│   ├── supabase/            # Supabase 客户端
│   │   ├── client.ts        # 浏览器客户端
│   │   └── server.ts        # 服务器客户端
│   └── utils.ts             # 工具函数
│
├── types/                    # TypeScript 类型
│   └── database_v2.ts       # 数据库类型定义
│
├── supabase/                 # 数据库脚本
│   └── schema_v2_english.sql # 数据库 Schema
│
├── tool/                     # 八字排盘工具
│   ├── paipan.js            # 排盘核心算法
│   └── analyzeBazi.js       # 八字分析测试
│
├── public/                   # 静态资源
│   └── geodata/data.json    # 地理位置数据
│
└── .env.local               # 环境变量（需创建）
```

---

## 🗄️ 数据库架构

6 张主要数据表：

| 表名 | 说明 |
|------|------|
| `profiles` | 用户档案 |
| `bazi_profiles` | 八字档案（支持多人物） |
| `chat_sessions` | 聊天会话 |
| `chat_messages` | 聊天消息 |
| `user_preferences` | 用户设置 |
| `message_feedback` | 消息反馈 |

### 关键特性

- **RLS (Row Level Security)**: 每个用户只能访问自己的数据
- **自动时间戳**: `updated_at` 字段自动更新
- **消息计数**: 会话自动统计消息数量

---

## 🔧 技术栈

- **框架**: Next.js 15 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS 4 + Shadcn UI
- **数据库**: Supabase (PostgreSQL)
- **认证**: Supabase Auth
- **AI**: DeepSeek Reasoner API

---

## 🚢 部署到 Vercel

### 1. 推送代码到 GitHub

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### 2. 在 Vercel 导入项目

1. 访问 [vercel.com](https://vercel.com)
2. 点击 "New Project"
3. 导入你的 GitHub 仓库

### 3. 配置环境变量

在 Vercel Dashboard → Settings → Environment Variables 中添加：

| 变量名 | 说明 |
|--------|------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 |
| `DEEPSEEK_BASE_URL` | DeepSeek API 地址 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key |

### 4. 部署

```bash
vercel --prod
```

或直接通过 Vercel Dashboard 部署。

---

## 🛠️ 本地开发

### 启动开发服务器

```bash
pnpm dev
```

### 构建生产版本

```bash
pnpm build
```

### 启动生产服务器

```bash
pnpm start
```

### 代码检查

```bash
pnpm lint
```

---

## 🐛 常见问题

### Q: Vercel 构建失败
**A**: 确保在 Vercel Dashboard 中配置了所有环境变量。

### Q: 注册或登录失败 / 点击邮件确认链接后仍无法登录
**A**: 1) 在 Supabase Dashboard → Authentication → URL Configuration 中添加 Redirect URL：`http://localhost:3000/auth/callback`（生产环境改为你的域名 + `/auth/callback`）。2) 确认数据库中存在 `profiles` 表（执行 `schema_v2_english.sql`），且没有使用名为 `users` 的表。

### Q: 登录后无法加载数据
**A**: 检查 Supabase RLS 策略是否正确部署。在 Supabase SQL Editor 中执行 `schema_v2_english.sql`。

### Q: API 调用返回错误
**A**: 验证环境变量中的 API 密钥是否正确。确保 `DEEPSEEK_BASE_URL` 格式正确（不要有尾部斜杠）。

### Q: 八字计算结果不准确
**A**: 确保输入的出生时间和地点（经纬度）正确。系统会根据经度进行真太阳时校正。

---

## 📖 进一步修改指南

### 修改 AI 提示词

编辑 `app/api/chat/route.ts` 中的 `systemPrompt` 变量。

### 添加新的八字档案字段

1. 更新 `supabase/schema_v2_english.sql`
2. 更新 `types/database_v2.ts`
3. 更新相关组件

### 自定义 UI 样式

- 全局样式: `app/globals.css`
- 主题配置: 修改 CSS 变量
- 组件样式: 编辑 `components/` 目录下的组件

### 添加新 API

在 `app/api/` 目录下创建新的 `route.ts` 文件。

---

## 📄 许可

MIT License

---

**版本**: 2.0.0 | **更新**: 2025-01-04 | **状态**: ✅ 生产就绪
