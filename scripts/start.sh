#!/usr/bin/env bash
# 启动 AgentDock 开发服务（后端 + 前端）
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# 杀掉旧进程（如果存在）
if [ -f .dev.pid ]; then
  OLD_PID=$(cat .dev.pid)
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[stop] 正在停止旧服务 (PID: $OLD_PID)..."
    kill "$OLD_PID" 2>/dev/null && sleep 1
    # 额外清理子进程
    pkill -P "$OLD_PID" 2>/dev/null || true
  fi
  rm -f .dev.pid
fi

# 确保端口未被占用
for port in 8003 5173; do
  if lsof -ti:"$port" 2>/dev/null; then
    echo "[cleanup] 正在释放端口 $port..."
    lsof -ti:"$port" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
done

echo "[start] 启动服务..."
pnpm dev &
DEV_PID=$!
echo "$DEV_PID" > .dev.pid

echo "[start] AgentDock 启动中（PID: $DEV_PID）..."
echo "  → 后端: http://localhost:8003"
echo "  → 前端: http://localhost:5173"
echo "  → API 文档: http://localhost:8003/docs"
echo ""
echo "  停止服务: bash scripts/stop.sh"
