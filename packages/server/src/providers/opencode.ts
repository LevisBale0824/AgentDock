import { createOpencodeClient } from '@opencode-ai/sdk'
import { logger } from '@/logger'
import { AsyncQueue } from './queue'
import type {
  AgentProvider,
  AgentType,
  BackendCapabilities,
  CanonicalMessage,
  CanonicalPart,
  CanonicalSession,
  IncomingBlock,
  ProviderEvent,
  RunRequest,
  RunResult,
  TokenUsage,
} from './types'

export interface OpenCodeProviderConfig {
  type: AgentType
  label: string
  baseUrl: string
  agent?: string
  /** 指定 AI 模型（providerID/modelID），不依赖 opencode account 默认设置 */
  model?: { providerID: string; modelID: string }
}

const CAPABILITIES: BackendCapabilities = {
  sessions: true,
  sessionRename: true,
  sessionFork: true,
  sessionRevert: true,
  files: true,
  terminal: true,
  permissions: true,
  questions: true,
  todos: true,
  imageInput: true,
  diff: true,
  blocking: true,
}

function extractBase64(url: string): string | null {
  const m = String(url ?? '').match(/^data:[^;]+;base64,(.+)$/)
  return m ? m[1] : null
}

// opencode Part → CanonicalPart[]
function opencodePartToCanonical(part: any): CanonicalPart[] {
  switch (part.type) {
    case 'text':
      if (part.synthetic || part.ignored || !part.text) return []
      return [{ type: 'text', text: part.text }]
    case 'reasoning':
      return part.text ? [{ type: 'reasoning', text: part.text }] : []
    case 'tool': {
      const parts: CanonicalPart[] = []
      const state = part.state ?? {}
      parts.push({
        type: 'tool_call',
        id: part.callID,
        tool: part.tool,
        input: state.input ?? {},
      })
      if (state.status === 'completed') {
        const images = (state.attachments ?? [])
          .filter((a: any) => a.mime?.startsWith('image/'))
          .map((a: any) => ({ mediaType: a.mime, data: extractBase64(a.url) }))
          .filter((i: any) => i.data)
        parts.push({
          type: 'tool_result',
          id: part.callID,
          content: String(state.output ?? ''),
          images: images.length ? images : undefined,
        })
      } else if (state.status === 'error') {
        parts.push({
          type: 'tool_result',
          id: part.callID,
          content: String(state.error ?? 'error'),
          isError: true,
        })
      }
      return parts
    }
    case 'file':
      if (part.mime?.startsWith('image/')) {
        const data = extractBase64(part.url)
        if (data) return [{ type: 'image', mediaType: part.mime, data }]
      }
      return []
    case 'step-start':
      return [{ type: 'step_start' }]
    default:
      return []
  }
}

function extractSessionId(ev: any): string | undefined {
  return (
    ev.properties?.sessionID ??
    ev.properties?.info?.sessionID ??
    ev.properties?.part?.sessionID
  )
}

function toCanonicalSession(
  s: any,
  agent: AgentType,
  status: 'idle' | 'busy' = 'idle'
): CanonicalSession {
  return {
    id: s.id,
    title: s.title ?? '',
    cwd: s.directory ?? '',
    agent,
    status,
    lastModified: s.time?.updated ?? s.time?.created ?? Date.now(),
    createdAt: s.time?.created,
  }
}

export function createOpenCodeProvider(config: OpenCodeProviderConfig): AgentProvider {
  const client = createOpencodeClient({ baseUrl: config.baseUrl } as any)

  // eventStreamActive：全局事件流是否已在后台消费；streamReady：连接建立后放行等待中的请求
  // 关键：不能 await 整个 for-await 循环（SSE 长连接永不结束），否则 streamMessage 会永久阻塞、消息永远发不出
  let eventStreamActive = false
  let streamReady: Promise<void> | null = null
  const sessionQueues = new Map<string, AsyncQueue<any>>()
  const pendingPermissions = new Map<string, string>()

  function ensureEventStream(): Promise<void> {
    if (eventStreamActive && streamReady) return streamReady
    eventStreamActive = true
    let resolveReady!: () => void
    streamReady = new Promise<void>((r) => {
      resolveReady = r
    })
    ;(async () => {
      try {
        // opencode SDK(Hey API) 订阅事件用 subscribe()，返回 { stream }（AsyncGenerator），不是 list()
        const { stream } = await (client as any).event.subscribe()
        resolveReady() // 连接已建立，放行等待中的 streamMessage；后台继续消费事件
        for await (const ev of stream) {
          logger.debug({ type: ev.type }, '[opencode] sse raw event')
          const sid = extractSessionId(ev)
          if (sid) {
            const q = sessionQueues.get(sid)
            if (q) q.push(ev)
          }
          if (ev.type === 'permission.updated' && ev.properties?.sessionID) {
            pendingPermissions.set(ev.properties.sessionID, ev.properties.id)
          }
        }
      } catch (err) {
        logger.error({ err, type: config.type }, 'opencode event stream ended')
        resolveReady() // 兜底：连接失败也放行，避免 streamMessage 永久挂起
      } finally {
        eventStreamActive = false
      }
    })()
    return streamReady
  }

  const provider: AgentProvider = {
    type: config.type,
    capabilities: CAPABILITIES,

    async getSession(sessionId) {
      try {
        const res = await client.session.get({ path: { id: sessionId } })
        const s = ((res as any).data ?? res) as any
        return toCanonicalSession(s, config.type)
      } catch {
        return null
      }
    },

    async listSessions(_cwd) {
      try {
        const res = await client.session.list({} as any)  // 不按目录过滤，前端会按 project.id 分组
        const sessions = ((res as any).data ?? res) as any[]
        return sessions.map((s) => toCanonicalSession(s, config.type))
      } catch {
        return []
      }
    },

    async deleteSession(sessionId) {
      try {
        await client.session.delete({ path: { id: sessionId } })
        return true
      } catch {
        return false
      }
    },

    async renameSession(sessionId, title) {
      await client.session.update({ path: { id: sessionId }, body: { title } })
    },

    async getMessages(sessionId) {
      const res = await client.session.messages({ path: { id: sessionId } })
      const result = ((res as any).data ?? res) as any[]
      const out: CanonicalMessage[] = []
      for (const item of result) {
        const info = item.info
        const parts = (item.parts ?? []).flatMap(opencodePartToCanonical)
        if (parts.length > 0) {
          out.push({ id: info.id, role: info.role, parts })
        }
      }
      return out
    },

    async runMessage(req: RunRequest): Promise<RunResult> {
      let sessionId = req.sessionId
      const messages: CanonicalMessage[] = []
      let cost: number | undefined
      let tokens: TokenUsage | undefined
      for await (const ev of provider.streamMessage(req)) {
        if (ev.type === 'session_assigned') sessionId = ev.sessionId
        if (ev.type === 'message') messages.push(ev.message)
        if (ev.type === 'done') {
          cost = ev.cost
          tokens = ev.tokens
        }
      }
      return { sessionId, messages, cost, tokens }
    },

    async *streamMessage(req: RunRequest): AsyncIterable<ProviderEvent> {
      await ensureEventStream()

      let sessionId: string
      if (req.sessionId) {
        sessionId = req.sessionId
      } else {
        const createRes = await client.session.create({ body: { directory: req.cwd } } as any)
        const s = ((createRes as any).data ?? createRes) as any
        sessionId = s.id
        yield { type: 'session_assigned', sessionId }
        // 用用户首条消息作为会话标题（opencode 不会自动总结标题，不像 claude）
        const firstMsg = req.content?.find((b: IncomingBlock) => b.type === 'text')?.text?.trim()
        if (firstMsg) {
          client.session.update({ path: { id: sessionId }, body: { title: firstMsg.slice(0, 60) } } as any).catch(() => {})
        }
      }

      const queue = new AsyncQueue<any>()
      sessionQueues.set(sessionId, queue)

      const partLatest = new Map<string, CanonicalPart[]>()
      const partOrder = new Map<string, string[]>()
      const yieldedMsgIds = new Set<string>()  // 同一条消息只 yield 一次，避免重复

      const ocParts = req.content.map((b: IncomingBlock) =>
        b.type === 'image'
          ? { type: 'file', url: `data:${b.media_type};base64,${b.data}`, mime: b.media_type }
          : { type: 'text', text: b.text }
      )

      await client.session.promptAsync({
        path: { id: sessionId },
        body: {
          parts: ocParts,
          agent: config.agent ?? 'general',
          ...(config.model ? { model: config.model } : {}),
        },
      } as any)

      let cost: number | undefined
      let tokens: TokenUsage | undefined

      try {
        for await (const ev of queue) {
          const t = ev.type as string
          logger.info(
            {
              type: t,
              sid: ev.properties?.sessionID,
              status: ev.properties?.status?.type,
              role: ev.properties?.info?.role,
              completed: ev.properties?.info?.time?.completed,
              hasCost: ev.properties?.info?.cost != null,
            },
            '[opencode] queued event'
          )

          if (t === 'message.part.updated') {
            const part = ev.properties?.part
            if (!part) continue
            partLatest.set(part.id, opencodePartToCanonical(part))
            const order = partOrder.get(part.messageID) ?? []
            if (!order.includes(part.id)) order.push(part.id)
            partOrder.set(part.messageID, order)
            continue
          }

          if (t === 'message.updated') {
            const info = ev.properties?.info
            if (!info || info.role !== 'assistant') continue
            // 先提取 cost/tokens（第二条 message.updated 可能带最终消耗）
            if (typeof info.cost === 'number') cost = info.cost
            if (info.tokens) {
              tokens = {
                input: info.tokens.input ?? 0,
                output: info.tokens.output ?? 0,
                cache: {
                  read: info.tokens.cache?.read ?? 0,
                  write: info.tokens.cache?.write ?? 0,
                },
              }
            }
            // 再 yield：同一条消息只 yield 一次，避免前端出现重复回答
            if (yieldedMsgIds.has(info.id)) continue
            const order = partOrder.get(info.id) ?? []
            const parts = order.flatMap((id) => partLatest.get(id) ?? [])
            if (parts.length > 0) {
              yieldedMsgIds.add(info.id)
              yield { type: 'message', message: { id: info.id, role: 'assistant', parts } }
            }
            continue
          }

          if (
            t === 'session.idle' ||
            (t === 'session.status' && ev.properties?.status?.type === 'idle')
          ) {
            yield { type: 'done', cost, tokens }
            break
          }

          if (t === 'permission.updated') {
            const p = ev.properties
            yield {
              type: 'ask_user',
              questions: [
                {
                  question: p.title ?? 'Permission required',
                  header: p.type ?? 'permission',
                  options: [
                    { label: 'Allow', description: 'Allow this action' },
                    { label: 'Deny', description: 'Deny this action' },
                  ],
                  multiSelect: false,
                },
              ],
            }
            continue
          }
        }
      } finally {
        sessionQueues.delete(sessionId)
      }
    },

    abort(sessionId) {
      client.session.abort({ path: { id: sessionId } }).catch(() => {})
    },

    resolveApproval(sessionId, decision) {
      const permId = pendingPermissions.get(sessionId)
      if (!permId) return false
      pendingPermissions.delete(sessionId)
      ;(client as any).session
        .postSessionIdPermissionsPermissionId({
          path: { id: sessionId, permissionID: permId },
          body: { response: decision.behavior === 'allow' ? 'allow' : 'deny' },
        })
        .catch(() => {})
      return true
    },
  }

  return provider
}
