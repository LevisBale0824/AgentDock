import { spawn, execSync, type ChildProcess } from 'child_process'
import { logger } from '@/logger'
import { findAvailablePort } from '@/utils'

function killTree(pid: number, signal: 'SIGTERM' | 'SIGKILL'): void {
  try {
    if (process.platform === 'win32') {
      const f = signal === 'SIGKILL' ? '/F' : ''
      execSync(`taskkill /pid ${pid} /T ${f}`, { stdio: 'ignore' })
    } else {
      try {
        process.kill(-pid, signal)
      } catch {
        process.kill(pid, signal)
      }
    }
  } catch {
    // 进程已退出
  }
}

interface ManagedProc {
  proc: ChildProcess
  port: number
  baseUrl: string
}

class AgentProcessManager {
  private procs = new Map<string, ManagedProc>()
  private shuttingDown = false

  constructor() {
    const handler = (sig: string) => () => {
      void this.shutdown(sig)
    }
    process.on('SIGINT', handler('SIGINT'))
    process.on('SIGTERM', handler('SIGTERM'))
    process.on('beforeExit', handler('beforeExit'))
    process.on('exit', () => this.killAllSync())
  }

  async spawn(
    name: string,
    opts: {
      cmd: string
      args?: string[]
      port?: number
      cwd?: string
      env?: Record<string, string>
    }
  ): Promise<string> {
    const preferredPort = opts.port ?? 4096

    // 复用：固定端口上已有健康的 agent server 就直接用，避免 dev 热重载时旧进程
    // 残留（orphan）占据端口 → 新进程 ServeError 退出 → orphan 不断累积。
    const preferredUrl = `http://127.0.0.1:${preferredPort}`
    if (await this.isHealthy(preferredUrl)) {
      logger.info({ name, baseUrl: preferredUrl }, 'reusing existing agent server')
      return preferredUrl
    }

    const port = await findAvailablePort(preferredPort)
    const args = [...(opts.args ?? []), '--port', String(port)]
    const proc = spawn(opts.cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      shell: process.platform === 'win32',
    })

    proc.stdout?.on('data', (d: Buffer) =>
      logger.debug(`[${name}] ${d.toString().trim()}`)
    )
    proc.stderr?.on('data', (d: Buffer) =>
      logger.warn(`[${name}] ${d.toString().trim()}`)
    )
    proc.on('exit', (code) => {
      logger.info({ name, code }, 'agent process exited')
      this.procs.delete(name)
    })

    const baseUrl = `http://127.0.0.1:${port}`
    await this.waitForHealth(baseUrl, name, 20000)
    this.procs.set(name, { proc, port, baseUrl })
    logger.info({ name, baseUrl }, 'agent server ready')
    return baseUrl
  }

  /** 探测 baseUrl 是否已有健康的 agent server（用于复用判断）*/
  private async isHealthy(baseUrl: string): Promise<boolean> {
    try {
      const r = await fetch(`${baseUrl}/session`)
      return r.ok || r.status === 401 || r.status === 404
    } catch {
      return false
    }
  }

  private async waitForHealth(baseUrl: string, name: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const r = await fetch(`${baseUrl}/session`)
        if (r.ok || r.status === 401 || r.status === 404) return
      } catch {
        // server 还没起来
      }
      await new Promise((res) => setTimeout(res, 300))
    }
    throw new Error(`${name} server not ready at ${baseUrl} within ${timeoutMs}ms`)
  }

  async shutdown(reason = 'shutdown'): Promise<void> {
    if (this.shuttingDown) return
    this.shuttingDown = true
    logger.info({ reason, count: this.procs.size }, 'shutting down agent servers')

    for (const { proc } of this.procs.values()) {
      if (proc.pid) killTree(proc.pid, 'SIGTERM')
    }

    const deadline = Date.now() + 4000
    await Promise.all(
      [...this.procs.values()].map(({ proc }) =>
        new Promise<void>((resolve) => {
          if (proc.exitCode !== null) return resolve()
          const check = setInterval(() => {
            if (proc.exitCode !== null || Date.now() > deadline) {
              clearInterval(check)
              resolve()
            }
          }, 100)
          proc.once('exit', () => {
            clearInterval(check)
            resolve()
          })
        })
      )
    )

    for (const { proc } of this.procs.values()) {
      if (proc.pid && proc.exitCode === null) killTree(proc.pid, 'SIGKILL')
    }
    this.procs.clear()
  }

  killAllSync(): void {
    for (const { proc } of this.procs.values()) {
      if (proc.pid && proc.exitCode === null) killTree(proc.pid, 'SIGKILL')
    }
  }
}

export const agentProcessManager = new AgentProcessManager()
