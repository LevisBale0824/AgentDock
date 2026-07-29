// ---------------------------------------------------------------------------
// Provider Registry — 管理 agent 后端注册表与会话归属
// ---------------------------------------------------------------------------
// - getProvider(type)：按类型取 provider（新建会话时用）
// - resolveProvider(sessionId)：解析已有会话属于哪个 agent（兜底）
// - rememberSession：session_assigned 后缓存归属，避免重复探测
// ---------------------------------------------------------------------------

import type { AgentProvider, AgentType, BackendCapabilities } from './types'
import { claudeProvider } from './claude'

export interface ProviderInfo {
  type: AgentType
  label: string
  capabilities: BackendCapabilities
}

const providers = new Map<AgentType, AgentProvider>()
const labels = new Map<AgentType, string>()

// sessionId → agentType 缓存（已解析的归属）
const sessionAgentCache = new Map<string, AgentType>()

/** 注册一个 provider */
export function registerProvider(provider: AgentProvider, label: string): void {
  providers.set(provider.type, provider)
  labels.set(provider.type, label)
}

/** 列出所有已注册 provider 的元信息（给前端展示可选 agent）*/
export function listProviderInfos(): ProviderInfo[] {
  return [...providers.values()].map((p) => ({
    type: p.type,
    label: labels.get(p.type) ?? p.type,
    capabilities: p.capabilities,
  }))
}

/** 按 type 取 provider */
export function getProvider(type: AgentType): AgentProvider {
  const p = providers.get(type)
  if (!p) throw new Error(`Provider not registered: ${type}`)
  return p
}

/** 记住某个 session 属于哪个 agent（session_assigned 后调用）*/
export function rememberSession(sessionId: string, type: AgentType): void {
  sessionAgentCache.set(sessionId, type)
}

/**
 * 解析已有 session 属于哪个 provider。
 * 1. 查内存缓存
 * 2. miss → 并行探测各 provider.getSession，命中即缓存
 * 3. 都没命中 → 默认 claude（向后兼容）
 */
export async function resolveProvider(sessionId: string): Promise<AgentProvider> {
  const cached = sessionAgentCache.get(sessionId)
  if (cached) return getProvider(cached)

  for (const [type, provider] of providers) {
    try {
      const session = await provider.getSession(sessionId)
      if (session) {
        sessionAgentCache.set(sessionId, type)
        return provider
      }
    } catch {
      // 该 provider 不认这个 session，继续探测下一个
    }
  }

  // 兜底：默认 claude（保持与改造前行为一致）
  return getProvider('claude')
}

/** 供路由层在删除会话时清理缓存 */
export function forgetSession(sessionId: string): void {
  sessionAgentCache.delete(sessionId)
}

// ── 初始注册：阶段 2 只有 Claude；OpenCode / Zero 后续注册 ──
registerProvider(claudeProvider, 'Claude Code')
