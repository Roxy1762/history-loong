# 🐉 历史接龙 History-Loong

**多人在线历史知识接龙游戏** — AI 自动验证历史概念、自动生成时间轴、支持多格式导出。

👥 **多人协作** | 🤖 **AI智能** | 📅 **自动时间轴** | 🎓 **教学工具** | ⚙️ **可配置**

---

## 🎯 功能概览

### 核心游戏功能
- **📚 多人实时接龙**：2+ 玩家通过房间码加入，WebSocket 实时同步
- **🤖 AI 智能验证**：每个提交的历史概念自动由 Claude API 验证，提取：
  - 概念名称（标准化）
  - 时间年份（转换为公元制）
  - 所属朝代/时期
  - 简短描述
  - 相关标签
- **📅 自动时间轴**：验证通过的概念按时间顺序自动归入，按朝代分组，支持 20+ 朝代颜色编码
- **💬 实时聊天**：游戏过程中可聊天，所有消息与概念记录

### 游戏模式（可选）
| 模式 | 说明 | 适用场景 |
|------|------|---------|
| **自由接龙** | 玩家可自由提交与主题相关的任意概念 | 最宽松，适合轻松娱乐 |
| **关联接龙** | 每个新概念需与上一个有历史关联 | 考察历史因果关系 |
| **时序接龙** | 概念必须按时间先后顺序提交 | 考察时间感知 |

### 验证时机（可选）
| 模式 | 说明 | 优点 |
|------|------|------|
| ⚡ **实时验证** | 每次提交立即 AI 验证（默认） | 即时反馈，错误立刻知道 |
| 🎯 **结算验证** | 游戏结束时 AI 批量验证 | 游戏节奏更流畅，减少等待 |

**结算模式流程：**
1. 玩家随意提交概念（无需等待 AI）→ 显示"⏳ 待验证"
2. 游戏结束时点击"⚖️ 结算"按钮
3. AI 批量验证所有待验证概念（一次 API 调用，高效）
4. 弹出结算结果：X 个通过，Y 个淘汰
5. 时间轴自动更新

### 后台管理功能
- **🔧 AI 配置管理**：可配置多个 AI 接口，随时切换
  - Anthropic Claude（原生支持）
  - OpenAI（及所有 OpenAI 兼容接口）
  - DeepSeek、Qwen、Moonshot、Ollama 等
  - 一键测试连接、激活/停用配置
- **📚 知识库管理**：上传教材文本，提升 AI 验证准确度
  - 支持 .txt / .md 文档上传（最大 5MB）
  - 自动分段并建立 FTS5 全文索引
  - 验证概念时自动检索相关段落作为 AI 上下文
  - 删除管理
- **📊 系统概览**：实时统计游戏数、有效概念数、文档数、AI 配置数

### 数据导出
支持三种格式导出时间轴 + 聊天记录：
- **Markdown** — 带格式文本，可导入 Notion / Obsidian 笔记
- **JSON** — 结构化数据，适合二次开发或数据分析
- **CSV** — 表格数据，可在 Excel / Google Sheets 中打开

---

## ⚡ 最简部署（三行命令）

```bash
git clone <repo-url> && cd history-loong
cp .env.example .env && nano .env   # 填入 API Key
make setup && npm run dev           # 安装 + 启动
```

或者用脚本：

```bash
bash setup.sh         # 开发模式
bash setup.sh --prod  # 生产模式（自动构建）
bash setup.sh --docker# Docker 一键部署
```

## 📘 API 文档

- 详见：`docs/API.md`

---

## 🚀 快速开始（详细）

### 第 1 步：前置要求

**系统要求：**
- Node.js >= 16（推荐 18+）
- npm 或 yarn
- 任意操作系统（Windows / macOS / Linux）

**API 密钥：** 至少准备以下之一
- **Anthropic Claude API Key**（推荐）— https://console.anthropic.com
- **OpenAI API Key** — https://platform.openai.com
- 或其他支持的 AI 服务

### 第 2 步：克隆 & 安装

```bash
# 1. 克隆仓库（或直接下载 ZIP）
git clone <repo-url>
cd history-loong

# 2. 复制环境配置文件
cp .env.example .env

# 3. 编辑 .env 文件，填入你的 API 密钥
# Windows：用记事本或 VS Code 打开
# macOS/Linux：vim .env 或 nano .env
nano .env

# 关键配置项：
# ANTHROPIC_API_KEY=sk_ant_xxxxx  # Claude API Key
# 或者使用 OpenAI：
# OPENAI_API_KEY=sk-xxxxx

# 4. 安装全局依赖（仅一次）
npm install

# 5. 安装后端依赖
cd backend
npm install
cd ..

# 6. 安装前端依赖
cd frontend
npm install
cd ..
```

### 第 3 步：启动开发服务器

```bash
# 从项目根目录运行（会同时启动前后端）
npm run dev

# 你会看到输出：
# ╔══════════════════════════════════════════╗
# ║   历史接龙 History-Loong Server          ║
# ║   App:   http://localhost:5173           ║
# ║   Admin: http://localhost:3001/admin     ║
# ║   Key:   admin                           ║
# ╚══════════════════════════════════════════╝
```

### 第 4 步：打开浏览器

| 用途 | 地址 | 说明 |
|------|------|------|
| 游戏 | http://localhost:5173 | 创建/加入房间，开始玩游戏 |
| 后台 | http://localhost:3001/admin | 管理 AI 配置 & 知识库，密钥：`admin` |

---

## 📱 使用指南

### 游戏流程

#### 1️⃣ 首页 — 创建或加入房间

**创建房间：**
- 输入游戏主题（如"中国古代史"）
- 选择游戏模式（自由/关联/时序）
- 点击"创建房间"
- 得到 8 位房间码（如 `AB12CD34`），分享给朋友

**加入房间：**
- 输入房间码
- 点击"加入房间"

#### 2️⃣ 游戏页面

**界面说明：**
- **左侧（聊天面板）**：
  - 📚 **提交历史概念** 标签：输入历史人物、事件、制度等
  - 💬 **聊天** 标签：与其他玩家聊天
  - 实时消息记录
- **右侧（时间轴面板）**：展示所有已验证通过的历史概念，按朝代分组，按时间排序
- **顶部信息栏**：房间码、在线人数、概念数、验证状态

**提交概念示例：**
1. 切换到"📚 提交历史概念"标签
2. 输入概念（如"秦始皇统一中国"）
3. 点击"发送"
4. 等待 AI 验证（通常 2-5 秒）
5. ✅ 验证通过：自动加入时间轴
6. ❌ 验证失败：显示失败原因，可重新提交

**AI 验证失败的常见原因：**
- 不是真实的历史事件或人物
- 与游戏主题关联不大
- 输入不清楚（建议具体一些，如"北京城建立"而非"建立城"）

#### 3️⃣ 导出成果

游戏结束（或中途）可导出：
1. 点击顶部"📤 导出"按钮
2. 选择格式（Markdown / JSON / CSV）
3. 点击"下载"即自动下载到本地

**导出内容：**
- 完整的时间轴（已验证的概念）
- 完整的聊天记录
- 玩家名单和贡献

---

## ⚙️ 后台管理

### 访问后台

```
地址：http://localhost:3001/admin
密钥：admin（默认，可通过 ADMIN_KEY 环境变量修改）
```

### 功能 1：AI 配置

**为什么要配置？**
- 切换 AI 服务商（Claude → OpenAI → DeepSeek 等）
- 使用不同的模型（Claude 3.5 → Claude 4 等）
- 一个项目支持多个 API，随时切换

**配置 Claude（推荐）**
1. 进入"AI 配置"
2. 点击"+ 添加配置"
3. 填写：
   - 名称：`My Claude`
   - 提供商：`Anthropic Claude`
   - API Key：粘贴你的 Claude API Key
   - 模型：`claude-sonnet-4-6`
4. 点击"保存"
5. 点击"设为当前"激活
6. 点击"测试连接"验证成功

**配置 OpenAI**
1. 点击"+ 添加配置"
2. 填写：
   - 名称：`My OpenAI`
   - 提供商：`OpenAI Compatible`
   - Base URL：`https://api.openai.com/v1`
   - API Key：粘贴你的 OpenAI Key
   - 模型：`gpt-4o`
3. 保存 & 激活

**快速预设（点击自动填充）：**
- OpenAI — https://api.openai.com/v1
- DeepSeek — https://api.deepseek.com/v1
- Qwen（阿里） — https://dashscope.aliyuncs.com/compatible-mode/v1
- Moonshot（月之暗面） — https://api.moonshot.cn/v1
- Ollama（本地） — http://localhost:11434/v1

### 功能 2：知识库

**为什么要上传？**
- AI 验证时会自动检索相关文本作为背景资料
- 提升验证准确度，减少误判
- 可以上传教材、参考资料、笔记等

**上传教材：**
1. 进入"知识库"
2. 拖拽 .txt / .md 文件或点击"选择文件"
3. 文件自动上传并分段索引
4. 完成后显示切分的片段数

**粘贴文本：**
1. 如果没有文件，点击"✏️ 粘贴文本"
2. 输入标题（如"人教版历史必修一第三章"）
3. 粘贴文本内容（支持多个段落）
4. 点击"添加"

**查看 & 删除：**
- "文档列表"显示所有已上传的知识库
- 点击"删除"可移除文档

### 功能 3：系统概览

查看实时统计：
- 总游戏数
- 有效历史概念数
- 知识库文档数
- AI 配置数量

最近游戏列表（可查看房间码、主题、模式、状态等）

---

## 🐳 Docker 部署（推荐）

最简单的部署方式，**不需要手动安装 Node.js 依赖**。

### 前提
- 安装 Docker Desktop（[下载](https://www.docker.com/products/docker-desktop)）
- 准备好 `.env` 文件

### 生产部署（一条命令）
```bash
# 1. 准备配置
cp .env.example .env
nano .env   # 填入 API Key

# 2. 一键启动（构建 + 运行）
make docker
# 或者：bash setup.sh --docker

# 访问 http://localhost:3001
```

### 开发模式（热重载）
```bash
docker compose up           # 前后端都有热重载
docker compose logs -f      # 查看日志
docker compose down         # 停止
```

### 修改端口
编辑 `docker-compose.prod.yml`：
```yaml
ports:
  - "80:3001"   # 改为 80 端口，可直接用 http://your-ip
```

---

## 🛠️ 传统部署

### 本地生产构建 & 运行

```bash
bash setup.sh --prod  # 自动安装 + 构建
npm run start         # 启动
# 访问：http://localhost:3001
```

或手动操作：
```bash
npm run build    # 构建前端
npm run start    # 启动生产服务器（内含静态文件服务）
```

### 部署到云服务器（示例：AWS/阿里云/DigitalOcean）

#### 步骤 1：购买服务器
- Ubuntu 20.04+ 系统推荐
- 至少 1GB RAM
- 至少 2GB 磁盘空间

#### 步骤 2：连接到服务器
```bash
# SSH 连接（Windows 用户可用 PuTTY 或 VS Code Remote）
ssh ubuntu@your-server-ip
```

#### 步骤 3：安装 Node.js
```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Node.js（使用 NodeSource 官方源）
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 验证安装
node --version  # v18.x.x
npm --version   # 9.x.x
```

#### 步骤 4：部署项目
```bash
# 进入工作目录（或 /var/www）
cd /home/ubuntu

# 克隆项目
git clone <repo-url> history-loong
cd history-loong

# 复制并编辑 .env
cp .env.example .env
nano .env
# 填入 ANTHROPIC_API_KEY 等配置

# 安装依赖
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 构建前端
npm run build

# 测试运行（Ctrl+C 停止）
npm run start
```

#### 步骤 5：后台运行（使用 PM2）
```bash
# 全局安装 PM2
sudo npm install -g pm2

# 启动应用
pm2 start npm --name "history-loong" -- run start

# 开机自启
pm2 startup
pm2 save

# 查看状态
pm2 status
pm2 logs history-loong
```

#### 步骤 6：配置 Nginx 反向代理（可选但推荐）
```bash
# 安装 Nginx
sudo apt install -y nginx

# 编辑配置文件
sudo nano /etc/nginx/sites-available/default
```

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 改为你的域名

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
# 重启 Nginx
sudo systemctl restart nginx
```

#### 步骤 7：配置 SSL 证书（HTTPS）
```bash
# 安装 Certbot（Let's Encrypt 自动化工具）
sudo apt install -y certbot python3-certbot-nginx

# 申请证书
sudo certbot --nginx -d your-domain.com

# 自动续期设置
sudo systemctl enable certbot.timer
```

---

## 📁 项目结构

```
history-loong/
│
├── package.json                   # 根目录 npm workspace
├── .env.example                   # 环境变量示例
├── README.md                      # 本文件
│
├── backend/                       # 后端（Node.js + Express）
│   ├── package.json
│   ├── src/
│   │   ├── server.js              # 服务器入口（Express + Socket.io）
│   │   │
│   │   ├── db/
│   │   │   └── index.js           # SQLite 数据库定义 & 查询方法
│   │   │
│   │   ├── routes/
│   │   │   ├── games.js           # REST API：游戏房间管理
│   │   │   ├── export.js          # REST API：导出时间轴 & 聊天记录
│   │   │   └── admin.js           # REST API：后台管理（AI配置 & 知识库）
│   │   │
│   │   ├── socket/
│   │   │   └── index.js           # WebSocket 事件处理（加入、提交概念、聊天等）
│   │   │
│   │   ├── services/
│   │   │   ├── aiService.js       # AI 提供商适配器
│   │   │   │   ├─ Claude (Anthropic)
│   │   │   │   └─ OpenAI Compatible (任意接口)
│   │   │   │
│   │   │   ├── knowledgeService.js # 知识库服务（文档上传、FTS5检索）
│   │   │   │
│   │   │   ├── timelineService.js  # 时间轴构建（排序、朝代分组、年份格式化）
│   │   │   │
│   │   │   └── exportService.js    # 导出格式处理（JSON / Markdown / CSV）
│   │   │
│   │   └── plugins/
│   │       └── index.js            # 插件系统加载器（扩展点）
│   │
│   └── data/
│       └── history-loong.db        # SQLite 数据库文件（自动生成）
│
├── frontend/                      # 前端（React + TypeScript）
│   ├── package.json
│   ├── index.html
│   ├── tailwind.config.js         # Tailwind CSS 配置
│   ├── vite.config.ts             # Vite 打包配置
│   │
│   ├── public/
│   │   └── dragon.svg             # 龙形图标
│   │
│   └── src/
│       ├── main.tsx               # React 入口
│       ├── App.tsx                # 路由定义
│       ├── index.css              # 全局样式 + 自定义组件
│       │
│       ├── types/
│       │   └── index.ts           # TypeScript 类型定义
│       │
│       ├── pages/
│       │   ├── Home.tsx           # 首页（创建/加入房间）
│       │   ├── Game.tsx           # 游戏主页面
│       │   └── Admin.tsx          # 后台管理页面
│       │
│       ├── components/
│       │   ├── Chat.tsx           # 聊天 & 概念提交面板
│       │   ├── Timeline.tsx       # 时间轴面板（朝代分组 + 色彩编码）
│       │   ├── PlayerList.tsx     # 在线玩家列表
│       │   ├── ExportPanel.tsx    # 导出弹窗
│       │   └── admin/
│       │       ├── AIConfig.tsx   # AI 配置面板
│       │       └── KnowledgeBase.tsx # 知识库面板
│       │
│       ├── services/
│       │   ├── socket.ts          # Socket.io 客户端封装
│       │   └── api.ts             # REST API 客户端封装
│       │
│       └── store/
│           └── gameStore.ts       # Zustand 全局状态管理
│
└── node_modules/                 # 依赖包（npm install 自动生成）
```

---

## 🎓 常见问题 & 故障排除

### Q1: 启动时报错 "ANTHROPIC_API_KEY not found"

**原因：** 没有配置 API 密钥

**解决：**
```bash
# 1. 检查 .env 文件是否存在
ls -la .env

# 2. 编辑 .env 文件
nano .env

# 3. 添加你的 API 密钥：
ANTHROPIC_API_KEY=sk_ant_xxxxx

# 4. 保存后重启服务器
npm run dev
```

---

### Q2: 无法连接到数据库 "SQLITE_CANTOPEN"

**原因：** 数据目录不可写

**解决：**
```bash
# 创建 data 目录
mkdir -p data
chmod 755 data

# 重启服务器
npm run dev
```

---

### Q3: 前端显示 "Cannot GET /admin"

**原因：** 访问了不存在的路由

**解决：**
- 确保后端运行在 http://localhost:3001
- 使用正确的管理员密钥：`http://localhost:3001/admin`
- 如果使用了自定义的 `ADMIN_KEY`，检查是否与输入一致

---

### Q4: AI 验证非常慢（超过 10 秒）

**原因：**
1. API 密钥配置有误
2. 网络连接问题
3. API 服务繁忙

**解决：**
```bash
# 1. 测试 API 连接
# 在后台 admin 页面点击"测试连接"按钮

# 2. 检查网络
ping api.anthropic.com  # Claude
ping api.openai.com     # OpenAI

# 3. 切换 AI 配置
# 尝试使用另一个 AI 服务商
```

---

### Q5: 用户加入游戏后无法提交概念

**原因：**
1. Socket.io 连接断开
2. 游戏已结束

**解决：**
```bash
# 查看浏览器控制台（F12 → Console）
# 查看是否有 WebSocket 错误

# 确保后端正在运行
npm run dev

# 检查网络连接
# 刷新页面重新加入
```

---

### Q6: 部署到云服务器后无法访问

**原因：** 防火墙阻止或端口未开放

**解决：**
```bash
# 1. 检查防火墙规则（以阿里云为例）
# 在云控制台安全组中添加规则：
# - 入站规则：TCP 80, 443, 3001 开放

# 2. 检查应用是否运行
pm2 status

# 3. 检查日志
pm2 logs history-loong

# 4. 测试端口连接
nc -zv localhost 3001
```

---

### Q7: 导出文件为空或格式错误

**原因：** 游戏中还没有任何概念被验证

**解决：**
- 确保至少有 1 个概念通过 AI 验证
- 检查是否在系统消息中看到"✓ 「概念名」已加入时间轴"
- 如果看到"❌ 验证失败"，需要修改提交内容重新提交

---

## 🔧 开发指南

### 常用命令（Makefile）

```bash
make help          # 查看所有命令
make setup         # 初始化（安装依赖）
make dev           # 启动开发服务器
make build         # 构建前端
make start         # 启动生产服务器
make docker        # Docker 生产部署
make docker-dev    # Docker 开发模式
make logs          # 查看 Docker 日志
make clean         # 清理构建产物
```

### npm 脚本
```bash
npm run dev        # 同时启动前后端（开发）
npm run build      # 构建前端
npm run start      # 生产服务器
```

### 添加新 AI 提供商

```js
// backend/src/services/aiService.js

// 1. 创建新提供商类
async function callMyCustomAPI(config, prompt, maxTokens) {
  // 调用你的 AI API
  // 返回文本响应
}

// 2. 注册到提供商列表
PROVIDER_HANDLERS['custom'] = callMyCustomAPI;
```

### 添加新导出格式

```js
// backend/src/services/exportService.js

function formatHTML(data) {
  return {
    content: `<html>...</html>`,
    mimeType: 'text/html',
    ext: 'html',
  };
}

ExportService.registerFormatter('html', formatHTML);
```

### 修改时间轴样式

```tsx
// frontend/src/components/Timeline.tsx

// 在 ERA_COLORS 中添加新朝代配色
const ERA_COLORS = {
  '你的朝代': {
    dot: 'bg-yellow-400',        // 时间轴圆点颜色
    badge: 'bg-yellow-50 text-yellow-700 border-yellow-200',  // 标签颜色
    line: 'bg-yellow-200'        // 连线颜色
  }
};
```

---

## 📊 数据库架构

所有数据存储在 `data/history-loong.db`（SQLite）

### 主要表：

```sql
-- 游戏房间
games(id, topic, mode, status, created_at)

-- 玩家
players(id, game_id, name, color)

-- 历史概念
concepts(id, game_id, name, period, year, dynasty, description, tags, validated)

-- 聊天消息
messages(id, game_id, player_name, content, type, created_at)

-- AI 配置
ai_configs(id, name, provider_type, base_url, api_key, model, is_active)

-- 知识库文档
knowledge_docs(id, title, filename, total_chunks)
knowledge_chunks(id, doc_id, content)
knowledge_fts(content, chunk_id)  -- 全文搜索索引
```

---

## 📝 许可证

MIT License

---

## 🤝 贡献指南

欢迎提交 Issue & Pull Request！

---

## 📞 技术支持

遇到问题？
1. 检查上面的"常见问题"
2. 查看浏览器开发工具（F12 → Console）
3. 检查后端日志：`pm2 logs history-loong`
4. 提交 GitHub Issue

---

**祝你使用愉快！** 🎉
