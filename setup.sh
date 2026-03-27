#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  history-loong setup script
#  一键安装并启动，适用于 macOS / Linux
#  用法：bash setup.sh [--dev | --prod | --docker]
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

# ── 检查 .env ─────────────────────────────────────────────────────────────────
setup_env() {
  if [ ! -f .env ]; then
    cp .env.example .env
    warn ".env 文件已创建，请填入 API Key 后重新运行"
    echo ""
    echo "  编辑命令：nano .env  或  open .env（macOS）"
    echo ""
    echo "  至少需要以下其一："
    echo "    ANTHROPIC_API_KEY=sk_ant_xxxxx   # Claude"
    echo "    OPENAI_API_KEY=sk-xxxxx           # OpenAI 或兼容接口"
    echo ""
    exit 0
  fi

  # 检查是否已填写 API Key
  if grep -q "your_anthropic_api_key_here" .env 2>/dev/null; then
    warn "检测到 .env 中的 API Key 未替换，请先编辑 .env 文件"
    warn "也可在后台 /admin 页面配置 AI 接口"
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
    echo "  🌐 应用地址：http://localhost:3001"
    echo "  ⚙️  后台管理：http://localhost:3001/admin"
    echo "  📋 查看日志：docker compose -f docker-compose.prod.yml logs -f"
    echo "  🛑 停止服务：docker compose -f docker-compose.prod.yml down"
    ;;

  --prod | -p)
    header "生产模式（本地）"
    setup_env
    check_deps
    install_deps
    build_frontend
    info "启动生产服务器..."
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
