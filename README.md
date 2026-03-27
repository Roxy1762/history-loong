# 🐉 历史接龙 History-Loong

**多人在线历史知识接龙游戏** — AI 自动验证历史概念、自动生成时间轴、支持多格式导出。

👥 多人实时 | 🤖 AI 验证 | 📅 自动时间轴 | 📤 多格式导出 | ⚙️ 图形化后台

---

## ⚡ 快速开始（3 分钟部署）

> **完全不需要提前配置 AI Key！** 先把游戏跑起来，再在后台界面填 Key。

### 方法一：Docker（推荐，最省事）

**前提**：已安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)

```bash
# 1. 克隆项目
git clone https://github.com/roxy1762/history-loong.git
cd history-loong

# 2. 一键启动（会自动构建，首次约 3 分钟）
make docker-prod
```

启动后访问：
- 🌐 游戏：http://localhost:3001
- ⚙️ 后台：http://localhost:3001/admin（默认密钥：`admin`）

**常用命令：**
```bash
make logs          # 查看日志
make docker-stop   # 停止服务
make help          # 查看所有命令
```

---

### 方法二：本地运行（需要 Node.js）

**前提**：已安装 [Node.js 16+](https://nodejs.org/)

```bash
# 1. 克隆并初始化（自动安装依赖）
git clone https://github.com/roxy1762/history-loong.git
cd history-loong
make setup

# 2. 启动开发服务器
npm run dev
```

访问：
- 🌐 前端：http://localhost:5173
- 🔧 后端：http://localhost:3001
- ⚙️ 后台：http://localhost:3001/admin（密钥：`admin`）

---

## 🔑 配置 AI 接口（启动后再配置）

游戏启动后，访问后台管理页面配置 AI：

1. 打开 http://localhost:3001/admin
2. 输入管理员密钥（默认 `admin`，可在 `.env` 中修改）
3. 点击左侧 **「AI 配置」**
4. 点击 **「立即添加 AI 配置」**，按提示填写

**支持的 AI 接口：**

| 提供商 | 类型 | 获取 Key |
|--------|------|---------|
| Anthropic Claude | anthropic | [console.anthropic.com](https://console.anthropic.com/) |
| DeepSeek（便宜实用） | openai-compatible | [platform.deepseek.com](https://platform.deepseek.com/) |
| OpenAI GPT | openai-compatible | [platform.openai.com](https://platform.openai.com/) |
| 阿里云通义 Qwen | openai-compatible | [dashscope.aliyuncs.com](https://dashscope.aliyuncs.com/) |
| 月之暗面 Moonshot | openai-compatible | [platform.moonshot.cn](https://platform.moonshot.cn/) |
| 本地 Ollama（免费） | openai-compatible | [ollama.ai](https://ollama.ai/) |

> 配置好后点「测试连接」确认可用，再点「设为当前」激活即可。

---

## 🎮 怎么玩

1. **创建房间**：打开首页，选择主题（如"唐朝政治制度"），点击「创建房间」
2. **邀请朋友**：点击游戏页面右上角 **「🔗 分享」** 按钮，复制链接发给朋友
3. **开始接龙**：
   - 在聊天框输入历史概念（如"科举制"），按回车提交
   - AI 验证通过后自动归入时间轴
   - 也可选择"结算模式"：自由提交，游戏结束时统一验证
4. **查看成果**：右上角点 **「导出」** 下载时间轴（JSON/Markdown/CSV）

### 游戏模式说明

| 模式 | 规则 | 适合 |
|------|------|------|
| **自由接龙** | 提交与主题相关的任意历史概念 | 复习、娱乐 |
| **关联接龙** | 新概念须与上一个有历史关联 | 考察因果理解 |
| **时序接龙** | 概念必须按时间先后顺序提交 | 考察时间感知 |

### 验证时机说明

| 模式 | 说明 | 适合 |
|------|------|------|
| ⚡ **实时验证** | 提交后立即 AI 验证，即时反馈 | 小团队，网速好 |
| 🎯 **结算验证** | 自由提交，游戏结束时批量验证 | 课堂、多人、节奏快 |

---

## 📚 知识库（提升验证准确度）

可以上传教材文本，让 AI 在验证时参考：

1. 后台管理 → 「知识库」
2. 上传 `.txt` 或 `.md` 格式的教材文本（最大 5MB）
3. 或直接粘贴文本内容

上传后，AI 验证历史概念时会自动检索相关段落作为参考，显著提升准确率。

---

## ⚙️ 环境变量说明

项目根目录的 `.env` 文件（首次运行自动从 `.env.example` 创建）：

```env
# 管理员密钥（登录后台时使用，建议修改为复杂密码）
ADMIN_KEY=admin

# 服务端口（默认 3001）
PORT=3001

# 可选：直接填 API Key（也可在后台界面配置，效果相同）
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o
```

> **注意**：`.env` 中的 API Key 和后台界面配置二选一，后台界面配置优先级更高。

---

## 🐳 Docker 详细说明

### 生产环境（推荐）

```bash
# 启动（后台运行）
make docker-prod          # 或: docker compose -f docker-compose.prod.yml up -d

# 查看日志
make logs                 # 或: docker compose -f docker-compose.prod.yml logs -f

# 停止
make docker-stop          # 或: docker compose -f docker-compose.prod.yml down

# 数据持久化位置（Docker Volume）
docker volume inspect history_data
```

### 开发环境（热重载）

```bash
make docker-dev           # 或: docker compose up
```

### 数据备份

游戏数据存储在 Docker Volume `history_data` 中：

```bash
# 备份
docker run --rm -v history_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/history-loong-backup.tar.gz /data

# 恢复
docker run --rm -v history_data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/history-loong-backup.tar.gz -C /
```

---

## 🛠️ 开发者指南

### 目录结构

```
history-loong/
├── backend/              # Node.js + Express + Socket.io 后端
│   └── src/
│       ├── db/           # SQLite 数据库（better-sqlite3）
│       ├── routes/       # REST API 路由
│       ├── services/     # AI、知识库、导出服务
│       ├── socket/       # WebSocket 游戏逻辑
│       └── plugins/      # 插件扩展点
├── frontend/             # React + TypeScript + Tailwind 前端
│   └── src/
│       ├── pages/        # 页面组件
│       ├── components/   # 通用组件
│       ├── services/     # API/Socket 服务
│       ├── store/        # Zustand 状态管理
│       └── types/        # TypeScript 类型定义
├── data/                 # 数据库文件（运行时自动创建）
├── Dockerfile            # 生产镜像（多阶段构建）
├── docker-compose.yml    # 开发环境
├── docker-compose.prod.yml # 生产环境
├── Makefile              # 快捷命令
└── setup.sh              # 一键初始化脚本
```

### 常用开发命令

```bash
make install    # 安装所有依赖
make dev        # 启动开发服务器（前后端热重载）
make build      # 构建前端静态文件
make start      # 启动生产服务器（需先 make build）
make clean      # 清理依赖和构建产物
```

### 扩展点（插件系统）

在 `backend/src/plugins/index.js` 中可注册：
- 自定义 AI 提供商
- 自定义导出格式
- 自定义时代/朝代预设
- 游戏事件钩子

---

## 🔧 常见问题

**Q: 启动后提示"AI 未配置"怎么办？**
> 正常！游戏可以正常游玩，只是实时验证和提示功能不可用。前往 http://localhost:3001/admin → AI 配置，添加你的 API Key 即可。

**Q: Docker 构建失败？**
> 检查 Docker Desktop 是否运行，网络是否正常（首次需下载 Node.js 镜像）。

**Q: 换了端口怎么办？**
> 修改 `.env` 中的 `PORT=XXXX`，同时更新 `docker-compose.prod.yml` 中的端口映射。

**Q: 想用本地 Ollama？**
> 后台管理 → AI 配置 → 添加：类型选 `openai-compatible`，Base URL 填 `http://host.docker.internal:11434/v1`（Docker 中）或 `http://localhost:11434/v1`（本地运行时），API Key 随便填，选好模型名称即可。

**Q: 数据存在哪里？**
> 本地运行：`data/history-loong.db`；Docker 运行：Docker Volume `history_data`。

---

## 📄 许可证

MIT License

---

*由 Claude Code 协助构建 🤖*
