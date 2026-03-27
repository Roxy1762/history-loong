# ─────────────────────────────────────────────────────────────────────────────
#  history-loong Makefile
#  常用命令：make help
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: help setup dev prod docker docker-dev logs stop clean install build

# 默认目标
.DEFAULT_GOAL := help

help: ## 显示所有可用命令
	@echo ""
	@echo "  🐉 历史接龙 History-Loong"
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / \
		{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""

# ── 初始化 ────────────────────────────────────────────────────────────────────

setup: ## 一键初始化（复制.env、安装依赖）
	@bash setup.sh --dev

setup-prod: ## 初始化并构建（生产模式）
	@bash setup.sh --prod

# ── 开发 ──────────────────────────────────────────────────────────────────────

install: ## 安装所有依赖
	@npm install
	@cd backend && npm install
	@cd frontend && npm install

dev: ## 启动开发服务器（前后端热重载）
	@npm run dev

dev-backend: ## 仅启动后端（nodemon）
	@npm run dev:backend

dev-frontend: ## 仅启动前端（Vite）
	@npm run dev:frontend

# ── 构建 & 生产 ───────────────────────────────────────────────────────────────

build: ## 构建前端静态文件
	@cd frontend && npm run build

start: ## 启动生产服务器（需先 make build）
	@npm run start

# ── Docker ────────────────────────────────────────────────────────────────────

docker: ## 构建 Docker 镜像 + 生产启动
	@bash setup.sh --docker

docker-build: ## 仅构建 Docker 镜像
	@docker build -t history-loong .

docker-dev: ## Docker 开发模式（热重载）
	@docker compose up

docker-prod: ## Docker 生产模式（后台运行）
	@docker compose -f docker-compose.prod.yml up -d

docker-stop: ## 停止 Docker 容器
	@docker compose -f docker-compose.prod.yml down

logs: ## 查看 Docker 生产日志
	@docker compose -f docker-compose.prod.yml logs -f

# ── 维护 ──────────────────────────────────────────────────────────────────────

clean: ## 清理构建产物和依赖（不删除数据库）
	@rm -rf frontend/dist
	@rm -rf node_modules backend/node_modules frontend/node_modules
	@echo "✓ 已清理"

clean-data: ## 删除数据库（⚠ 不可恢复）
	@read -p "确认删除所有数据？(y/N) " c; [ "$$c" = "y" ] && rm -rf data/ && echo "✓ 已删除" || echo "取消"

reset: clean install build ## 完全重置：清理 + 重装 + 重建
