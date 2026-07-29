// ---------------------------------------------------------------------------
// ClaudeProvider — 把 @anthropic-ai/claude-agent-sdk 包装成 AgentProvider
// ---------------------------------------------------------------------------
// 复用现有 agent.ts 的 query/权限/resume 逻辑，在输出处翻译成 Canonical 模型。
// 会话存储仍用 Claude CLI 原生的 ~/.claude/projects/<dir>/*.jsonl。
// ---------------------------------------------------------------------------

import {
  query,
  getSessionInfo,
  getSessionMessages,
  listSessions,
  renameSession,
} from '@anthropic-ai/claude-agent-sdk'
import fs from 'fs'
import path from 'path'
import { logger } from '@/logger'
import {
  CLAUDE_PROJECTS_DIR,
  getProjectDirName,
  getSessionFile,
  getRuntimeSession,
  getOrCreateRuntime,
  createPendingRuntime,
  assignSessionId,
  setPendingApproval,
  resolvePendingApproval,
  type RuntimeSession,
} from '@/store'
import type {
  AgentProvider,
  AgentOptions,
  ApprovalDecision,
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
import { AsyncQueue } from './queue'

// ── 把普通数组包装成 SDK 要求的 AsyncIterable ──────────────────────────────────
async function* arrayToAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) yield item
}

function buildSdkPrompt(content: IncomingBlock[], options: Record<string, unknown>) {
  if (content.length === 1 && content[0].type === 'text') {
    return { prompt: content[0].text, options }
  }
  const sdkContent = content.map((b) => {
    if (b.type === 'image') {
      return {
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: b.media_type, data: b.data },
      }
    }
    return { type: 'text' as const, text: b.text }
  })
  const userMessages = [
    {
      type: 'user' as const,
      message: { role: 'user' as const, content: sdkContent },
      parent_tool_use_id: null,
    },
  ]
  return { prompt: arrayToAsyncIterable(userMessages), options }
}

/** 构建 SDK options；onAskUser 仅流式模式传入 */
function buildOptions(
  runtime: RuntimeSession,
  bypassPermissions: boolean,
  agentOptions: AgentOptions,
  onAskUser?: (questions: unknown[]) => void
): Record<string, unknown> {
  const log = logger.child({ sessionId: (runtime.sessionId ?? 'new').slice(0, 12) })

  const canUseTool = async (toolName: string, input: any) => {
    if (toolName === 'AskUserQuestion') {
      log.info({ questions: (input.questions ?? []).length }, 'AskUserQuestion triggered')
      if (!onAskUser) {
        return { behavior: 'deny', message: 'AskUserQuestion is only supported in stream mode' }
      }
      return new Promise<any>((resolve) => {
        setPendingApproval(runtime.sessionId ?? '', resolve)
        onAskUser(input.questions ?? [])
      })
    }
    return { behavior: 'allow', updatedInput: input }
  }

  const {
    allowedTools,
    model,
    maxTurns,
    systemPrompt,
    maxBudgetUsd,
    effort,
    additionalDirectories,
    env,
    thinking,
  } = agentOptions

  const options: Record<string, unknown> = {
    cwd: runtime.cwd,
    allowedTools: allowedTools ?? [
      'Read',
      'Write',
      'Edit',
      'Glob',
      'Grep',
      'Bash',
      'AskUserQuestion',
    ],
    ...(runtime.sessionId ? { resume: runtime.sessionId } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(maxTurns !== undefined ? { maxTurns } : {}),
    ...(systemPrompt !== undefined ? { systemPrompt } : {}),
    ...(maxBudgetUsd !== undefined ? { maxBudgetUsd } : {}),
    ...(effort !== undefined ? { effort } : {}),
    ...(additionalDirectories?.length ? { additionalDirectories } : {}),
    ...(env !== undefined ? { env } : {}),
    ...(thinking !== undefined ? { thinking } : {}),
    // 安全相关放最后，不允许被覆盖
    ...(bypassPermissions ? { permissionMode: 'bypassPermissions' } : { canUseTool }),
    ...(runtime.abort ? { abortController: runtime.abort } : {}),
  }

  return options
}

// ── Claude 原生消息 → CanonicalMessage ────────────────────────────────────────
function claudeMessageToCanonical(message: any): CanonicalMessage | null {
  if (message.type !== 'assistant' && message.type !== 'user') return null
  const content: any[] = Array.isArray(message.message?.content) ? message.message.content : []
  const parts: CanonicalPart[] = []

  for (const block of content) {
    if (block.type === 'text' && block.text) {
      parts.push({ type: 'text', text: block.text })
    } else if (block.type === 'tool_use') {
      parts.push({ type: 'tool_call', id: block.id, tool: block.name, input: block.input })
    } else if (block.type === 'thinking') {
      parts.push({ type: 'reasoning', text: block.thinking ?? '' })
    } else if (block.type === 'redacted_thinking') {
      parts.push({ type: 'reasoning', text: '[redacted thinking]' })
    } else if (block.type === 'tool_result') {
      let text = ''
      const images: Array<{ mediaType: string; data: string }> = []
      if (typeof block.content === 'string') {
        text = block.content
      } else if (Array.isArray(block.content)) {
        for (const c of block.content) {
          if (c.type === 'text') text += c.text ?? ''
          else if (c.type === 'image' && c.source?.type === 'base64') {
            images.push({ mediaType: c.source.media_type, data: c.source.data })
          }
        }
      }
      parts.push({
        type: 'tool_result',
        id: block.tool_use_id,
        content: text,
        isError: block.is_error === true,
        images: images.length ? images : undefined,
      })
    } else if (block.type === 'image' && block.source?.type === 'base64') {
      parts.push({ type: 'image', mediaType: block.source.media_type, data: block.source.data })
    }
  }

  return { id: message.uuid ?? '', role: message.type, parts }
}

/** 从 result 消息提取 usage */
function extractUsage(message: any): { cost?: number; tokens?: TokenUsage } {
  const usage = message.usage ?? {}
  return {
    cost: typeof message.total_cost_usd === 'number' ? message.total_cost_usd : undefined,
    tokens: {
      input: usage.input_tokens ?? 0,
      output: usage.output_tokens ?? 0,
      cache: {
        read: usage.cache_read_input_tokens ?? 0,
        write: usage.cache_creation_input_tokens ?? 0,
      },
    },
  }
}

// ── ClaudeProvider 实现 ──────────────────────────────────────────────────────
const CAPABILITIES: BackendCapabilities = {
  sessions: true,
  sessionRename: true,
  sessionFork: false,
  sessionRevert: false,
  files: true,
  terminal: true,
  permissions: true,
  questions: true,
  todos: false,
  imageInput: true,
  diff: true,
  blocking: true,
}

export const claudeProvider: AgentProvider = {
  type: 'claude',
  capabilities: CAPABILITIES,

  // ── 会话生命周期 ──
  async getSession(sessionId, cwd) {
    const info = await getSessionInfo(sessionId, cwd ? { dir: cwd } : undefined)
    if (!info) return null
    const runtime = getRuntimeSession(sessionId)
    return {
      id: info.sessionId,
      title: info.summary,
      cwd: info.cwd ?? cwd ?? '',
      agent: 'claude',
      status: runtime?.status ?? 'idle',
      lastModified: info.lastModified,
      gitBranch: info.gitBranch,
    }
  },

  async listSessions(cwd) {
    const sessions = await listSessions({ dir: cwd })
    return sessions
      .map((s: any) => ({
        id: s.sessionId,
        title: s.summary,
        cwd: s.cwd ?? cwd,
        agent: 'claude' as const,
        status: getRuntimeSession(s.sessionId)?.status ?? ('idle' as const),
        lastModified: s.lastModified,
        gitBranch: s.gitBranch,
        createdAt: s.createdAt,
      }))
      .sort((a, b) => b.lastModified - a.lastModified)
  },

  async deleteSession(sessionId, cwd) {
    // 优先按 cwd 定位 .jsonl，否则全盘扫描
    const runtime = getRuntimeSession(sessionId)
    runtime?.abort?.abort()
    const dirName = cwd ? getProjectDirName(cwd) : runtime?.projectDirName
    if (dirName) {
      const file = getSessionFile(dirName, sessionId)
      if (fs.existsSync(file)) {
        fs.rmSync(file, { force: true })
        return true
      }
    }
    if (fs.existsSync(CLAUDE_PROJECTS_DIR)) {
      for (const entry of fs.readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const file = path.join(CLAUDE_PROJECTS_DIR, entry.name, `${sessionId}.jsonl`)
        if (fs.existsSync(file)) {
          fs.rmSync(file, { force: true })
          return true
        }
      }
    }
    return false
  },

  async renameSession(sessionId, title, cwd) {
    await renameSession(sessionId, title, cwd ? { dir: cwd } : undefined)
  },

  // ── 消息历史 ──
  async getMessages(sessionId, cwd, opts) {
    const messages = await getSessionMessages(sessionId, {
      dir: cwd,
      offset: opts?.offset ?? 0,
    })
    const result: CanonicalMessage[] = []
    for (const m of messages as any[]) {
      const canonical = claudeMessageToCanonical(m)
      if (canonical) result.push(canonical)
    }
    return result
  },

  // ── 阻塞模式 ──
  async runMessage(req: RunRequest): Promise<RunResult> {
    const log = logger.child({ sessionId: (req.sessionId ?? 'new').slice(0, 12) })
    log.info('claude run (blocking)')

    const runtime = req.sessionId
      ? getOrCreateRuntime(req.sessionId, req.cwd)
      : createPendingRuntime(req.cwd)
    runtime.status = 'busy'
    runtime.abort = new AbortController()

    const options = buildOptions(runtime, req.bypassPermissions, req.options)
    const messages: CanonicalMessage[] = []
    let cost: number | undefined
    let tokens: TokenUsage | undefined

    try {
      for await (const message of query(buildSdkPrompt(req.content, options))) {
        if (message.type === 'system' && message.session_id && !runtime.sessionId) {
          assignSessionId(runtime, message.session_id as string)
        }
        const canonical = claudeMessageToCanonical(message)
        if (canonical) messages.push(canonical)
        if (message.type === 'result' && (message as any).subtype === 'success') {
          const u = extractUsage(message)
          cost = u.cost
          tokens = u.tokens
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        log.info('claude aborted by user')
      } else {
        log.error({ err }, 'claude run error')
      }
      throw err
    } finally {
      runtime.status = 'idle'
      runtime.abort = null
    }

    return { sessionId: runtime.sessionId, messages, cost, tokens }
  },

  // ── 流式模式 ──
  async *streamMessage(req: RunRequest): AsyncIterable<ProviderEvent> {
    const log = logger.child({ sessionId: (req.sessionId ?? 'new').slice(0, 12) })
    log.info('claude run (stream)')

    const runtime = req.sessionId
      ? getOrCreateRuntime(req.sessionId, req.cwd)
      : createPendingRuntime(req.cwd)
    runtime.status = 'busy'
    runtime.abort = new AbortController()

    const queue = new AsyncQueue<ProviderEvent>()
    const onAskUser = (questions: unknown[]) => queue.push({ type: 'ask_user', questions })
    const options = buildOptions(runtime, req.bypassPermissions, req.options, onAskUser)

    let cost: number | undefined
    let tokens: TokenUsage | undefined

    // 生产者：消费 SDK 消息流，翻译后投递到 queue
    const producer = (async () => {
      try {
        for await (const message of query(buildSdkPrompt(req.content, options))) {
          if (message.type === 'system' && message.session_id && !runtime.sessionId) {
            assignSessionId(runtime, message.session_id as string)
            queue.push({ type: 'session_assigned', sessionId: message.session_id as string })
          }
          const canonical = claudeMessageToCanonical(message)
          if (canonical) queue.push({ type: 'message', message: canonical })
          if (message.type === 'result' && (message as any).subtype === 'success') {
            const u = extractUsage(message)
            cost = u.cost
            tokens = u.tokens
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          log.info('claude stream aborted by user')
          queue.push({ type: 'error', message: 'aborted' })
        } else {
          const errMsg = err instanceof Error ? err.message : String(err)
          log.error({ err }, `claude stream error: ${errMsg}`)
          queue.push({ type: 'error', message: errMsg })
        }
      } finally {
        runtime.status = 'idle'
        runtime.abort = null
        queue.push({ type: 'done', cost, tokens })
        queue.close()
      }
    })()

    // 消费者：把 queue 里的事件 yield 给路由层
    for await (const ev of queue) {
      yield ev
    }
    await producer
  },

  // ── 控制 ──
  abort(sessionId) {
    const runtime = getRuntimeSession(sessionId)
    runtime?.abort?.abort()
  },

  resolveApproval(sessionId, decision: ApprovalDecision) {
    return resolvePendingApproval(sessionId, decision)
  },
}
