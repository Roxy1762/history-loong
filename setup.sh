#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  history-loong setup script
#  一键安装并启动，适用于 macOS / Linux
#  用法：bash setup.sh [--dev | --prod | --docker | --quick]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── 颜色输出 ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}ℹ${NC}  $*"; }
success() { echo -e "${GREEN}✓${NC}  $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✗${NC}  $*" >&2; }
header()  { echo -e "\n${BOLD}$*${NC}"; }

MODE="${1:---dev}"

header "🐉 历史接龙 History-Loong Setup"
echo "模式：$MODE"
echo "───────────────────────────────────"

# ── 交互式配置 .env ───────────────────────────────────────────────────────────
setup_env() {
  if [ ! -f .env ]; then
    cp .env.example .env
    info ".env 已从模板创建"
  fi

  # 如果 API Key 还是占位符，尝试交互式询问
  if grep -q "your_anthropic_api_key_here" .env 2>/dev/null; then
    # 只有在终端交互时才提示
    if [ -t 0 ]; then
      echo ""
      echo -e "${BOLD}配置 AI 接口${NC}（也可跳过，稍后在 /admin 页面设置）"
      echo ""
      echo "  支持的 AI 提供商："
      echo "    [1] Anthropic Claude（推荐）"
      echo "    [2] OpenAI / 兼容接口（DeepSeek、Qwen、Ollama 等）"
      echo "    [3] 跳过，稍后在后台配置"
      echo ""
      read -rp "  请选择 [1/2/3]（默认 3）: " AI_CHOICE
      AI_CHOICE="${AI_CHOICE:-3}"

      case "$AI_CHOICE" in
        1)
          read -rp "  Anthropic API Key (sk_ant_...): " ANTHROPIC_KEY
          if [ -n "$ANTHROPIC_KEY" ]; then
            sed -i.bak "s|ANTHROPIC_API_KEY=your_anthropic_api_key_here|ANTHROPIC_API_KEY=${ANTHROPIC_KEY}|" .env
            rm -f .env.bak
            success "Anthropic API Key 已写入 .env"
          fi
          ;;
        2)
          read -rp "  OpenAI Base URL（默认 https://api.openai.com/v1）: " OAI_URL
          OAI_URL="${OAI_URL:-https://api.openai.com/v1}"
          read -rp "  API Key: " OAI_KEY
          if [ -n "$OAI_KEY" ]; then
            sed -i.bak \
              -e "s|# OPENAI_BASE_URL=.*|OPENAI_BASE_URL=${OAI_URL}|" \
              -e "s|# OPENAI_API_KEY=.*|OPENAI_API_KEY=${OAI_KEY}|" .env
            rm -f .env.bak
            success "OpenAI 配置已写入 .env"
          fi
          ;;
        *)
          warn "跳过 API Key 配置，请在 /admin 页面完成设置"
          ;;
      esac

      # 可选：修改管理员密钥
      echo ""
      read -rp "  设置管理后台密钥（默认 admin，建议修改）: " NEW_ADMIN_KEY
      if [ -n "$NEW_ADMIN_KEY" ] && [ "$NEW_ADMIN_KEY" != "admin" ]; then
        sed -i.bak "s|ADMIN_KEY=admin|ADMIN_KEY=${NEW_ADMIN_KEY}|" .env
        rm -f .env.bak
        success "管理员密钥已更新"
      fi
    else
      warn "检测到 .env 中的 API Key 未替换，请编辑 .env 或在 /admin 页面配置"
    fi
  fi
}

# ── 检查依赖 ──────────────────────────────────────────────────────────────────
check_deps() {
  header "检查运行环境"

  # Node.js
  if ! command -v node &>/dev/null; then
    error "未找到 Node.js，请先安装：https://nodejs.org/en/download"
    exit 1
  fi
  NODE_VER=$(node -v | sed 's/v//')
  NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
  if [ "$NODE_MAJOR" -lt 16 ]; then
    error "Node.js 版本过低（当前 v${NODE_VER}），需要 >= v16"
    exit 1
  fi
  success "Node.js $(node -v)"

  # npm
  command -v npm &>/dev/null && success "npm $(npm -v)" || { error "未找到 npm"; exit 1; }
}

check_docker() {
  if ! command -v docker &>/dev/null; then
    error "未找到 Docker，请先安装：https://docs.docker.com/get-docker/"
    exit 1
  fi
  success "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

  if ! command -v docker-compose &>/dev/null && ! docker compose version &>/dev/null 2>&1; then
    error "未找到 docker compose"
    exit 1
  fi
  success "Docker Compose 可用"
}

# ── 安装依赖 ──────────────────────────────────────────────────────────────────
install_deps() {
  header "安装依赖包"
  info "安装根目录依赖..."
  npm install --silent
  info "安装后端依赖..."
  (cd backend && npm install --silent)
  info "安装前端依赖..."
  (cd frontend && npm install --silent)
  success "所有依赖安装完成"
}

# ── 构建前端 ──────────────────────────────────────────────────────────────────
build_frontend() {
  header "构建前端"
  (cd frontend && npm run build)
  success "前端构建完成 → frontend/dist/"
}

# ── 主流程 ────────────────────────────────────────────────────────────────────
case "$MODE" in

  --quick | -q)
    # 傻瓜模式：只需 Docker，交互配置后一键启动
    header "快速部署模式（Docker）"
    check_docker
    setup_env

    # 询问端口
    if [ -t 0 ]; then
      read -rp "  监听端口（默认 3001）: " APP_PORT
      APP_PORT="${APP_PORT:-3001}"
      if [ "$APP_PORT" != "3001" ]; then
        sed -i.bak "s|APP_PORT=.*|APP_PORT=${APP_PORT}|g" .env 2>/dev/null || true
        # 若 .env 中没有 APP_PORT 则追加
        grep -q "^APP_PORT=" .env || echo "APP_PORT=${APP_PORT}" >> .env
        rm -f .env.bak
      fi
    else
      APP_PORT="${APP_PORT:-3001}"
    fi

    # 检查是否有预构建镜像
    GHCR_IMAGE="ghcr.io/$(git remote get-url origin 2>/dev/null | sed 's|.*github.com[:/]\(.*\)\.git|\1|' | tr '[:upper:]' '[:lower:]'):latest"
    if docker pull "$GHCR_IMAGE" 2>/dev/null; then
      success "已拉取最新镜像：$GHCR_IMAGE"
      sed -i.bak "s|image: history-loong:latest|image: ${GHCR_IMAGE}|" docker-compose.prod.yml 2>/dev/null || true
      rm -f docker-compose.prod.yml.bak
    else
      info "本地构建镜像中（首次约 2-3 分钟）..."
      docker build -t history-loong .
    fi

    docker compose -f docker-compose.prod.yml up -d
    success "启动成功！"
    echo ""
    echo "  🌐 应用地址：http://localhost:${APP_PORT}"
    echo "  ⚙️  后台管理：http://localhost:${APP_PORT}/admin"
    echo "  📋 查看日志：docker compose -f docker-compose.prod.yml logs -f"
    echo "  🛑 停止服务：docker compose -f docker-compose.prod.yml down"
    echo "  🔄 更新版本：make update"
    ;;

  --docker | -d)
    header "Docker 部署模式"
    setup_env
    check_docker
    info "构建镜像..."
    docker build -t history-loong .
    info "启动容器..."
    docker compose -f docker-compose.prod.yml up -d
    success "启动成功！"
    echo ""
    echo "  🌐 应用地址：http://localhost:${APP_PORT:-3001}"
    echo "  ⚙️  后台管理：http://localhost:${APP_PORT:-3001}/admin"
    echo "  📋 查看日志：docker compose -f docker-compose.prod.yml logs -f"
    echo "  🛑 停止服务：docker compose -f docker-compose.prod.yml down"
    ;;

  --prod | -p)
    header "生产模式（本地）"
    setup_env
    check_deps
    install_deps
    build_frontend
    echo ""
    success "安装完成！使用以下命令启动："
    echo ""
    echo "  npm run start"
    echo ""
    echo "  🌐 应用地址：http://localhost:3001"
    echo "  ⚙️  后台管理：http://localhost:3001/admin"
    ;;

  --dev | *)
    header "开发模式"
    setup_env
    check_deps
    install_deps
    echo ""
    success "安装完成！启动开发服务器："
    echo ""
    echo "  npm run dev"
    echo ""
    echo "  🌐 前端：http://localhost:5173"
    echo "  🔧 后端：http://localhost:3001"
    echo "  ⚙️  后台：http://localhost:3001/admin  （密钥：admin）"
    ;;
esac
