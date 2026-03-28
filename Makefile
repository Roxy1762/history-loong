# ─────────────────────────────────────────────────────────────────────────────
#  history-loong Makefile
#  常用命令：make help
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: help setup setup-prod quick dev dev-backend dev-frontend \
        install build start \
        docker docker-build docker-dev docker-prod docker-stop \
        logs update backup restore clean clean-data reset

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

quick: ## 🚀 傻瓜一键部署（Docker，交互式配置）
	@bash setup.sh --quick

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

# ── 升级 ──────────────────────────────────────────────────────────────────────

update: ## 🔄 拉取最新代码并重启（零停机热更新）
	@echo "拉取最新代码..."
	@git pull --ff-only
	@echo "重建镜像..."
	@docker build -t history-loong .
	@echo "滚动重启..."
	@docker compose -f docker-compose.prod.yml up -d --no-deps app
	@echo "✓ 更新完成"

# ── 数据备份 ──────────────────────────────────────────────────────────────────

BACKUP_DIR ?= ./backups
BACKUP_FILE := $(BACKUP_DIR)/history-loong-$(shell date +%Y%m%d-%H%M%S).db

backup: ## 💾 备份数据库到 ./backups/
	@mkdir -p $(BACKUP_DIR)
	@if docker ps -q -f name=history-loong | grep -q .; then \
		docker exec history-loong sqlite3 /app/data/history-loong.db ".backup /tmp/backup.db" && \
		docker cp history-loong:/tmp/backup.db $(BACKUP_FILE) && \
		echo "✓ 已备份到 $(BACKUP_FILE)"; \
	elif [ -f ./data/history-loong.db ]; then \
		cp ./data/history-loong.db $(BACKUP_FILE) && \
		echo "✓ 已备份到 $(BACKUP_FILE)"; \
	else \
		echo "✗ 未找到数据库，请确认服务已运行"; exit 1; \
	fi

restore: ## ♻️  从备份还原（用法：make restore FILE=./backups/xxx.db）
ifndef FILE
	@echo "用法：make restore FILE=./backups/history-loong-YYYYMMDD-HHMMSS.db"
	@echo ""
	@echo "可用备份："
	@ls -lh $(BACKUP_DIR)/*.db 2>/dev/null || echo "  （暂无备份）"
	@exit 1
endif
	@read -p "⚠  确认用 $(FILE) 覆盖当前数据？(y/N) " c; [ "$$c" = "y" ] || exit 0
	@if docker ps -q -f name=history-loong | grep -q .; then \
		docker cp $(FILE) history-loong:/app/data/history-loong.db && \
		docker restart history-loong && \
		echo "✓ 已还原并重启"; \
	else \
		cp $(FILE) ./data/history-loong.db && echo "✓ 已还原"; \
	fi

# ── 维护 ──────────────────────────────────────────────────────────────────────

clean: ## 清理构建产物和依赖（不删除数据库）
	@rm -rf frontend/dist
	@rm -rf node_modules backend/node_modules frontend/node_modules
	@echo "✓ 已清理"

clean-data: ## 删除数据库（⚠ 不可恢复）
	@read -p "确认删除所有数据？(y/N) " c; [ "$$c" = "y" ] && rm -rf data/ && echo "✓ 已删除" || echo "取消"

reset: clean install build ## 完全重置：清理 + 重装 + 重建
