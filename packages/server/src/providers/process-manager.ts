import { spawn, execSync, type ChildProcess } from 'child_process'
import * as net from 'node:net'
import { logger } from '@/logger'
import { findAvailablePort } from '@/utils'

// opencode 系列的标准健康端点（比 /session 更准；/session 可能 401/404 误判）
const HEALTH_PATH = '/global/health'
const MAX_RESPAWN_ATTEMPTS = 10
const MAX_RESPAWN_BACKOFF_MS = 30_000

interface SpawnOpts {
  cmd: string
  args?: string[]
  port?: number
  cwd?: string
  env?: Record<string, string>
}

interface ManagedProc {
  proc: ChildProcess
  port: number
  baseUrl: string
  spawnOpts: SpawnOpts // 记住参数，daemon 异常退出时按此 respawn
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

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

/** TCP 探测端口是否有人在 listen */
function isPortListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(500)
    const done = (v: boolean) => {
      socket.destroy()
      resolve(v)
    }
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
    socket.connect(port, '127.0.0.1')
  })
}

/**
 * 找到占用某端口的 PID 并杀掉其进程树。
 * 用途：opencode serve 会 daemonize（wrapper 早退、真正 server 变 orphan），
 * 仅 killTree(spawn 的 pid) 打不到真正监听端口的进程；热重载/崩溃后残留的
 * zombie 会占住端口导致下次 spawn EADDRINUSE。
 */
function killPidHoldingPort(port: number): void {
  const isWin = process.platform === 'win32'
  try {
    if (isWin) {
      const out = execSync(`netstat -ano -p TCP`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
      const pids = new Set<number>()
      for (const raw of out.split(/\r?\n/)) {
        const parts = raw.trim().split(/\s+/)
        if (parts.length < 5 || parts[0] !== 'TCP') continue
        const localAddr = parts[1]
        const state = parts[parts.length - 2]
        const pid = parseInt(parts[parts.length - 1], 10)
        if (state !== 'LISTENING') continue
        if (!localAddr.endsWith(`:${port}`)) continue
        if (Number.isFinite(pid) && pid > 0) pids.add(pid)
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' })
        } catch {
          /* best-effort */
        }
      }
    } else {
      const out = execSync(`lsof -ti tcp:${port} || true`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
      for (const line of out.split(/\r?\n/)) {
        const pid = parseInt(line, 10)
        if (Number.isFinite(pid) && pid > 0) {
          try {
            process.kill(pid, 'SIGTERM')
          } catch {
            /* best-effort */
          }
        }
      }
    }
  } catch (err) {
    logger.warn({ port, err }, 'killPidHoldingPort failed')
  }
}

class AgentProcessManager {
  private procs = new Map<string, ManagedProc>()
  private shuttingDown = false
  /** 主动 kill 的进程：其 exit 不应触发 respawn */
  private intentionallyKilled = new WeakSet<ChildProcess>()
  private failureCounts = new Map<string, number>()
  private respawnTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor() {
    const handler = (sig: string) => () => {
      void this.shutdown(sig)
    }
    process.on('SIGINT', handler('SIGINT'))
    process.on('SIGTERM', handler('SIGTERM'))
    process.on('beforeExit', handler('beforeExit'))
    process.on('exit', () => this.killAllSync())
  }

  async spawn(name: string, opts: SpawnOpts): Promise<string> {
    const preferredPort = opts.port ?? 4096
    const preferredUrl = `http://127.0.0.1:${preferredPort}`

    // 1) 复用 / adopt：固定端口上已有健康的 agent server（含上次崩溃残留的
    //    detached server）就直接用，避免 dev 热重载时 orphan 累积。
    if (await this.isHealthy(preferredUrl)) {
      logger.info({ name, baseUrl: preferredUrl }, 'reusing existing agent server')
      this.failureCounts.delete(name)
      return preferredUrl
    }

    // 2) 僵尸清理：端口被占但不健康（半死 wrapper / 上次崩溃残留）→ 按端口杀，
    //    否则下次 bind 会 EADDRINUSE。
    if (await isPortListening(preferredPort)) {
      logger.warn({ name, port: preferredPort }, 'zombie on port, cleaning up')
      killPidHoldingPort(preferredPort)
      await sleep(300)
    }

    // 3) 这是一次全新的启动（手动重启 / 切换 / 初始 boot），取消之前的退避 respawn。
    this.clearRespawnTimer(name)

    const port = await findAvailablePort(preferredPort)
    const args = [...(opts.args ?? []), '--port', String(port)]
    const isWin = process.platform === 'win32'
    const proc = spawn(opts.cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      // Unix：detached 让子进程自成进程组长，父 shell 的 SIGHUP 带不走它，
      // 也能用 process.kill(-pid) 杀整棵树；Windows：进程默认不随父退出，
      // detached 反而会弹新控制台窗口（忽略 windowsHide），故显式关闭。
      detached: !isWin,
      shell: isWin,
      windowsHide: true,
    })

    proc.stdout?.on('data', (d: Buffer) => logger.debug(`[${name}] ${d.toString().trim()}`))
    proc.stderr?.on('data', (d: Buffer) => logger.warn(`[${name}] ${d.toString().trim()}`))
    proc.on('exit', (code) => {
      logger.info({ name, code }, 'agent process exited')
      this.procs.delete(name)
      if (!this.shuttingDown && !this.intentionallyKilled.has(proc)) {
        this.scheduleRespawn(name, opts, `exit code ${code}`)
      }
      this.intentionallyKilled.delete(proc)
    })
    proc.on('error', (err) => {
      logger.error({ name, err }, 'agent process spawn error')
      if (!this.shuttingDown && !this.intentionallyKilled.has(proc)) {
        this.scheduleRespawn(name, opts, `spawn error: ${err.message}`)
      }
    })

    const baseUrl = `http://127.0.0.1:${port}`
    await this.waitForHealth(baseUrl, name)
    this.procs.set(name, { proc, port, baseUrl, spawnOpts: opts })
    this.failureCounts.delete(name)
    logger.info({ name, baseUrl }, 'agent server ready')
    return baseUrl
  }

  /** daemon 异常退出后按指数退避自动拉起，最多 MAX_RESPAWN_ATTEMPTS 次。 */
  private scheduleRespawn(name: string, opts: SpawnOpts, reason: string): void {
    const failures = this.failureCounts.get(name) ?? 0
    if (failures >= MAX_RESPAWN_ATTEMPTS) {
      logger.error({ name, MAX_RESPAWN_ATTEMPTS }, 'giving up respawn after consecutive failures')
      return
    }
    this.failureCounts.set(name, failures + 1)
    const backoff = Math.min(1000 * 2 ** failures, MAX_RESPAWN_BACKOFF_MS)
    logger.warn({ name, reason, backoff, attempt: failures + 1, of: MAX_RESPAWN_ATTEMPTS }, 'agent died, respawning')
    this.clearRespawnTimer(name)
    const timer = setTimeout(() => {
      this.respawnTimers.delete(name)
      this.spawn(name, opts).catch((err) => logger.error({ name, err }, 'respawn attempt failed'))
    }, backoff)
    this.respawnTimers.set(name, timer)
  }

  private clearRespawnTimer(name: string): void {
    const t = this.respawnTimers.get(name)
    if (t) {
      clearTimeout(t)
      this.respawnTimers.delete(name)
    }
  }

  /** 探测 baseUrl 是否已有健康的 agent server（用于复用判断）。
   *  优先 opencode 标准 /global/health；不可用时回退 /session（200/401/404 都算活着）。 */
  private async isHealthy(baseUrl: string): Promise<boolean> {
    try {
      const r = await fetch(`${baseUrl}${HEALTH_PATH}`)
      if (r.ok) return true
    } catch {
      // 端点不存在或未就绪，继续 fallback
    }
    try {
      const r = await fetch(`${baseUrl}/session`)
      return r.ok || r.status === 401 || r.status === 404
    } catch {
      return false
    }
  }

  private async waitForHealth(baseUrl: string, name: string, timeoutMs = 20000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await this.isHealthy(baseUrl)) return
      await sleep(300)
    }
    throw new Error(`${name} server not ready at ${baseUrl} within ${timeoutMs}ms`)
  }

  async shutdown(reason = 'shutdown'): Promise<void> {
    if (this.shuttingDown) return
    this.shuttingDown = true
    // 停止所有退避 respawn，避免关闭过程中又拉起
    for (const t of this.respawnTimers.values()) clearTimeout(t)
    this.respawnTimers.clear()

    logger.info({ reason, count: this.procs.size }, 'shutting down agent servers')

    for (const { proc } of this.procs.values()) {
      if (proc.pid) {
        this.intentionallyKilled.add(proc)
        killTree(proc.pid, 'SIGTERM')
      }
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
      if (proc.pid && proc.exitCode === null) {
        this.intentionallyKilled.add(proc)
        killTree(proc.pid, 'SIGKILL')
      }
    }
    this.procs.clear()
  }

  killAllSync(): void {
    for (const { proc } of this.procs.values()) {
      if (proc.pid && proc.exitCode === null) {
        this.intentionallyKilled.add(proc)
        killTree(proc.pid, 'SIGKILL')
      }
    }
  }
}

export const agentProcessManager = new AgentProcessManager()
