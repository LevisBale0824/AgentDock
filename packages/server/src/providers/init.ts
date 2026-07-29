import { logger } from '@/logger'
import { agentProcessManager } from './process-manager'
import { createOpenCodeProvider } from './opencode'
import { registerProvider } from './registry'
import type { AgentType } from './types'

interface AgentEntry {
  type: AgentType
  label: string
  enabledEnv: string
  baseUrlEnv: string
  cmdEnv: string
  portEnv: string
  defaultCmd: string
  agent?: string
  /** 默认 AI 模型（格式 providerID/modelID），可在环境变量 OPENCODE_MODEL_ID 中覆盖 */
  modelID?: string
}

const ENTRIES: AgentEntry[] = [
  {
    type: 'opencode',
    label: 'OpenCode',
    enabledEnv: 'OPENCODE_ENABLED',
    baseUrlEnv: 'OPENCODE_BASE_URL',
    cmdEnv: 'OPENCODE_CMD',
    portEnv: 'OPENCODE_PORT',
    defaultCmd: 'opencode',
    modelID: 'deepseek/deepseek-chat',  // 可用环境变量 OPENCODE_MODEL_ID 覆盖
  },
  {
    type: 'zero',
    label: 'Zero',
    enabledEnv: 'ZERO_ENABLED',
    baseUrlEnv: 'ZERO_BASE_URL',
    cmdEnv: 'ZERO_CMD',
    portEnv: 'ZERO_PORT',
    defaultCmd: 'zero',
  },
  {
    type: 'kilo',
    label: 'Kilo',
    enabledEnv: 'KILO_ENABLED',
    baseUrlEnv: 'KILO_BASE_URL',
    cmdEnv: 'KILO_CMD',
    portEnv: 'KILO_PORT',
    defaultCmd: 'kilo',
  },
]

export async function initProviders(): Promise<void> {
  for (const entry of ENTRIES) {
    const enabled = process.env[entry.enabledEnv] === 'true'
    const externalUrl = process.env[entry.baseUrlEnv]
    if (!enabled && !externalUrl) continue

    try {
      const portStr = process.env[entry.portEnv]
      const baseUrl =
        externalUrl ??
        (await agentProcessManager.spawn(entry.label.toLowerCase(), {
          cmd: process.env[entry.cmdEnv] ?? entry.defaultCmd,
          args: ['serve'],
          port: portStr ? parseInt(portStr) : undefined,
        }))
      // modelID 格式："providerID/modelID"，也支持 env 覆盖
      const modelStr = process.env[`${entry.type.toUpperCase()}_MODEL_ID`] ?? entry.modelID
      const model = modelStr
        ? (() => {
            const idx = modelStr.indexOf('/')
            if (idx > 0) return { providerID: modelStr.slice(0, idx), modelID: modelStr.slice(idx + 1) }
            return undefined
          })()
        : undefined
      registerProvider(
        createOpenCodeProvider({
          type: entry.type,
          label: entry.label,
          baseUrl,
          agent: entry.agent,
          model,
        }),
        entry.label
      )
      logger.info({ type: entry.type, label: entry.label, baseUrl }, 'provider registered')
    } catch (err) {
      logger.error({ entry: entry.label, err }, 'failed to init provider, skipping')
    }
  }
}
