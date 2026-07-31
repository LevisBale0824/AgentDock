// ---------------------------------------------------------------------------
// Canonical 消息模型 + AgentProvider 接口
// ---------------------------------------------------------------------------
// 所有 agent 后端（Claude / OpenCode / Zero）统一翻译成这套 Canonical 模型，
// 路由层和前端只依赖 Canonical + AgentType，不感知底层 SDK 差异。
// ---------------------------------------------------------------------------

export type AgentType = 'claude' | 'opencode' | 'zero' | 'kilo'

// ── Backend 能力声明（前端据此显隐 UI）─────────────────────────────────────
export interface BackendCapabilities {
  sessions: boolean
  sessionRename: boolean
  sessionFork: boolean
  sessionRevert: boolean
  files: boolean
  terminal: boolean
  permissions: boolean // human-in-the-loop 权限询问
  questions: boolean // AskUserQuestion
  todos: boolean
  imageInput: boolean // 支持图片输入
  diff: boolean // 支持 diff 视图
  blocking: boolean // 支持阻塞模式
}

// ── Canonical 消息 ──────────────────────────────────────────────────────────
export interface CanonicalMessage {
  id: string
  role: 'user' | 'assistant'
  parts: CanonicalPart[]
}

export type CanonicalPart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call'; id: string; tool: string; input: unknown }
  | {
      type: 'tool_result'
      id: string
      content: string
      isError?: boolean
      images?: Array<{ mediaType: string; data: string }>
    }
  | { type: 'image'; mediaType: string; data: string }
  | { type: 'step_start' }

// ── Canonical Session ───────────────────────────────────────────────────────
export interface CanonicalSession {
  id: string
  title: string
  cwd: string
  agent: AgentType
  status: 'idle' | 'busy'
  lastModified: number
  gitBranch?: string
  createdAt?: number
}

// ── Token 用量 ───────────────────────────────────────────────────────────────
export interface TokenUsage {
  input: number
  output: number
  cache: { read: number; write: number }
}

// ── 流式事件（provider 产出，路由层序列化为 SSE）────────────────────────────
export type ProviderEvent =
  | { type: 'session_assigned'; sessionId: string }
  | { type: 'message'; message: CanonicalMessage }
  | { type: 'ask_user'; questions: unknown[] }
  | { type: 'done'; cost?: number; tokens?: TokenUsage }
  | { type: 'error'; message: string }

// ── 客户端输入块 ─────────────────────────────────────────────────────────────
export type IncomingBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image'
      media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
      data: string
    }

// ── Agent 可选参数（安全无关字段，客户端可传）─────────────────────────────────
export interface AgentOptions {
  model?: string
  maxTurns?: number
  systemPrompt?: string
  allowedTools?: string[]
  maxBudgetUsd?: number
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  additionalDirectories?: string[]
  env?: Record<string, string>
  thinking?: { type: 'enabled'; budget_tokens: number }
}

// ── Slash 命令 / Skill（与 SDK 的 SlashCommand 对齐）─────────────────────────
// supportedCommands() 返回的统一列表：涵盖内置命令、自定义命令、skills、workflows
export interface SlashCommand {
  /** 名称（不含前导 /） */
  name: string
  /** 描述 */
  description: string
  /** 参数提示，如 "<file>" */
  argumentHint: string
}

// ── 运行请求 ─────────────────────────────────────────────────────────────────
export interface RunRequest {
  cwd: string
  /** null 表示新建会话；首条消息后由 session_assigned 事件给出真实 id */
  sessionId: string | null
  content: IncomingBlock[]
  bypassPermissions: boolean
  options: AgentOptions
}

// ── 阻塞运行结果 ─────────────────────────────────────────────────────────────
export interface RunResult {
  sessionId: string | null
  messages: CanonicalMessage[]
  cost?: number
  tokens?: TokenUsage
}

// ── 审批决策（回复 AskUserQuestion / 权限询问）──────────────────────────────
export interface ApprovalDecision {
  behavior: 'allow' | 'deny'
  updatedInput?: unknown
}

// ── AgentProvider 接口 ──────────────────────────────────────────────────────
export interface AgentProvider {
  readonly type: AgentType
  readonly capabilities: BackendCapabilities

  // ── 会话生命周期 ──
  getSession(sessionId: string, cwd?: string): Promise<CanonicalSession | null>
  listSessions(cwd: string): Promise<CanonicalSession[]>
  deleteSession(sessionId: string, cwd?: string): Promise<boolean>
  renameSession(sessionId: string, title: string, cwd?: string): Promise<void>

  // ── 消息历史 ──
  getMessages(
    sessionId: string,
    cwd: string,
    opts?: { offset?: number }
  ): Promise<CanonicalMessage[]>

  // ── 执行 ──
  /** 阻塞模式：等待 agent 完成后返回全部消息 */
  runMessage(req: RunRequest): Promise<RunResult>
  /** 流式模式：逐条产出事件，路由层负责序列化为 SSE */
  streamMessage(req: RunRequest): AsyncIterable<ProviderEvent>

  // ── 控制 ──
  abort(sessionId: string): void
  resolveApproval(sessionId: string, decision: ApprovalDecision): boolean

  // ── 发现 ──
  /** 列出当前 cwd 下可用的 slash 命令 / skills（可选；未实现则前端走兜底） */
  listCommands?(cwd: string): Promise<SlashCommand[]>
}
