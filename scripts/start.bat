@echo off
REM 启动 AgentDock 开发服务（Windows cmd）
cd /d "%~dp0.."

REM 先清理旧进程
call scripts\stop.bat

echo [start] 启动服务...

REM 在新的 cmd 窗口中启动 pnpm dev（避免阻塞本窗口）
start "AgentDock" cmd /c "pnpm dev"

echo [start] AgentDock 正在启动...
echo   - 后端: http://localhost:8003
echo   - 前端: http://localhost:5173
echo   - API:  http://localhost:8003/docs
echo.
echo   停止服务: scripts\stop.bat
