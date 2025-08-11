# 八字AI聊天机器人 - Vercel 部署指南

这个项目是一个基于 Next.js 和 DeepSeek-Reasoner 的八字分析聊天机器人。

## 🚀 部署到 Vercel

### 方法 1: 通过 Vercel CLI

1. **安装 Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **登录 Vercel**
   ```bash
   vercel login
   ```

3. **部署项目**
   ```bash
   vercel --prod
   ```

### 方法 2: 通过 GitHub + Vercel Dashboard

1. **将代码推送到 GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/bazi-ai-chatbot.git
   git push -u origin main
   ```

2. **在 Vercel Dashboard 中导入项目**
   - 访问 [vercel.com](https://vercel.com)
   - 点击 "New Project"
   - 从 GitHub 导入你的仓库
   - Vercel 会自动检测 Next.js 配置

## ⚙️ 环境变量配置

在 Vercel Dashboard 的项目设置中，添加以下环境变量：

```
DEEPSEEK_API_KEY=你的DeepSeek_API密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

### 获取 DeepSeek API Key

1. 访问 [DeepSeek 官网](https://platform.deepseek.com/)
2. 注册账号并获取 API Key
3. 在 Vercel 项目设置中添加环境变量

## 📁 项目结构

```
├── app/
│   ├── api/
│   │   ├── chat/route.ts      # 聊天 API (DeepSeek-Reasoner)
│   │   └── bazi/route.ts      # 八字分析 API
│   ├── layout.tsx             # 应用布局
│   ├── page.tsx              # 主页面
│   └── globals.css           # 全局样式
├── components/
│   ├── chat-message.tsx      # 聊天消息组件 (Markdown 支持)
│   ├── bazi-dialog.tsx       # 八字输入弹窗
│   └── ui/                   # UI 组件库
├── tool/
│   └── tool/
│       ├── paipan.js         # 八字排盘核心算法
│       └── analyzeBazi.js    # 八字分析函数
└── vercel.json              # Vercel 部署配置
```

## 🎯 功能特点

- ✅ **DeepSeek-Reasoner 集成**: 强大的推理能力
- ✅ **八字专业分析**: 完整排盘算法
- ✅ **Markdown 渲染**: 美观的消息显示
- ✅ **实时流式响应**: 无等待体验
- ✅ **中文界面**: 完全本地化
- ✅ **响应式设计**: 移动端适配

## 🛠 构建优化

项目已针对 Vercel 部署进行优化：

- **Edge Runtime**: 快速冷启动
- **流式响应**: 优化用户体验
- **静态资源**: 自动 CDN 分发
- **环境变量**: 安全的 API Key 管理

## 🔧 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建项目
npm run build

# 启动生产服务器
npm start
```

## 📊 性能监控

部署后可以在 Vercel Dashboard 中查看：

- 函数执行时间
- 响应时间分析
- 错误日志
- 流量统计

## 🌍 自定义域名

在 Vercel Dashboard 中可以添加自定义域名：

1. 进入项目设置
2. 点击 "Domains"
3. 添加你的域名
4. 配置 DNS 记录

## 📝 注意事项

- 确保 DeepSeek API Key 有效且有足够额度
- 函数执行时间限制为 30 秒（聊天 API）
- 八字分析 API 限制为 10 秒
- 建议启用 Vercel Analytics 进行监控

部署完成后，你的八字 AI 聊天机器人就可以在 Vercel 提供的 URL 上访问了！🎉
