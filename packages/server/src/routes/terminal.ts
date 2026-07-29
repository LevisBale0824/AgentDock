import type { FastifyInstance } from 'fastify'
import type { IPty } from 'node-pty'
import os from 'os'
import { logger } from '@/logger'

type PtyModule = typeof import('node-pty')
let ptyCache: PtyModule | null = null

async function loadPty(): Promise<PtyModule | null> {
  if (ptyCache) return ptyCache
  try {
    ptyCache = await import('node-pty')
    return ptyCache
  } catch (err) {
    logger.error({ err }, 'node-pty 加载失败，终端不可用')
    return null
  }
}

export async function terminalRoutes(api: FastifyInstance) {
  api.get('/terminal', { websocket: true }, async (socket, req) => {
    const q = req.query as { cwd?: string }
    const cwd = q.cwd ?? os.homedir()
    const shell = process.env.SHELL ?? (os.platform() === 'win32' ? 'cmd.exe' : 'bash')

    const pty = await loadPty()
    if (!pty) {
      if (socket.readyState === socket.OPEN) {
        socket.send('\r\n[node-pty 未编译，终端暂不可用。仅聊天/Agent 功能可用]\r\n')
        socket.close()
      }
      return
    }

    logger.info({ cwd, shell }, 'terminal open')
    let proc: IPty | undefined

    try {
      const p = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd,
        env: process.env as Record<string, string>,
      })
      proc = p

      p.onData((data) => {
        if (socket.readyState === socket.OPEN) socket.send(data)
      })

      p.onExit(({ exitCode }: { exitCode: number }) => {
        logger.info({ exitCode }, 'terminal exit')
        if (socket.readyState === socket.OPEN) socket.close()
      })
    } catch (err) {
      logger.error({ err }, 'terminal error')
      return
    }

    socket.on('message', (msg: Buffer | string) => {
      try {
        const parsed = JSON.parse(msg.toString())
        if (parsed && typeof parsed === 'object' && parsed.type === 'resize') {
          proc?.resize?.(parsed.cols, parsed.rows)
        } else {
          proc?.write?.(msg.toString())
        }
      } catch {
        proc?.write?.(msg.toString())
      }
    })

    socket.on('close', () => {
      logger.info('terminal ws closed, killing pty')
      proc?.kill?.()
    })
  })
}
