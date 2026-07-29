import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { logger } from '@/logger'
import { getRuntimeSession, setRuntimeSession } from '@/store'
import {
  getProvider,
  resolveProvider,
  rememberSession,
  forgetSession,
} from '@/providers/registry'
import type { AgentType, IncomingBlock, AgentOptions, ProviderEvent } from '@/providers/types'

function sseWrite(reply: FastifyReply, event: string, data: unknown) {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export async function sessionRoutes(api: FastifyInstance) {
  // ── 获取 Session 信息 ────────────────────────────────────
  api.get('/session/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const provider = await resolveProvider(id)
    const info = await provider.getSession(id)
    if (!info) return reply.code(404).send({ error: 'Session not found' })
    return info
  })

  // ── 删除 Session ────────────────────────────────────────
  api.delete('/session/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const provider = await resolveProvider(id)

    provider.abort(id)
    const deleted = await provider.deleteSession(id)
    forgetSession(id)

    if (!deleted) return reply.code(404).send({ error: 'Session not found' })
    logger.info({ sessionId: id }, 'session deleted')
    return { ok: true }
  })

  // ── 中止正在运行的 Session ──────────────────────────────
  api.post('/session/:id/abort', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const runtime = getRuntimeSession(id)
    if (runtime && runtime.status !== 'busy') {
      return reply.code(409).send({ error: 'Session is not busy' })
    }
    const provider = await resolveProvider(id)
    provider.abort(id)
    logger.info({ sessionId: id }, 'session aborted by user')
    return { ok: true }
  })

  // ── 重命名 Session ──────────────────────────────────────
  api.patch('/session/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const body = (req.body ?? {}) as { title?: string }
    if (typeof body.title !== 'string') return reply.code(400).send({ error: 'title is required' })

    const provider = await resolveProvider(id)
    await provider.renameSession(id, body.title.trim())
    return { ok: true }
  })

  // ── 消息历史 ────────────────────────────────────────────
  api.get('/session/:id/message', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const q = req.query as { offset?: string }
    const offset = parseInt(q.offset ?? '0')

    const provider = await resolveProvider(id)
    const session = await provider.getSession(id)
    if (!session) return reply.code(404).send({ error: 'Session not found' })
    return provider.getMessages(id, session.cwd, { offset })
  })

  // ── 回答 AskUserQuestion（human-in-the-loop）───────────
  api.post('/session/:id/message/resolve', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const body = (req.body ?? {}) as {
      answers?: Record<string, string>
      annotations?: Record<string, { preview?: string; notes?: string }>
    }
    if (!body.answers || typeof body.answers !== 'object') {
      return reply.code(400).send({ error: 'answers is required' })
    }

    const provider = await resolveProvider(id)
    const ok = provider.resolveApproval(id, {
      behavior: 'allow',
      updatedInput: {
        answers: body.answers,
        ...(body.annotations ? { annotations: body.annotations } : {}),
      },
    })

    if (!ok) return reply.code(409).send({ error: 'No pending question for this session' })
    return { ok: true }
  })

  // ── 发送消息（阻塞 or SSE 流式）────────────────────────
  //
  // id = 'new' → 新建会话，body.cwd 必填，body.agent 指定后端（默认 claude）
  // id = UUID  → 已有会话，自动解析归属 provider
  api.post('/session/:id/message', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const isNew = id === 'new'

    const body = (req.body ?? {}) as {
      prompt?: string
      content?: IncomingBlock[]
      cwd?: string
      agent?: AgentType
      bypassPermissions?: boolean
      options?: AgentOptions
    }

    // ── 解析 provider & cwd & sessionId ──
    let agentType: AgentType
    let sessionId: string | null
    let cwd: string

    if (isNew) {
      if (!body.cwd) return reply.code(400).send({ error: 'cwd is required for new sessions' })
      agentType = (body.agent ?? 'claude') as AgentType
      sessionId = null
      cwd = body.cwd
    } else {
      sessionId = id
      const resolved = await resolveProvider(id)
      let resolvedCwd = body.cwd ?? getRuntimeSession(id)?.cwd
      if (!resolvedCwd) {
        const session = await resolved.getSession(id)
        resolvedCwd = session?.cwd
      }
      if (!resolvedCwd) return reply.code(400).send({ error: 'cwd not found for session' })
      cwd = resolvedCwd
      agentType = resolved.type
    }

    const provider = getProvider(agentType)

    // busy 检查（阶段 2：仅 Claude runtime 持有 busy 状态）
    if (sessionId) {
      const rt = getRuntimeSession(sessionId)
      if (rt?.status === 'busy') {
        logger.warn({ sessionId }, 'session busy, rejected')
        return reply.code(409).send({ error: 'Session is busy' })
      }
    }

    const bypassPermissions = body.bypassPermissions !== false

    // 统一转成 IncomingBlock[]
    let content: IncomingBlock[]
    if (body.content?.length) {
      content = body.content
    } else {
      const prompt = (body.prompt ?? '').trim()
      if (!prompt) return reply.code(400).send({ error: 'prompt is required' })
      content = [{ type: 'text', text: prompt }]
    }

    const wantsStream =
      req.headers['accept'] === 'text/event-stream' || (req.query as any).stream === '1'

    const runRequest = {
      cwd,
      sessionId,
      content,
      bypassPermissions,
      options: body.options ?? {},
    }

    logger.info({ sessionId: id, isNew, agent: agentType }, 'starting agent')

    if (wantsStream) {
      reply.hijack()
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      })

      let resolvedSessionId = sessionId

      // 已有 session 直接标记运行中（新建 session 由下方 session_assigned 标记）
      if (resolvedSessionId) {
        setRuntimeSession({
          sessionId: resolvedSessionId,
          projectDirName: '',
          cwd: runRequest.cwd,
          status: 'busy',
          abort: null,
        })
      }

      for await (const ev of provider.streamMessage(runRequest) as AsyncIterable<ProviderEvent>) {
        if (ev.type === 'session_assigned') {
          resolvedSessionId = ev.sessionId
          rememberSession(ev.sessionId, provider.type)
          setRuntimeSession({
            sessionId: ev.sessionId,
            projectDirName: '',
            cwd: runRequest.cwd,
            status: 'busy',
            abort: null,
          })
          continue
        }
        if (ev.type === 'message') {
          sseWrite(reply, 'message', ev.message)
        } else if (ev.type === 'ask_user') {
          sseWrite(reply, 'ask_user', { questions: ev.questions })
        } else if (ev.type === 'error') {
          sseWrite(reply, 'error', { message: ev.message })
        } else if (ev.type === 'done') {
          sseWrite(reply, 'done', {
            sessionId: resolvedSessionId,
            cost: ev.cost,
            tokens: ev.tokens,
          })
        }
      }
      // 标记会话完成
      if (resolvedSessionId) {
        const rt = getRuntimeSession(resolvedSessionId)
        if (rt) setRuntimeSession({ ...rt, status: 'idle' })
      }
      reply.raw.end()
      return reply
    }

    // 阻塞模式
    const result = await provider.runMessage(runRequest)
    if (result.sessionId) rememberSession(result.sessionId, provider.type)
    return result
  })
}
