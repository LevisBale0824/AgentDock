@echo off
REM 停止 AgentDock 开发服务（Windows cmd）
cd /d "%~dp0.."

echo [stop] 停止 AgentDock 服务...

REM 清理占用端口的进程
for %%p in (8003 5173 5174) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p " ^| findstr LISTEN') do (
        echo [stop] 释放端口 %%p (PID: %%a)...
        taskkill /F /PID %%a 2>nul
    )
)

REM 额外清理 node / tsx / vite 相关进程
taskkill /F /IM node.exe 2>nul >nul

del /f .dev.pid 2>nul

echo [stop] 已停止
