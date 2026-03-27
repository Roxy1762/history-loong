# 🐉 历史接龙 History-Loong

多人在线历史知识接龙游戏 — AI 自动验证概念并生成时间轴，支持导出成果。

## 功能特性

- **多人实时接龙**：多名玩家同时在线，通过 Socket.io 实时同步
- **三种游戏模式**：自由接龙 / 关联接龙 / 时序接龙
- **AI 智能验证**：通过 Claude API 自动验证历史概念的有效性，提取时间、朝代、简介信息
- **自动时间轴**：验证通过的概念按年代自动归入时间轴，分朝代分组展示
- **多格式导出**：支持 JSON / Markdown / CSV 格式导出时间轴和聊天记录
- **AI 提示功能**：可请求 AI 推荐相关历史概念
- **插件系统**：可扩展 AI 提供商、导出格式、时代预设、游戏模式

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS |
| 实时通信 | Socket.io |
| 后端 | Node.js + Express |
| 数据库 | SQLite (better-sqlite3) |
| AI | Anthropic Claude API |
| 状态管理 | Zustand |

## 快速开始

### 1. 安装依赖

```bash
cp .env.example .env
# 编辑 .env 填入 ANTHROPIC_API_KEY

npm install
cd backend && npm install
cd ../frontend && npm install
```

### 2. 启动开发服务器

```bash
# 根目录运行（同时启动前后端）
npm run dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:3001

### 3. 生产部署

```bash
npm run build        # 构建前端
npm run start        # 启动生产服务器（含静态文件服务）
```

## 项目结构

```
history-loong/
├── backend/
│   └── src/
│       ├── server.js              # Express + Socket.io 主入口
│       ├── db/index.js            # SQLite 数据库
│       ├── routes/
│       │   ├── games.js           # 游戏 REST API
│       │   └── export.js          # 导出 API
│       ├── socket/index.js        # Socket.io 游戏逻辑
│       ├── services/
│       │   ├── aiService.js       # AI 适配器（可扩展）
│       │   ├── timelineService.js # 时间轴构建与分组
│       │   └── exportService.js   # 导出格式（可扩展）
│       └── plugins/index.js       # 插件系统
└── frontend/
    └── src/
        ├── pages/
        │   ├── Home.tsx           # 首页（创建/加入房间）
        │   └── Game.tsx           # 游戏页面
        ├── components/
        │   ├── Chat.tsx           # 聊天面板
        │   ├── Timeline.tsx       # 时间轴面板
        │   ├── PlayerList.tsx     # 玩家列表
        │   └── ExportPanel.tsx    # 导出面板
        ├── services/
        │   ├── socket.ts          # Socket.io 封装
        │   └── api.ts             # REST API 封装
        ├── store/gameStore.ts     # Zustand 全局状态
        └── types/index.ts         # TypeScript 类型定义
```

## 扩展指南

### 添加新 AI 提供商

```js
// backend/plugins/my-plugin/index.js
module.exports = {
  name: 'my-plugin',
  version: '1.0.0',
  setup(context) {
    context.registerAIProvider('openai', OpenAIProvider);
  }
};
```

在 `.env` 中设置 `AI_PROVIDER=openai` 和 `ENABLED_PLUGINS=my-plugin`。

### 添加新导出格式

```js
context.registerExportFormatter('html', (data) => ({
  content: renderHTML(data),
  mimeType: 'text/html',
  ext: 'html',
}));
```

### 添加新游戏模式

```js
context.registerGameMode('quiz', {
  label: '问答模式',
  description: '每个概念须以问答形式提交',
});
```

### 添加新时代预设

```js
context.registerEraPreset('japan', [
  { name: '弥生时代', start: -300, end: 300 },
  // ...
]);
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 | 必填 |
| `CLAUDE_MODEL` | Claude 模型名 | `claude-sonnet-4-6` |
| `AI_PROVIDER` | AI 提供商 | `claude` |
| `PORT` | 后端端口 | `3001` |
| `FRONTEND_URL` | 前端地址（CORS） | `http://localhost:5173` |
| `DB_PATH` | SQLite 数据库路径 | `./data/history-loong.db` |
| `ENABLED_PLUGINS` | 启用的插件（逗号分隔） | 空 |
