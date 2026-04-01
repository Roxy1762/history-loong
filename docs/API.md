# 历史接龙 API 文档

> 基础地址（开发环境）：`http://localhost:3001`
>
> 所有响应均为 `application/json; charset=utf-8`（下载导出接口除外）。

---

## 1. 认证说明

### 1.1 公开接口
以下前缀为公开接口，无需鉴权：

- `/api/games`
- `/api/export`
- `/api/profile`
- `/api/modes`
- `/api/health`

### 1.2 管理接口
所有 `/api/admin/*` 接口都需要管理员密钥，支持两种方式：

- 请求头：`X-Admin-Key: <your_admin_key>`
- 查询参数：`?key=<your_admin_key>`

默认管理员密钥是 `admin`（建议通过环境变量 `ADMIN_KEY` 修改）。

---

## 2. 通用响应约定

### 2.1 成功
```json
{
  "message": "操作成功"
}
```

### 2.2 失败
```json
{
  "error": "错误信息"
}
```

常见状态码：

- `200`：成功
- `400`：请求参数错误
- `401`：管理员鉴权失败
- `404`：资源不存在

---

## 3. 公开 API

## 3.1 游戏房间 `/api/games`

### 3.1.1 创建房间
- **POST** `/api/games`

请求体：

```json
{
  "topic": "中国古代史",
  "mode": "free",
  "settings": {
    "extraModes": ["strict_order"]
  }
}
```

说明：
- `topic` 必填。
- `mode` 默认 `free`。
- `settings` 会被服务端标准化。

响应示例：

```json
{
  "game": {
    "id": "AB12CD34",
    "topic": "中国古代史",
    "mode": "free",
    "status": "playing"
  }
}
```

### 3.1.2 获取房间信息
- **GET** `/api/games/:id`

响应示例：

```json
{
  "game": { "id": "AB12CD34", "topic": "中国古代史", "mode": "free", "settings": {} },
  "players": [],
  "conceptCount": 0
}
```

### 3.1.3 获取时间轴概念
- **GET** `/api/games/:id/concepts`

响应：

```json
{
  "concepts": [
    {
      "id": "uuid",
      "name": "秦始皇统一六国",
      "year": -221,
      "dynasty": "秦",
      "tags": ["政治", "统一"],
      "extra": {}
    }
  ]
}
```

### 3.1.4 获取聊天消息
- **GET** `/api/games/:id/messages`

查询参数：

- `limit`：默认 `100`，范围 `1~500`
- `offset`：默认 `0`
- `includeArchived=1`：是否同时返回归档消息

响应示例：

```json
{
  "messages": [],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 0,
    "hasMore": false,
    "archivedTotal": 0
  },
  "archivedMessages": []
}
```

> 仅在 `includeArchived=1` 时返回 `archivedMessages` 与 `archivedTotal`。

### 3.1.5 获取房间可用模式
- **GET** `/api/games/:id/modes`

响应：

```json
{
  "modes": {},
  "combinableModes": {}
}
```

### 3.1.6 导入历史对局（JSON）
- **POST** `/api/games/import`

请求体应包含 `game.topic`。导入成功后会创建一个新的已结束房间。

响应示例：

```json
{
  "game": { "id": "NEWROOM1", "topic": "[导入] 中国古代史", "status": "finished" },
  "importedConcepts": 12,
  "importedMessages": 34
}
```

---

## 3.2 导出 `/api/export`

### 3.2.1 查询支持格式
- **GET** `/api/export/formats/list`

### 3.2.2 导出房间数据
- **GET** `/api/export/:gameId?format=json|markdown|csv|html`

说明：
- 返回文件流（`Content-Disposition: attachment`）。
- 如果房间不存在，返回 `404`。
- 若格式不支持，返回 `400`。

---

## 3.3 玩家画像 `/api/profile`

### 3.3.1 查询玩家资料
- **GET** `/api/profile/:playerId`

### 3.3.2 排行榜
- **GET** `/api/profile`

> 注意：代码注释写的是 `/api/leaderboard`，实际挂载路径是 `/api/profile`。

---

## 3.4 全局能力与健康检查

### 3.4.1 获取模式定义
- **GET** `/api/modes`

返回主模式、可叠加模式与 RAG 默认参数。

### 3.4.2 健康检查
- **GET** `/api/health`

响应示例：

```json
{
  "ok": true,
  "time": "2026-04-01T00:00:00.000Z"
}
```

---

## 4. 管理 API `/api/admin`

> 本节所有接口都需要管理员密钥。

## 4.1 系统与游戏管理

- **GET** `/api/admin/stats`：系统统计与近期房间
- **GET** `/api/admin/games?status=playing|finished|...`：查询房间列表
- **GET** `/api/admin/games/:id`：房间详情（概念、玩家、消息数）
- **DELETE** `/api/admin/games/:id`：删除房间及关联数据
- **POST** `/api/admin/games/:id/finish`：结束房间
- **POST** `/api/admin/games/:id/restore`：恢复进行中
- **PUT** `/api/admin/games/:id/notes`：更新备注
- **PUT** `/api/admin/games/:id/settings`：更新 settings
- **PUT** `/api/admin/games/:id/modes`：更新主模式与附加模式
- **POST** `/api/admin/games/:id/players/:playerId/lives`：调整玩家生命值

概念管理：

- **PUT** `/api/admin/games/:id/concepts/:conceptId`：编辑概念
- **DELETE** `/api/admin/games/:id/concepts/:conceptId`：删除概念

消息归档：

- **GET** `/api/admin/games/:id/messages`
- **GET** `/api/admin/games/:id/messages/archive`
- **POST** `/api/admin/messages/archive`

## 4.2 AI 配置管理

- **GET** `/api/admin/ai-configs`
- **POST** `/api/admin/ai-configs`
- **PUT** `/api/admin/ai-configs/:id`
- **DELETE** `/api/admin/ai-configs/:id`
- **POST** `/api/admin/ai-configs/:id/activate`
- **POST** `/api/admin/ai-configs/:id/test`
- **PUT** `/api/admin/ai-configs/:id/priority`

创建 AI 配置请求示例：

```json
{
  "name": "Claude 主配置",
  "provider_type": "anthropic",
  "base_url": null,
  "api_key": "sk-ant-***",
  "model": "claude-sonnet-4-20250514",
  "extra": {}
}
```

## 4.3 知识库管理

文档：

- **GET** `/api/admin/knowledge`
- **POST** `/api/admin/knowledge/upload`（`multipart/form-data`，字段名 `file`）
- **POST** `/api/admin/knowledge/text`
- **DELETE** `/api/admin/knowledge/:id`
- **POST** `/api/admin/knowledge/:id/vectorize`

连接检测：

- **POST** `/api/admin/knowledge/check/embedding`
- **POST** `/api/admin/knowledge/check/rerank`
- **POST** `/api/admin/knowledge/check/auxiliary`

AI 确认知识库：

- **GET** `/api/admin/ai-confirmed`
- **DELETE** `/api/admin/ai-confirmed/:id`
- **DELETE** `/api/admin/ai-confirmed`

## 4.4 审计与缓存

- **GET** `/api/admin/logs`
- **GET** `/api/admin/audit`
- **GET** `/api/admin/audit/:conceptId`
- **POST** `/api/admin/audit/:conceptId/override`
- **GET** `/api/admin/audit-log`
- **GET** `/api/admin/cache/stats`
- **DELETE** `/api/admin/cache`

## 4.5 结算恢复

- **GET** `/api/admin/settlements/incomplete`
- **POST** `/api/admin/settlements/:gameId/retry`
- **POST** `/api/admin/settlements/:gameId/rollback`
- **POST** `/api/admin/settlements/:gameId/abandon`

## 4.6 知识整理（Curation）

概念流转：

- **GET** `/api/admin/curation/pending`
- **GET** `/api/admin/curation/concepts?status=active|archived|...`
- **POST** `/api/admin/curation/concepts/:id/approve`
- **POST** `/api/admin/curation/concepts/approve-all`
- **POST** `/api/admin/curation/concepts/:id/archive`
- **DELETE** `/api/admin/curation/concepts/:id`
- **PUT** `/api/admin/curation/concepts/:id`
- **POST** `/api/admin/curation/concepts/merge`

分类管理：

- **GET** `/api/admin/curation/categories`
- **POST** `/api/admin/curation/categories`
- **DELETE** `/api/admin/curation/categories/:id`
- **POST** `/api/admin/curation/concepts/:id/categorize`
- **POST** `/api/admin/curation/concepts/categorize-batch`

---

## 5. WebSocket 事件（补充）

虽然本文件聚焦 HTTP API，但前端核心交互依赖 Socket.IO。以下是与管理接口联动的典型广播事件：

- `message:new`
- `players:update`
- `game:finished`
- `game:restored`
- `game:deleted`
- `concept:edited`
- `concept:deleted`

如需补充完整实时事件协议，建议在 `backend/src/socket/` 下进一步整理独立文档。

---

## 6. 调用示例

### 6.1 创建房间

```bash
curl -X POST http://localhost:3001/api/games \
  -H 'Content-Type: application/json' \
  -d '{"topic":"中国近代史","mode":"free"}'
```

### 6.2 管理员查询统计

```bash
curl 'http://localhost:3001/api/admin/stats?key=admin'
```

### 6.3 下载导出文件

```bash
curl -L 'http://localhost:3001/api/export/AB12CD34?format=markdown' -o 导出.md
```

---

## 7. 维护建议

1. 每次新增路由时，同步更新本文档。
2. 若返回结构变更（字段新增/重命名），优先保持向后兼容。
3. 建议后续引入 OpenAPI（Swagger）自动生成，减少文档与代码偏差。
