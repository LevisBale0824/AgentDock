#!/usr/bin/env bash
# 停止 AgentDock 开发服务
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[stop] 停止 AgentDock 服务..."

# 从 PID 文件停止
if [ -f .dev.pid ]; then
  PID=$(cat .dev.pid)
  if kill -0 "$PID" 2>/dev/null; then
    echo "[stop] 终止进程组 (PID: $PID)..."
    # 先杀子进程，再杀父进程
    pkill -P "$PID" 2>/dev/null || true
    kill "$PID" 2>/dev/null && sleep 1
  fi
  rm -f .dev.pid
fi

# 兜底：清理占用端口的进程
for port in 8003 5173 5174; do
  if lsof -ti:"$port" 2>/dev/null; then
    echo "[stop] 释放端口 $port..."
    lsof -ti:"$port" | xargs kill -9 2>/dev/null || true
  fi
done

echo "[stop] 已停止"
